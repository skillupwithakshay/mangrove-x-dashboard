#!/usr/bin/env python3
"""
fetch_tiktok_data.py
--------------------
Pulls Mangrove AI's TikTok account analytics via the TikTok API for Developers
(Display API + Login Kit) and writes a clean, dashboard-ready JSON file to
data/tiktok_latest.json.

AUTH
TikTok uses OAuth 2.0. Access tokens are short-lived (~24h), so the pipeline
exchanges a long-lived refresh token for a fresh access token on every run.
Reads from environment variables:
  TIKTOK_CLIENT_KEY
  TIKTOK_CLIENT_SECRET
  TIKTOK_REFRESH_TOKEN
Get the refresh token once with: python pipeline/tiktok_oauth_setup.py

WHAT IT PULLS
  - Account: display name, bio, avatar, verified flag, followers, following,
    total likes received, and video count (user.info.stats scope).
  - Recent videos with per-video stats: views, likes, comments, shares,
    duration, cover image and a share URL (video.list scope).
  - A views/engagement trend built by bucketing recent videos by publish date,
    plus overall totals and an average engagement rate.

Required scopes on the token: user.info.basic, user.info.profile,
user.info.stats, video.list.

OUTPUT  (data/tiktok_latest.json)
{
  "last_updated": "...",
  "account": {open_id, display_name, bio, avatar_url, profile_url,
              is_verified, followers, following, likes, video_count},
  "summary": {videos_analyzed, total_views, total_likes, total_comments,
              total_shares, avg_engagement_rate},
  "daily": [{date, views, engagements}, ...],
  "videos": [{id, title, date, views, likes, comments, shares,
              engagement_rate, duration, cover, url}, ...]
}

ERROR HANDLING
Missing creds, a failed token refresh, or a failed user/info call are FATAL:
logged to stderr, exit non-zero, and data/tiktok_latest.json is left
untouched. The video-list call soft-degrades (logged + skipped) so a transient
video API issue still yields an account snapshot rather than failing the run.
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_tiktok_data")

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
OUTPUT_PATH = os.path.join(HERE, "..", "data", "tiktok_latest.json")

API_BASE = "https://open.tiktokapis.com/v2"
TOKEN_URL = f"{API_BASE}/oauth/token/"
USER_FIELDS = ("open_id,union_id,avatar_url,display_name,bio_description,"
               "profile_deep_link,is_verified,follower_count,following_count,"
               "likes_count,video_count")
VIDEO_FIELDS = ("id,title,video_description,duration,cover_image_url,"
                "create_time,share_url,view_count,like_count,comment_count,"
                "share_count")
MAX_VIDEOS = 40


def get_credentials():
    creds = {
        "client_key": os.getenv("TIKTOK_CLIENT_KEY"),
        "client_secret": os.getenv("TIKTOK_CLIENT_SECRET"),
        "refresh_token": os.getenv("TIKTOK_REFRESH_TOKEN"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        log.error("Missing required environment variables: %s. See .env.example. "
                  "Run pipeline/tiktok_oauth_setup.py to obtain a refresh token.",
                  ", ".join(f"TIKTOK_{m.upper()}" for m in missing))
        sys.exit(1)
    return creds


def get_access_token(creds):
    resp = requests.post(TOKEN_URL, headers={
        "Content-Type": "application/x-www-form-urlencoded",
    }, data={
        "client_key": creds["client_key"],
        "client_secret": creds["client_secret"],
        "grant_type": "refresh_token",
        "refresh_token": creds["refresh_token"],
    }, timeout=20)
    if not resp.ok:
        log.error("Token refresh failed (%s): %s", resp.status_code, resp.text)
        log.error("The refresh token may be expired (they last ~365 days) or "
                  "the client key/secret is wrong. Re-run tiktok_oauth_setup.py.")
        sys.exit(1)
    body = resp.json()
    token = body.get("access_token")
    if not token:
        log.error("Token response had no access_token: %s", body)
        sys.exit(1)
    if body.get("refresh_token") and body["refresh_token"] != creds["refresh_token"]:
        log.info("TikTok rotated the refresh token. The current one still works "
                 "until its original ~365-day expiry; update the secret at your "
                 "convenience to reset the clock.")
    return token


def fetch_account(token):
    resp = requests.get(f"{API_BASE}/user/info/",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"fields": USER_FIELDS}, timeout=20)
    body = resp.json() if resp.content else {}
    err = (body.get("error") or {})
    if not resp.ok or err.get("code") not in (None, "ok"):
        log.error("user/info failed (%s): %s", resp.status_code, body)
        log.error("Check the token scopes include user.info.basic / "
                  "user.info.profile / user.info.stats.")
        sys.exit(1)
    user = (body.get("data") or {}).get("user") or {}
    if not user:
        log.error("user/info returned no user object: %s", body)
        sys.exit(1)
    return {
        "open_id": user.get("open_id"),
        "display_name": user.get("display_name", "TikTok"),
        "bio": user.get("bio_description", ""),
        "avatar_url": user.get("avatar_url"),
        "profile_url": user.get("profile_deep_link"),
        "is_verified": bool(user.get("is_verified", False)),
        "followers": int(user.get("follower_count", 0) or 0),
        "following": int(user.get("following_count", 0) or 0),
        "likes": int(user.get("likes_count", 0) or 0),
        "video_count": int(user.get("video_count", 0) or 0),
    }


def fetch_videos(token):
    videos = []
    cursor = None
    while len(videos) < MAX_VIDEOS:
        payload = {"max_count": min(20, MAX_VIDEOS - len(videos))}
        if cursor is not None:
            payload["cursor"] = cursor
        resp = requests.post(f"{API_BASE}/video/list/",
                            headers={"Authorization": f"Bearer {token}",
                                     "Content-Type": "application/json"},
                            params={"fields": VIDEO_FIELDS},
                            json=payload, timeout=20)
        body = resp.json() if resp.content else {}
        err = (body.get("error") or {})
        if not resp.ok or err.get("code") not in (None, "ok"):
            log.warning("video/list unavailable (%s) — skipping videos. %s",
                        resp.status_code, str(body)[:200])
            break
        data = body.get("data") or {}
        for v in data.get("videos", []):
            views = int(v.get("view_count", 0) or 0)
            likes = int(v.get("like_count", 0) or 0)
            comments = int(v.get("comment_count", 0) or 0)
            shares = int(v.get("share_count", 0) or 0)
            engagements = likes + comments + shares
            ts = v.get("create_time")
            date = (datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                    if ts else None)
            title = (v.get("title") or v.get("video_description") or "").replace("\n", " ").strip()
            videos.append({
                "id": str(v.get("id")),
                "title": title[:180],
                "date": date,
                "views": views,
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "engagement_rate": round((engagements / views) * 100, 3) if views else 0.0,
                "duration": v.get("duration"),
                "cover": v.get("cover_image_url"),
                "url": v.get("share_url"),
            })
        cursor = data.get("cursor")
        if not data.get("has_more") or cursor is None:
            break
    videos.sort(key=lambda x: x.get("date") or "", reverse=True)
    return videos


def build_daily_series(videos):
    by_day = {}
    for v in videos:
        if not v["date"]:
            continue
        b = by_day.setdefault(v["date"], {"date": v["date"], "views": 0, "engagements": 0})
        b["views"] += v["views"]
        b["engagements"] += v["likes"] + v["comments"] + v["shares"]
    return sorted(by_day.values(), key=lambda r: r["date"])


def build_summary(videos):
    total_views = sum(v["views"] for v in videos)
    total_likes = sum(v["likes"] for v in videos)
    total_comments = sum(v["comments"] for v in videos)
    total_shares = sum(v["shares"] for v in videos)
    engagements = total_likes + total_comments + total_shares
    return {
        "videos_analyzed": len(videos),
        "total_views": total_views,
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_shares": total_shares,
        "avg_engagement_rate": round((engagements / total_views) * 100, 3) if total_views else 0.0,
    }


def main():
    creds = get_credentials()
    token = get_access_token(creds)

    log.info("Fetching account...")
    account = fetch_account(token)
    log.info("Account: %s (%s followers, %s likes, %s videos)",
             account["display_name"], account["followers"],
             account["likes"], account["video_count"])

    log.info("Fetching recent videos...")
    videos = fetch_videos(token)
    log.info("Pulled %d videos.", len(videos))

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "account": account,
        "summary": build_summary(videos),
        "daily": build_daily_series(videos),
        "videos": videos,
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %s (%d videos)", os.path.abspath(OUTPUT_PATH), len(videos))


if __name__ == "__main__":
    main()
