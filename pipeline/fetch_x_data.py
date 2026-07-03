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

Run diagnostics/check_x_auth.py (and diagnostics/check_get_tweets.py if
that's not enough) first if you're not sure these work.

OUTPUT
Writes data/x_latest.json shaped as:
{
  "last_updated": "2026-07-02T06:00:00Z",
  "account": {"handle": "...", "name": "...", "followers_count": N},
  "summary": {
    "total_impressions": N, "total_engagements": N,
    "avg_engagement_rate": 0.0, "post_count": N
  },
  "daily": [{"date": "YYYY-MM-DD", "impressions": N, "engagements": N}, ...],
  "tweets": [
    {"id": "...", "date": "...", "text": "...", "impressions": N,
     "likes": N, "reposts": N, "replies": N, "bookmarks": N,
     "engagement_rate": 0.0}
  ]
}

ERROR HANDLING
Any failure (missing creds, auth error, rate limit, network error) is logged
to stderr and the script exits non-zero WITHOUT touching data/x_latest.json,
so a bad run never overwrites good data and the GitHub Action shows a failed
run instead of silently publishing empty/broken data.
"""

import os
import sys
import json
import logging
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
MAX_POSTS = 100
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


def fetch_account(auth):
    resp = requests.get(
        f"{API_BASE}/users/me",
        auth=auth,
        params={"user.fields": "public_metrics"},
        timeout=15,
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
    }


def fetch_tweets(auth, user_id):
    rows = []
    next_token = None
    while len(rows) < MAX_POSTS:
        params = {
            "max_results": min(100, MAX_POSTS - len(rows)),
            "tweet.fields": "created_at,text,public_metrics",
            "exclude": "retweets,replies",
        }
        if next_token:
            params["pagination_token"] = next_token

        resp = requests.get(
            f"{API_BASE}/users/{user_id}/tweets",
            auth=auth,
            params=params,
            timeout=15,
        )
        handle_error_response(resp, "GET /2/users/:id/tweets (get_users_tweets)")

        body = resp.json()
        for tweet in body.get("data", []):
            pub = tweet.get("public_metrics", {})
            impressions = pub.get("impression_count", 0)
            likes = pub.get("like_count", 0)
            reposts = pub.get("retweet_count", 0)
            replies = pub.get("reply_count", 0)
            bookmarks = pub.get("bookmark_count", 0)
            engagements = likes + reposts + replies + bookmarks
            rows.append({
                "id": str(tweet["id"]),
                "date": tweet.get("created_at"),
                "text": (tweet.get("text") or "").replace("\n", " ").strip(),
                "impressions": impressions,
                "likes": likes,
                "reposts": reposts,
                "replies": replies,
                "bookmarks": bookmarks,
                "engagements": engagements,
                "engagement_rate": round((engagements / impressions) * 100, 3) if impressions else 0.0,
            })

        next_token = body.get("meta", {}).get("next_token")
        if not next_token:
            break

    return rows


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


def build_summary(tweets):
    total_impressions = sum(t["impressions"] for t in tweets)
    total_engagements = sum(t["engagements"] for t in tweets)
    return {
        "total_impressions": total_impressions,
        "total_engagements": total_engagements,
        "avg_engagement_rate": round((total_engagements / total_impressions) * 100, 3) if total_impressions else 0.0,
        "post_count": len(tweets),
    }


def main():
    creds = get_credentials()
    auth = make_auth(creds)

    log.info("Fetching account info...")
    account = fetch_account(auth)
    log.info("Authenticated as @%s (%s followers)", account["username"], account["followers_count"])

    log.info("Fetching recent tweets...")
    tweets = fetch_tweets(auth, account["id"])
    if not tweets:
        log.warning("No tweets returned. Account may be new/empty, or all "
                     "recent posts were excluded (retweets/replies filtered out).")

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "account": {
            "handle": f"@{account['username']}",
            "name": account["name"],
            "followers_count": account["followers_count"],
        },
        "summary": build_summary(tweets),
        "daily": build_daily_series(tweets),
        "tweets": tweets,
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %d tweets -> %s", len(tweets), os.path.abspath(OUTPUT_PATH))


if __name__ == "__main__":
    main()
