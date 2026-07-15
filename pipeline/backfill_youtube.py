#!/usr/bin/env python3
"""
backfill_youtube.py  (Phase 2.1)
--------------------------------
One-off historical backfill of YouTube subscribers + views into the snapshot
store, using the YouTube Analytics API for the OWNED channel. Reconstructs the
cumulative subscriber curve by starting from today's known total and walking
backward, subtracting each day's net (subscribersGained - subscribersLost).

Auth: reuses the same OAuth creds as the daily pipeline (YOUTUBE_CLIENT_ID /
YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN) — the refresh token must have the
yt-analytics.readonly scope (the setup helper requests it).

Writes dated rows via save_snapshot (idempotent): youtube/subscribers and
youtube/views, one per day. Re-runnable.

  python pipeline/backfill_youtube.py
"""

import os
import sys
from datetime import datetime, timezone, date

from save_snapshot import save_snapshot

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    from pathlib import Path
    for p in (Path.cwd() / ".env", Path(__file__).resolve().parent.parent / ".env"):
        if p.is_file():
            for line in p.read_text().splitlines():
                s = line.strip()
                if s and not s.startswith("#") and "=" in s:
                    k, v = s.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            break

import requests  # noqa: E402

TOKEN_URL = "https://oauth2.googleapis.com/token"
DATA_API = "https://www.googleapis.com/youtube/v3"
ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports"


def access_token():
    r = requests.post(TOKEN_URL, data={
        "client_id": os.getenv("YOUTUBE_CLIENT_ID"),
        "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET"),
        "refresh_token": os.getenv("YOUTUBE_REFRESH_TOKEN"),
        "grant_type": "refresh_token",
    }, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    if not os.getenv("YOUTUBE_REFRESH_TOKEN"):
        print("Missing YOUTUBE_* creds in .env / env.", file=sys.stderr)
        sys.exit(1)
    tok = access_token()
    h = {"Authorization": f"Bearer {tok}"}

    ch = requests.get(f"{DATA_API}/channels", headers=h,
                      params={"part": "statistics,snippet", "mine": "true"}, timeout=20).json()
    item = (ch.get("items") or [None])[0]
    if not item:
        print("Could not resolve channel.", file=sys.stderr); sys.exit(1)
    current_subs = int(item["statistics"].get("subscriberCount", 0))
    start = item["snippet"]["publishedAt"][:10]
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rep = requests.get(ANALYTICS, headers=h, params={
        "ids": "channel==MINE", "startDate": start, "endDate": end,
        "metrics": "subscribersGained,subscribersLost,views",
        "dimensions": "day", "sort": "day",
    }, timeout=60).json()
    cols = [c["name"] for c in rep.get("columnHeaders", [])]
    rows = [dict(zip(cols, r)) for r in rep.get("rows", [])]
    if not rows:
        print("No analytics rows returned.", file=sys.stderr); sys.exit(1)

    # Reconstruct cumulative subscribers by walking backward from today's total.
    cum = [0] * len(rows)
    cum[-1] = current_subs
    for i in range(len(rows) - 2, -1, -1):
        nxt = rows[i + 1]
        net_next = int(nxt.get("subscribersGained", 0)) - int(nxt.get("subscribersLost", 0))
        cum[i] = cum[i + 1] - net_next

    out = []
    for i, r in enumerate(rows):
        day = r["day"]
        out.append({"platform": "youtube", "metric": "subscribers", "value": max(cum[i], 0), "date": day})
        out.append({"platform": "youtube", "metric": "views", "value": int(r.get("views", 0)), "date": day})

    n = save_snapshot(out)
    print(f"Backfilled {n} YouTube rows ({rows[0]['day']} → {rows[-1]['day']}), "
          f"reconstructed to today's {current_subs} subscribers.")


if __name__ == "__main__":
    main()
