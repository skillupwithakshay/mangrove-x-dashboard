#!/usr/bin/env python3
"""
fetch_instagram_data.py
-----------------------
Pulls Mangrove AI's Instagram analytics via the Instagram Graph API and writes
a clean, dashboard-ready JSON file to data/instagram_latest.json.

Requires an Instagram **Business or Creator** account linked to a Facebook
Page, plus a Meta app. The Graph API is the only way to get insights (reach,
views, demographics, per-post metrics) — the old Basic Display API was
deprecated and never exposed insights.

AUTH
Reads from environment variables:
  IG_ACCESS_TOKEN         # long-lived user token, or (recommended) a Meta
                          # System User token that never expires
  IG_BUSINESS_ACCOUNT_ID  # the IG user id (numeric), NOT the @handle
  IG_API_VERSION          # optional, defaults to v21.0
Get the token + account id with: python pipeline/instagram_token_setup.py

WHY SO MUCH ERROR TOLERANCE
Meta deprecates and renames insight metrics frequently (e.g. `impressions` ->
`views`, `plays` -> `views`, demographics reshaped). So every insight call is
OPTIONAL and soft-degrades: if a metric/endpoint is unavailable for this
account or API version, it's logged and skipped rather than failing the run.
The only FATAL errors are missing creds and a failed account fetch (which
means the token/id is wrong) — in that case the script exits non-zero WITHOUT
touching data/instagram_latest.json, so a bad run never overwrites good data.

OUTPUT  (data/instagram_latest.json)
{
  "last_updated": "...", "window_days": 30,
  "account": {id, username, name, biography, website, followers, follows,
              media_count, profile_picture},
  "summary": {reach, views, profile_views, website_clicks, accounts_engaged,
              total_interactions, likes, comments, saves, shares,
              avg_engagement_rate},
  "daily": [{date, reach, views}, ...],
  "demographics": {countries:[{name,value}], gender:[{name,value}],
                   age:[{name,value}]},
  "media": [{id, caption, type, permalink, timestamp, likes, comments, saves,
             shares, reach, views, engagement_rate, thumbnail}, ...]
}
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_instagram_data")

try:
    import requests
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)


def _load_env():
    """Load .env for local runs (GitHub Actions injects real env instead).
    Uses python-dotenv if installed, else a tiny built-in parser. Never
    overrides variables already set in the environment (so CI secrets win)."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    from pathlib import Path
    here = Path(__file__).resolve().parent
    for p in (Path.cwd() / ".env", here / ".env", here.parent / ".env"):
        try:
            if p.is_file():
                for line in p.read_text().splitlines():
                    s = line.strip()
                    if not s or s.startswith("#") or "=" not in s:
                        continue
                    k, v = s.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
                break
        except OSError:
            pass


_load_env()

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(HERE, "..", "data", "instagram_latest.json")

API_VERSION = os.getenv("IG_API_VERSION", "v21.0")
BASE = f"https://graph.facebook.com/{API_VERSION}"

WINDOW_DAYS = 30      # IG account "day" insights allow at most ~30 days/call
MAX_MEDIA = 30        # recent posts to pull per-post insights for


def get_config():
    token = os.getenv("IG_ACCESS_TOKEN")
    ig_id = os.getenv("IG_BUSINESS_ACCOUNT_ID")
    missing = [n for n, v in (("IG_ACCESS_TOKEN", token),
                              ("IG_BUSINESS_ACCOUNT_ID", ig_id)) if not v]
    if missing:
        log.error("Missing required environment variables: %s. See .env.example. "
                  "Run pipeline/instagram_token_setup.py to obtain them.",
                  ", ".join(missing))
        sys.exit(1)
    return token, ig_id


def _get(path, params, token, label, fatal=False):
    """GET a Graph API endpoint. Returns parsed json, or None on error.
    If fatal=True, a failure exits the process (used for the account fetch)."""
    params = dict(params or {})
    params["access_token"] = token
    try:
        resp = requests.get(f"{BASE}/{path}", params=params, timeout=20)
    except requests.RequestException as e:
        if fatal:
            log.error("Network error on %s: %s", label, e)
            sys.exit(1)
        log.warning("Network error on %s: %s — skipping.", label, e)
        return None
    if resp.ok:
        return resp.json()
    # Not OK
    detail = resp.text[:300]
    if fatal:
        log.error("%s failed (%s): %s", label, resp.status_code, detail)
        if resp.status_code in (400, 401, 190):
            log.error("This usually means the token is invalid/expired or the "
                      "account id is wrong, or the token lacks the required "
                      "permissions (instagram_basic, instagram_manage_insights, "
                      "pages_read_engagement). Re-run instagram_token_setup.py.")
        sys.exit(1)
    log.warning("%s not available (%s) — skipping. %s", label, resp.status_code, detail)
    return None


# ----------------------------------------------------------------------------
# Account (REQUIRED)
# ----------------------------------------------------------------------------
def fetch_account(token, ig_id):
    fields = ("username,name,biography,website,followers_count,follows_count,"
              "media_count,profile_picture_url")
    data = _get(ig_id, {"fields": fields}, token, "account fields", fatal=True)
    return {
        "id": ig_id,
        "username": data.get("username", ""),
        "name": data.get("name", data.get("username", "Instagram")),
        "biography": data.get("biography", ""),
        "website": data.get("website", ""),
        "followers": int(data.get("followers_count", 0) or 0),
        "follows": int(data.get("follows_count", 0) or 0),
        "media_count": int(data.get("media_count", 0) or 0),
        "profile_picture": data.get("profile_picture_url"),
    }


# ----------------------------------------------------------------------------
# Account insights (OPTIONAL, soft-degrade)
# ----------------------------------------------------------------------------
def fetch_daily_series(token, ig_id, since, until):
    """Day-by-day reach and views for the trend chart."""
    by_day = {}
    for metric in ("reach", "views"):
        body = _get(f"{ig_id}/insights",
                    {"metric": metric, "period": "day",
                     "since": since, "until": until},
                    token, f"daily {metric}")
        if not body or not body.get("data"):
            continue
        for point in body["data"][0].get("values", []):
            end = (point.get("end_time") or "")[:10]
            if not end:
                continue
            by_day.setdefault(end, {"date": end, "reach": 0, "views": 0})
            by_day[end][metric] = int(point.get("value", 0) or 0)
    return sorted(by_day.values(), key=lambda r: r["date"])


def fetch_totals(token, ig_id, since, until):
    """Window totals via metric_type=total_value. Tries a broad metric set,
    then falls back to querying each metric individually so one unsupported
    name doesn't drop the rest."""
    wanted = ["reach", "views", "profile_views", "website_clicks",
              "accounts_engaged", "total_interactions", "likes", "comments",
              "saves", "shares"]
    result = {}

    def query(metrics):
        return _get(f"{ig_id}/insights",
                    {"metric": ",".join(metrics), "metric_type": "total_value",
                     "period": "day", "since": since, "until": until},
                    token, f"totals [{','.join(metrics)}]")

    def parse(body):
        for item in (body or {}).get("data", []):
            name = item.get("name")
            tv = item.get("total_value") or {}
            if name and tv.get("value") is not None:
                result[name] = int(tv["value"])

    body = query(wanted)
    if body:
        parse(body)
    if not result:
        # Batch rejected — try metric-by-metric.
        for m in wanted:
            parse(query([m]))
    return result


def fetch_demographics(token, ig_id):
    """Follower demographics by country, gender and age. Requires >=100
    followers; unavailable accounts just yield empty lists."""
    out = {"countries": [], "gender": [], "age": []}
    breakdown_map = {"country": "countries", "gender": "gender", "age": "age"}
    for breakdown, key in breakdown_map.items():
        body = _get(f"{ig_id}/insights",
                    {"metric": "follower_demographics", "period": "lifetime",
                     "metric_type": "total_value", "breakdown": breakdown,
                     "timeframe": "last_30_days"},
                    token, f"demographics/{breakdown}")
        if not body or not body.get("data"):
            continue
        tv = body["data"][0].get("total_value") or {}
        breakdowns = tv.get("breakdowns") or []
        if not breakdowns:
            continue
        rows = []
        for res in breakdowns[0].get("results", []):
            dims = res.get("dimension_values") or []
            name = dims[0] if dims else "?"
            rows.append({"name": name, "value": int(res.get("value", 0) or 0)})
        rows.sort(key=lambda r: r["value"], reverse=True)
        out[key] = rows[:8]
    return out


# ----------------------------------------------------------------------------
# Media + per-post insights (OPTIONAL for insights, list is best-effort)
# ----------------------------------------------------------------------------
def fetch_media(token, ig_id, followers):
    fields = ("id,caption,media_type,media_product_type,permalink,timestamp,"
              "like_count,comments_count,thumbnail_url,media_url")
    body = _get(f"{ig_id}/media",
                {"fields": fields, "limit": MAX_MEDIA}, token, "media list")
    items = (body or {}).get("data", []) if body else []

    media = []
    for m in items[:MAX_MEDIA]:
        likes = int(m.get("like_count", 0) or 0)
        comments = int(m.get("comments_count", 0) or 0)
        ins = fetch_media_insights(token, m["id"], m.get("media_product_type"))
        reach = ins.get("reach")
        saves = ins.get("saved", ins.get("saves"))
        shares = ins.get("shares")
        views = ins.get("views", ins.get("plays", ins.get("impressions")))
        engagements = likes + comments + (saves or 0) + (shares or 0)
        denom = reach if reach else (followers or 0)
        caption = (m.get("caption") or "").replace("\n", " ").strip()
        media.append({
            "id": m["id"],
            "caption": caption[:180],
            "type": m.get("media_product_type") or m.get("media_type") or "",
            "permalink": m.get("permalink"),
            "timestamp": m.get("timestamp"),
            "likes": likes,
            "comments": comments,
            "saves": saves,
            "shares": shares,
            "reach": reach,
            "views": views,
            "engagement_rate": round((engagements / denom) * 100, 3) if denom else 0.0,
            "thumbnail": m.get("thumbnail_url") or m.get("media_url"),
        })
    media.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return media


def fetch_media_insights(token, media_id, product_type):
    """Per-post insights. Metric availability depends on media type, so we try
    a broad set and fall back to a minimal one."""
    broad = "reach,total_interactions,saved,shares,views,likes,comments"
    minimal = "reach"
    for metric in (broad, minimal):
        body = _get(f"{media_id}/insights", {"metric": metric}, token,
                    f"media {media_id} insights")
        if body and body.get("data"):
            out = {}
            for item in body["data"]:
                vals = item.get("values") or []
                if vals and vals[0].get("value") is not None:
                    out[item["name"]] = int(vals[0]["value"])
            if out:
                return out
    return {}


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    token, ig_id = get_config()
    log.info("Using Graph API %s", API_VERSION)

    log.info("Fetching account...")
    account = fetch_account(token, ig_id)
    log.info("Account: @%s (%s followers, %s posts)",
             account["username"], account["followers"], account["media_count"])

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=WINDOW_DAYS)
    since, until = int(start.timestamp()), int(end.timestamp())

    log.info("Fetching account insights (%d-day window)...", WINDOW_DAYS)
    daily = fetch_daily_series(token, ig_id, since, until)
    totals = fetch_totals(token, ig_id, since, until)
    demographics = fetch_demographics(token, ig_id)

    log.info("Fetching recent media + per-post insights...")
    media = fetch_media(token, ig_id, account["followers"])
    log.info("Pulled %d media items.", len(media))

    likes = totals.get("likes", sum(m["likes"] for m in media))
    comments = totals.get("comments", sum(m["comments"] for m in media))
    saves = totals.get("saves", sum((m["saves"] or 0) for m in media))
    shares = totals.get("shares", sum((m["shares"] or 0) for m in media))
    reach = totals.get("reach")
    total_interactions = totals.get("total_interactions",
                                    likes + comments + saves + shares)
    eng_rate = round((total_interactions / reach) * 100, 3) if reach else (
        round((total_interactions / account["followers"]) * 100, 3)
        if account["followers"] else 0.0)

    summary = {
        "reach": reach,
        "views": totals.get("views"),
        "profile_views": totals.get("profile_views"),
        "website_clicks": totals.get("website_clicks"),
        "accounts_engaged": totals.get("accounts_engaged"),
        "total_interactions": total_interactions,
        "likes": likes,
        "comments": comments,
        "saves": saves,
        "shares": shares,
        "avg_engagement_rate": eng_rate,
    }

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_days": WINDOW_DAYS,
        "account": account,
        "summary": summary,
        "daily": daily,
        "demographics": demographics,
        "media": media,
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %s (%d media, insights_metrics=%d)",
             os.path.abspath(OUTPUT_PATH), len(media), len(totals))


if __name__ == "__main__":
    main()
