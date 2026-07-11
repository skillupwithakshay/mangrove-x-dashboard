#!/usr/bin/env python3
"""
fetch_x_data.py
----------------
Pulls Mangrove AI's X (Twitter) account analytics and writes a clean,
dashboard-ready JSON file to data/x_latest.json.

WHY RAW `requests` + OAuth1 (not tweepy):
This originally used tweepy, but in testing, tweepy's Client.get_users_tweets
returned a bare 401 Unauthorized against this account's credentials while an
identical GET /2/users/:id/tweets call made with plain `requests` +
`requests_oauthlib.OAuth1` succeeded and returned real data (confirmed with
diagnostics/check_get_tweets.py). Rather than chase a tweepy-specific auth
bug, the pipeline now uses the same minimal, proven-working request pattern
directly. This also drops a dependency.

AUTH
Reads OAuth 1.0a user-context credentials from environment variables:
  X_API_KEY
  X_API_SECRET
  X_ACCESS_TOKEN
  X_ACCESS_TOKEN_SECRET
Run diagnostics/check_x_auth.py first if you're not sure these work.

WHAT IT PULLS (the full analytics the X API exposes for an owned account):
  - Rich profile: followers, following, tweet/listed counts, verified, bio,
    profile image, location, account age.
  - Per-tweet public metrics: impressions, likes, reposts, replies, quotes,
    bookmarks — plus a permalink.
  - Organic / non-public metrics for recent tweets (last ~30 days), when the
    API returns them: url link clicks and profile clicks. This is a SEPARATE,
    soft-degrading enrichment pass — if the tier/endpoint doesn't return them
    it's skipped, never fatal.
  - Top hashtags across recent tweets.
  - A true follower-count time series: each run appends today's follower count
    to data/x_followers_history.json (committed by the daily Action) and the
    output embeds the accumulated history as `followers_history`. The X API
    has no historical-follower endpoint, so this snapshotting is the only way
    to chart follower growth over time.

OUTPUT  (data/x_latest.json) — existing fields are preserved; new fields added:
{
  "last_updated": "...",
  "account": {handle, name, followers_count, following_count, tweet_count,
              listed_count, verified, description, profile_image_url,
              location, created_at, url},
  "summary": {total_impressions, total_engagements, avg_engagement_rate,
              post_count, total_likes, total_reposts, total_replies,
              total_quotes, total_bookmarks,
              total_url_link_clicks|null, total_profile_clicks|null},
  "daily": [{date, impressions, engagements}, ...],
  "followers_history": [{date, followers}, ...],
  "top_hashtags": [{tag, count}, ...],
  "tweets": [{id, date, text, url, impressions, likes, reposts, replies,
              quotes, bookmarks, url_link_clicks|null, user_profile_clicks|null,
              engagements, engagement_rate}, ...]
}

ERROR HANDLING
Any REQUIRED failure (missing creds, auth error, rate limit on the core
calls) is logged to stderr and the script exits non-zero WITHOUT touching
data/x_latest.json, so a bad run never overwrites good data. The optional
organic-metrics enrichment soft-degrades (logged + skipped) so a metrics tier
limitation never fails the run.
"""

import os
import sys
import json
import logging
import time
from collections import Counter
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_x_data")

try:
    import requests
    from requests_oauthlib import OAuth1
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(HERE, "..", "data", "x_latest.json")
HISTORY_PATH = os.path.join(HERE, "..", "data", "x_followers_history.json")
MAX_POSTS = 100
MAX_HISTORY = 400            # cap follower-history length (~13 months daily)
ORGANIC_MAX_AGE_DAYS = 30    # X only returns non-public metrics for recent tweets
API_BASE = "https://api.x.com/2"


def get_credentials():
    creds = {
        "api_key": os.getenv("X_API_KEY"),
        "api_secret": os.getenv("X_API_SECRET"),
        "access_token": os.getenv("X_ACCESS_TOKEN"),
        "access_token_secret": os.getenv("X_ACCESS_TOKEN_SECRET"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        log.error(
            "Missing required environment variables: %s. "
            "See .env.example for the full list.",
            ", ".join(f"X_{m.upper()}" for m in missing),
        )
        sys.exit(1)
    return creds


def make_auth(creds):
    return OAuth1(
        creds["api_key"], creds["api_secret"],
        creds["access_token"], creds["access_token_secret"],
    )


def handle_error_response(resp, context):
    if resp.status_code == 401:
        log.error("401 Unauthorized on %s.", context)
        log.error("Body: %s", resp.text)
        log.error(
            "Credentials are being rejected for this specific call. Run "
            "diagnostics/check_get_tweets.py to see the exact response body "
            "and headers (including x-access-level) for this endpoint."
        )
        sys.exit(1)
    if resp.status_code == 429:
        reset = resp.headers.get("x-rate-limit-reset")
        log.error("429 Rate limited on %s. Resets at unix time %s.", context, reset)
        sys.exit(1)
    if not resp.ok:
        log.error("Unexpected %s on %s: %s", resp.status_code, context, resp.text)
        sys.exit(1)


RETRY_STATUS = {500, 502, 503, 504}


def get_with_retry(url, auth, params, context, retries=3, backoff=2):
    """GET with retry + exponential backoff on transient 5xx / network errors
    (e.g. a momentary 503). Returns the response; non-retryable statuses pass
    straight through to handle_error_response for normal handling."""
    resp = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, auth=auth, params=params, timeout=15)
        except requests.RequestException as e:
            log.warning("%s: network error (attempt %d/%d): %s", context, attempt, retries, e)
            resp = None
        else:
            if resp.status_code not in RETRY_STATUS:
                return resp
            log.warning("%s: transient %s (attempt %d/%d), retrying...",
                        context, resp.status_code, attempt, retries)
        if attempt < retries:
            time.sleep(backoff * attempt)   # 2s, 4s, ...
    if resp is None:
        log.error("%s: failed after %d attempts (network error).", context, retries)
        sys.exit(1)
    return resp


def fetch_account(auth):
    resp = get_with_retry(
        f"{API_BASE}/users/me",
        auth,
        {"user.fields": ("public_metrics,created_at,description,verified,"
                         "verified_type,profile_image_url,location,url")},
        "GET /2/users/me",
    )
    handle_error_response(resp, "GET /2/users/me")
    data = resp.json().get("data")
    if not data:
        log.error("Could not resolve the authenticated account. Body: %s", resp.text)
        sys.exit(1)
    pm = data.get("public_metrics", {})
    return {
        "id": data["id"],
        "username": data["username"],
        "name": data.get("name", data["username"]),
        "followers_count": pm.get("followers_count", 0),
        "following_count": pm.get("following_count", 0),
        "tweet_count": pm.get("tweet_count", 0),
        "listed_count": pm.get("listed_count", 0),
        "verified": bool(data.get("verified", False)),
        "verified_type": data.get("verified_type"),
        "description": data.get("description", ""),
        "profile_image_url": (data.get("profile_image_url") or "").replace("_normal", ""),
        "location": data.get("location", ""),
        "created_at": data.get("created_at"),
        "url": data.get("url", ""),
    }


def fetch_tweets(auth, user_id, username):
    rows = []
    next_token = None
    while len(rows) < MAX_POSTS:
        params = {
            "max_results": min(100, MAX_POSTS - len(rows)),
            "tweet.fields": "created_at,text,public_metrics,entities",
            "exclude": "retweets,replies",
        }
        if next_token:
            params["pagination_token"] = next_token

        resp = get_with_retry(
            f"{API_BASE}/users/{user_id}/tweets",
            auth,
            params,
            "GET /2/users/:id/tweets (get_users_tweets)",
        )
        handle_error_response(resp, "GET /2/users/:id/tweets (get_users_tweets)")

        body = resp.json()
        for tweet in body.get("data", []):
            pub = tweet.get("public_metrics", {})
            impressions = pub.get("impression_count", 0)
            likes = pub.get("like_count", 0)
            reposts = pub.get("retweet_count", 0)
            replies = pub.get("reply_count", 0)
            quotes = pub.get("quote_count", 0)
            bookmarks = pub.get("bookmark_count", 0)
            engagements = likes + reposts + replies + quotes + bookmarks
            hashtags = [h.get("tag") for h in
                        tweet.get("entities", {}).get("hashtags", []) if h.get("tag")]
            rows.append({
                "id": str(tweet["id"]),
                "date": tweet.get("created_at"),
                "text": (tweet.get("text") or "").replace("\n", " ").strip(),
                "url": f"https://x.com/{username}/status/{tweet['id']}",
                "impressions": impressions,
                "likes": likes,
                "reposts": reposts,
                "replies": replies,
                "quotes": quotes,
                "bookmarks": bookmarks,
                "url_link_clicks": None,
                "user_profile_clicks": None,
                "engagements": engagements,
                "engagement_rate": round((engagements / impressions) * 100, 3) if impressions else 0.0,
                "_hashtags": hashtags,
            })

        next_token = body.get("meta", {}).get("next_token")
        if not next_token:
            break

    return rows


def enrich_organic_metrics(auth, tweets):
    """OPTIONAL: pull url link clicks + profile clicks for recent tweets via
    organic/non-public metrics. Soft-degrades — any error just leaves those
    fields as None. X only exposes these for the authenticated user's own
    tweets from roughly the last 30 days."""
    now = datetime.now(timezone.utc)
    recent = []
    for t in tweets:
        if not t.get("date"):
            continue
        try:
            created = datetime.fromisoformat(t["date"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if (now - created).days <= ORGANIC_MAX_AGE_DAYS:
            recent.append(t)
    if not recent:
        return

    by_id = {t["id"]: t for t in recent}
    ids = list(by_id.keys())
    got = 0
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        resp = requests.get(
            f"{API_BASE}/tweets",
            auth=auth,
            params={"ids": ",".join(chunk),
                    "tweet.fields": "organic_metrics,non_public_metrics"},
            timeout=15,
        )
        if not resp.ok:
            log.warning("Organic-metrics enrichment unavailable (%s) — skipping. "
                        "url_link_clicks/user_profile_clicks will be null. %s",
                        resp.status_code, resp.text[:160])
            return
        for item in resp.json().get("data", []):
            metrics = item.get("organic_metrics") or item.get("non_public_metrics") or {}
            if not metrics:
                continue
            t = by_id.get(str(item.get("id")))
            if not t:
                continue
            if metrics.get("url_link_clicks") is not None:
                t["url_link_clicks"] = metrics.get("url_link_clicks")
            if metrics.get("user_profile_clicks") is not None:
                t["user_profile_clicks"] = metrics.get("user_profile_clicks")
            got += 1
    log.info("Organic metrics enriched %d/%d recent tweets.", got, len(recent))


def build_daily_series(tweets):
    by_day = {}
    for t in tweets:
        if not t["date"]:
            continue
        day = t["date"][:10]
        bucket = by_day.setdefault(day, {"date": day, "impressions": 0, "engagements": 0})
        bucket["impressions"] += t["impressions"]
        bucket["engagements"] += t["engagements"]
    return sorted(by_day.values(), key=lambda r: r["date"])


def build_top_hashtags(tweets, limit=12):
    counter = Counter()
    display = {}
    for t in tweets:
        for tag in t.get("_hashtags", []):
            key = tag.lower()
            counter[key] += 1
            display.setdefault(key, tag)
    return [{"tag": display[k], "count": c} for k, c in counter.most_common(limit)]


def build_summary(tweets):
    def s(field):
        return sum(t.get(field, 0) or 0 for t in tweets)
    total_impressions = s("impressions")
    total_engagements = s("engagements")
    link_clicks = [t["url_link_clicks"] for t in tweets if t.get("url_link_clicks") is not None]
    profile_clicks = [t["user_profile_clicks"] for t in tweets if t.get("user_profile_clicks") is not None]
    return {
        "total_impressions": total_impressions,
        "total_engagements": total_engagements,
        "avg_engagement_rate": round((total_engagements / total_impressions) * 100, 3) if total_impressions else 0.0,
        "post_count": len(tweets),
        "total_likes": s("likes"),
        "total_reposts": s("reposts"),
        "total_replies": s("replies"),
        "total_quotes": s("quotes"),
        "total_bookmarks": s("bookmarks"),
        "total_url_link_clicks": sum(link_clicks) if link_clicks else None,
        "total_profile_clicks": sum(profile_clicks) if profile_clicks else None,
    }


def update_follower_history(followers_count):
    """Append today's follower count to the persisted history file (dedupe by
    date; today's value overwrites an earlier same-day run). Returns the list.
    Missing/corrupt history just starts fresh rather than failing the run."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    history = []
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            if isinstance(loaded, list):
                history = [h for h in loaded if isinstance(h, dict) and h.get("date")]
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    history = [h for h in history if h.get("date") != today]
    history.append({"date": today, "followers": int(followers_count)})
    history.sort(key=lambda h: h["date"])
    history = history[-MAX_HISTORY:]

    try:
        os.makedirs(os.path.dirname(os.path.abspath(HISTORY_PATH)), exist_ok=True)
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except OSError as e:
        log.warning("Could not write follower history: %s", e)
    return history


def main():
    creds = get_credentials()
    auth = make_auth(creds)

    log.info("Fetching account info...")
    account = fetch_account(auth)
    log.info("Authenticated as @%s (%s followers, %s following, %s posts)",
             account["username"], account["followers_count"],
             account["following_count"], account["tweet_count"])

    log.info("Fetching recent tweets...")
    tweets = fetch_tweets(auth, account["id"], account["username"])
    if not tweets:
        log.warning("No tweets returned. Account may be new/empty, or all "
                     "recent posts were excluded (retweets/replies filtered out).")

    log.info("Enriching recent tweets with organic metrics (optional)...")
    enrich_organic_metrics(auth, tweets)

    followers_history = update_follower_history(account["followers_count"])
    top_hashtags = build_top_hashtags(tweets)

    # Strip internal-only helper field before serializing.
    for t in tweets:
        t.pop("_hashtags", None)

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "account": {
            "handle": f"@{account['username']}",
            "name": account["name"],
            "followers_count": account["followers_count"],
            "following_count": account["following_count"],
            "tweet_count": account["tweet_count"],
            "listed_count": account["listed_count"],
            "verified": account["verified"],
            "verified_type": account["verified_type"],
            "description": account["description"],
            "profile_image_url": account["profile_image_url"],
            "location": account["location"],
            "created_at": account["created_at"],
            "url": account["url"],
        },
        "summary": build_summary(tweets),
        "daily": build_daily_series(tweets),
        "followers_history": followers_history,
        "top_hashtags": top_hashtags,
        "tweets": tweets,
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %d tweets (%d follower-history points) -> %s",
             len(tweets), len(followers_history), os.path.abspath(OUTPUT_PATH))


if __name__ == "__main__":
    main()
