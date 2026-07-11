#!/usr/bin/env python3
"""
fetch_youtube_data.py
---------------------
Pulls Mangrove AI's YouTube channel analytics and writes a clean,
dashboard-ready JSON file to data/youtube_latest.json.

Two Google APIs are used, both authenticated with the SAME OAuth 2.0
refresh token (see AUTH below):

  1. YouTube Data API v3   -> channel snapshot (subscribers, lifetime views,
                              video count) and the most recent uploads with
                              per-video public stats (views, likes, comments).
  2. YouTube Analytics API -> the deeper, owner-only metrics the public API
                              can't give: day-by-day views + watch time,
                              average view duration, impressions + CTR,
                              subscribers gained/lost, and traffic sources.

WHY OAuth (not just an API key):
An API key alone can read public channel/video stats, but the richer
analytics (watch time, impressions, traffic sources, subscriber gains) are
owner-only and require an OAuth token scoped to the channel. Using one OAuth
refresh token for BOTH APIs keeps the credential set to a single trio
(client id / client secret / refresh token) instead of key + OAuth.

AUTH
Reads OAuth 2.0 credentials from environment variables:
  YOUTUBE_CLIENT_ID
  YOUTUBE_CLIENT_SECRET
  YOUTUBE_REFRESH_TOKEN
Get the refresh token once by running: python pipeline/youtube_oauth_setup.py
(that script walks through the Google consent screen and prints the token).

OUTPUT
Writes data/youtube_latest.json shaped as:
{
  "last_updated": "2026-07-07T06:00:00Z",
  "analytics_available": true,          # false if OAuth lacks analytics scope
  "window_days": 90,
  "channel": {"id","title","handle","subscribers","total_views",
              "video_count","thumbnail"},
  "summary": {
    "views": N, "watch_time_hours": N, "avg_view_duration_sec": N,
    "avg_view_percentage": N, "impressions": N|null,
    "impressions_ctr": N|null, "subscribers_gained": N,
    "subscribers_lost": N, "net_subscribers": N, "likes": N,
    "comments": N, "shares": N, "avg_engagement_rate": N, "video_count": N
  },
  "daily": [{"date","views","watch_time_hours","engagements"}, ...],
  "traffic_sources": [{"source": "YT_SEARCH", "views": N}, ...],
  "videos": [
    {"id","title","date","views","likes","comments",
     "engagement_rate","thumbnail","url"}, ...
  ]
}

ERROR HANDLING
- Missing creds or a failed token exchange / Data-API call are FATAL: the
  script logs to stderr and exits non-zero WITHOUT touching
  data/youtube_latest.json, so a bad run never overwrites good data and the
  GitHub Action shows a failed run.
- Individual Analytics-API reports are treated as OPTIONAL: if one is denied
  or unavailable (e.g. impressions not exposed for this channel), it's logged
  and skipped rather than failing the whole run. The channel snapshot + video
  list from the Data API are always required.
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_youtube_data")

try:
    import requests
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(HERE, "..", "data", "youtube_latest.json")

DATA_API = "https://www.googleapis.com/youtube/v3"
ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports"
TOKEN_URL = "https://oauth2.googleapis.com/token"

WINDOW_DAYS = 90          # analytics look-back window
MAX_VIDEOS = 50           # recent uploads to pull per-video stats for


# ----------------------------------------------------------------------------
# Auth
# ----------------------------------------------------------------------------
def get_credentials():
    creds = {
        "client_id": os.getenv("YOUTUBE_CLIENT_ID"),
        "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET"),
        "refresh_token": os.getenv("YOUTUBE_REFRESH_TOKEN"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        log.error(
            "Missing required environment variables: %s. See .env.example. "
            "Run pipeline/youtube_oauth_setup.py to obtain a refresh token.",
            ", ".join(f"YOUTUBE_{m.upper()}" for m in missing),
        )
        sys.exit(1)
    return creds


def get_access_token(creds):
    """Exchange the long-lived refresh token for a short-lived access token."""
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "refresh_token": creds["refresh_token"],
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    if not resp.ok:
        log.error("Token refresh failed (%s): %s", resp.status_code, resp.text)
        log.error(
            "The refresh token may be revoked/expired, or the client "
            "id/secret is wrong. Re-run pipeline/youtube_oauth_setup.py."
        )
        sys.exit(1)
    token = resp.json().get("access_token")
    if not token:
        log.error("Token response had no access_token: %s", resp.text)
        sys.exit(1)
    return token


def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}"}


# ----------------------------------------------------------------------------
# Data API v3 — channel snapshot + recent videos (REQUIRED)
# ----------------------------------------------------------------------------
def fetch_channel(headers):
    resp = requests.get(
        f"{DATA_API}/channels",
        headers=headers,
        params={"part": "snippet,statistics,contentDetails", "mine": "true"},
        timeout=15,
    )
    if resp.status_code == 401:
        log.error("401 Unauthorized on channels.list. Body: %s", resp.text)
        log.error("Token is valid but rejected for this call — check the "
                  "OAuth scopes include youtube.readonly.")
        sys.exit(1)
    if not resp.ok:
        log.error("channels.list failed (%s): %s", resp.status_code, resp.text)
        sys.exit(1)

    items = resp.json().get("items") or []
    if not items:
        log.error("channels.list returned no channel for this account. Body: %s", resp.text)
        sys.exit(1)

    ch = items[0]
    snip = ch.get("snippet", {})
    stats = ch.get("statistics", {})
    uploads = (ch.get("contentDetails", {})
                 .get("relatedPlaylists", {})
                 .get("uploads"))
    thumbs = snip.get("thumbnails", {})
    thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
    handle = snip.get("customUrl", "")
    if handle and not handle.startswith("@"):
        handle = "@" + handle
    return {
        "id": ch["id"],
        "title": snip.get("title", "YouTube"),
        "handle": handle,
        "subscribers": int(stats.get("subscriberCount", 0)),
        "total_views": int(stats.get("viewCount", 0)),
        "video_count": int(stats.get("videoCount", 0)),
        "thumbnail": thumb,
        "uploads_playlist": uploads,
    }


def fetch_recent_video_ids(headers, uploads_playlist):
    ids = []
    page_token = None
    while len(ids) < MAX_VIDEOS and uploads_playlist:
        params = {
            "part": "contentDetails",
            "playlistId": uploads_playlist,
            "maxResults": min(50, MAX_VIDEOS - len(ids)),
        }
        if page_token:
            params["pageToken"] = page_token
        resp = requests.get(f"{DATA_API}/playlistItems", headers=headers,
                            params=params, timeout=15)
        if not resp.ok:
            log.error("playlistItems.list failed (%s): %s", resp.status_code, resp.text)
            sys.exit(1)
        body = resp.json()
        for it in body.get("items", []):
            vid = it.get("contentDetails", {}).get("videoId")
            if vid:
                ids.append(vid)
        page_token = body.get("nextPageToken")
        if not page_token:
            break
    return ids


def fetch_video_stats(headers, video_ids):
    videos = []
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i:i + 50]
        resp = requests.get(
            f"{DATA_API}/videos",
            headers=headers,
            params={"part": "snippet,statistics", "id": ",".join(chunk)},
            timeout=15,
        )
        if not resp.ok:
            log.error("videos.list failed (%s): %s", resp.status_code, resp.text)
            sys.exit(1)
        for v in resp.json().get("items", []):
            snip = v.get("snippet", {})
            stats = v.get("statistics", {})
            views = int(stats.get("viewCount", 0))
            likes = int(stats.get("likeCount", 0))
            comments = int(stats.get("commentCount", 0))
            engagements = likes + comments
            thumbs = snip.get("thumbnails", {})
            thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
            videos.append({
                "id": v["id"],
                "title": (snip.get("title") or "").strip(),
                "date": snip.get("publishedAt"),
                "views": views,
                "likes": likes,
                "comments": comments,
                "engagement_rate": round((engagements / views) * 100, 3) if views else 0.0,
                "thumbnail": thumb,
                "url": f"https://www.youtube.com/watch?v={v['id']}",
            })
    videos.sort(key=lambda x: x.get("date") or "", reverse=True)
    return videos


# ----------------------------------------------------------------------------
# Analytics API — owner-only metrics (OPTIONAL, soft-degrades)
# ----------------------------------------------------------------------------
def _analytics_query(headers, params, label):
    """Run one Analytics report. Returns parsed json or None (logged) on error."""
    resp = requests.get(ANALYTICS_API, headers=headers, params=params, timeout=20)
    if resp.status_code in (401, 403):
        log.warning("Analytics report '%s' not permitted (%s) — skipping. %s",
                    label, resp.status_code, resp.text[:200])
        return None
    if not resp.ok:
        log.warning("Analytics report '%s' failed (%s) — skipping. %s",
                    label, resp.status_code, resp.text[:200])
        return None
    return resp.json()


def fetch_analytics(headers, start_date, end_date):
    """Returns (summary_metrics_dict, daily_list, traffic_list). Any piece may
    be empty if that report is unavailable — never fatal."""
    summary = {}
    daily = []
    traffic = []

    # 1) Channel totals over the window.
    core = _analytics_query(headers, {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": ("views,estimatedMinutesWatched,averageViewDuration,"
                    "averageViewPercentage,subscribersGained,subscribersLost,"
                    "likes,comments,shares"),
    }, "totals")
    if core and core.get("rows"):
        cols = [h["name"] for h in core["columnHeaders"]]
        row = core["rows"][0]
        m = dict(zip(cols, row))
        mins = m.get("estimatedMinutesWatched", 0) or 0
        summary.update({
            "views": int(m.get("views", 0) or 0),
            "watch_time_hours": round(mins / 60, 1),
            "avg_view_duration_sec": int(m.get("averageViewDuration", 0) or 0),
            "avg_view_percentage": round(m.get("averageViewPercentage", 0) or 0, 1),
            "subscribers_gained": int(m.get("subscribersGained", 0) or 0),
            "subscribers_lost": int(m.get("subscribersLost", 0) or 0),
            "likes": int(m.get("likes", 0) or 0),
            "comments": int(m.get("comments", 0) or 0),
            "shares": int(m.get("shares", 0) or 0),
        })
        summary["net_subscribers"] = (summary["subscribers_gained"]
                                      - summary["subscribers_lost"])
        v = summary["views"]
        eng = summary["likes"] + summary["comments"] + summary["shares"]
        summary["avg_engagement_rate"] = round((eng / v) * 100, 3) if v else 0.0

    # 2) Impressions + CTR (separate report; not exposed for every channel).
    impr = _analytics_query(headers, {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "impressions,impressionClickThroughRate",
    }, "impressions")
    if impr and impr.get("rows"):
        cols = [h["name"] for h in impr["columnHeaders"]]
        m = dict(zip(cols, impr["rows"][0]))
        summary["impressions"] = int(m.get("impressions", 0) or 0)
        summary["impressions_ctr"] = round(m.get("impressionClickThroughRate", 0) or 0, 2)
    else:
        summary.setdefault("impressions", None)
        summary.setdefault("impressions_ctr", None)

    # 3) Day-by-day views + watch time for the trend chart.
    days = _analytics_query(headers, {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched,likes,comments,shares",
        "dimensions": "day",
        "sort": "day",
    }, "daily")
    if days and days.get("rows"):
        cols = [h["name"] for h in days["columnHeaders"]]
        for row in days["rows"]:
            m = dict(zip(cols, row))
            daily.append({
                "date": m.get("day"),
                "views": int(m.get("views", 0) or 0),
                "watch_time_hours": round((m.get("estimatedMinutesWatched", 0) or 0) / 60, 2),
                "engagements": int((m.get("likes", 0) or 0)
                                   + (m.get("comments", 0) or 0)
                                   + (m.get("shares", 0) or 0)),
            })

    # 4) Traffic sources (where views came from).
    ts = _analytics_query(headers, {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views",
        "dimensions": "insightTrafficSourceType",
        "sort": "-views",
        "maxResults": 10,
    }, "traffic_sources")
    if ts and ts.get("rows"):
        for row in ts["rows"]:
            traffic.append({"source": row[0], "views": int(row[1])})

    return summary, daily, traffic


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    creds = get_credentials()
    token = get_access_token(creds)
    headers = auth_headers(token)

    log.info("Fetching channel snapshot...")
    channel = fetch_channel(headers)
    log.info("Channel: %s (%s subscribers, %s lifetime views)",
             channel["title"], channel["subscribers"], channel["total_views"])

    log.info("Fetching recent videos...")
    video_ids = fetch_recent_video_ids(headers, channel.get("uploads_playlist"))
    videos = fetch_video_stats(headers, video_ids) if video_ids else []
    log.info("Pulled stats for %d videos.", len(videos))

    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=WINDOW_DAYS)
    log.info("Fetching analytics %s -> %s ...", start, end)
    summary, daily, traffic = fetch_analytics(headers, start.isoformat(), end.isoformat())
    analytics_available = bool(summary.get("views") is not None and daily)

    # If analytics were unavailable, fall back to per-video public stats so the
    # dashboard still shows meaningful totals rather than blanks.
    if not summary:
        log.warning("No analytics returned — falling back to public video totals.")
        v_views = sum(v["views"] for v in videos)
        v_likes = sum(v["likes"] for v in videos)
        v_comments = sum(v["comments"] for v in videos)
        eng = v_likes + v_comments
        summary = {
            "views": v_views, "watch_time_hours": None,
            "avg_view_duration_sec": None, "avg_view_percentage": None,
            "impressions": None, "impressions_ctr": None,
            "subscribers_gained": None, "subscribers_lost": None,
            "net_subscribers": None, "likes": v_likes, "comments": v_comments,
            "shares": None,
            "avg_engagement_rate": round((eng / v_views) * 100, 3) if v_views else 0.0,
        }
    summary["video_count"] = len(videos)

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "analytics_available": analytics_available,
        "window_days": WINDOW_DAYS,
        "channel": {
            "id": channel["id"],
            "title": channel["title"],
            "handle": channel["handle"],
            "subscribers": channel["subscribers"],
            "total_views": channel["total_views"],
            "video_count": channel["video_count"],
            "thumbnail": channel["thumbnail"],
        },
        "summary": summary,
        "daily": daily,
        "traffic_sources": traffic,
        "videos": videos,
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %s (analytics_available=%s)",
             os.path.abspath(OUTPUT_PATH), analytics_available)


if __name__ == "__main__":
    main()
