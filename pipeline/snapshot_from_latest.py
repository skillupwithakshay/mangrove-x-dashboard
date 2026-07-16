#!/usr/bin/env python3
"""
snapshot_from_latest.py
-----------------------
Banks today's snapshot rows from the already-fetched data/<src>_latest.json
files (does NOT re-fetch), plus ingests the accumulated follower-history files
so X and LinkedIn carry their real dated history into the snapshot store.

Only reads *_latest.json (the live outputs) — never *.sample.json — so a source
whose live fetch didn't run is simply skipped, and fabricated sample values are
never banked as real history.

Run at the end of the daily refresh (after all fetch_*_data.py). Idempotent.
"""

import os
import json
from save_snapshot import save_snapshot

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def _load(name):
    p = os.path.join(DATA, name)
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _dig(d, path, default=None):
    cur = d
    for k in path.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def main():
    rows = []

    # --- today's values from each live *_latest.json (skip missing) ---
    specs = [
        ("x_latest.json", [("x", "followers", "account.followers_count"),
                            ("x", "impressions", "summary.total_impressions"),
                            ("x", "engagements", "summary.total_engagements")]),
        ("youtube_latest.json", [("youtube", "subscribers", "channel.subscribers"),
                                 ("youtube", "views", "summary.views")]),
        ("instagram_latest.json", [("instagram", "followers", "account.followers"),
                                   ("instagram", "reach", "summary.reach")]),
        ("tiktok_latest.json", [("tiktok", "followers", "account.followers"),
                                ("tiktok", "views", "summary.total_views")]),
        ("linkedin_latest.json", [("linkedin", "followers", "summary.followers"),
                                  ("linkedin", "impressions", "summary.post_impressions")]),
        ("pypi_latest.json", [("pypi", "downloads", "total")]),
        ("hubspot.json", [("hubspot", "contacts", "contacts.total"),
                          ("hubspot", "health_score", "health.score")]),
    ]
    for fname, metrics in specs:
        d = _load(fname)
        if not d:
            continue
        for platform, metric, path in metrics:
            v = _dig(d, path)
            if v is None and platform == "linkedin" and metric == "followers":
                v = _dig(d, "organization.followers")
            if v is not None:
                rows.append({"platform": platform, "metric": metric, "value": v})

    # --- ingest real dated follower histories (idempotent) ---
    for fname, platform in (("x_followers_history.json", "x"),
                            ("linkedin_followers_history.json", "linkedin")):
        hist = _load(fname)
        if isinstance(hist, list):
            for h in hist:
                if h.get("date") and h.get("followers") is not None:
                    rows.append({"platform": platform, "metric": "followers",
                                 "value": h["followers"], "date": h["date"]})

    n = save_snapshot(rows)
    print(f"Banked {n} snapshot rows.")


if __name__ == "__main__":
    main()
