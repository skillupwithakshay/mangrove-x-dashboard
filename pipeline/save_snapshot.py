#!/usr/bin/env python3
"""
save_snapshot.py
----------------
Idempotent snapshot store (option B: JSON, no database). Banks one row per
(platform, metric, snapshot_date) into data/snapshots.json in long format:

  {"platform": "x", "metric": "followers", "value": 326,
   "date": "2026-07-11", "captured_at": "2026-07-11T10:37:01Z"}

`save_snapshot(rows)` upserts by (platform, metric, date) — re-running the same
day updates the value instead of duplicating (safe with the Action's retries).
Each row may carry an explicit `date` (used by the Phase 2 backfill scripts);
daily runs omit it and default to today (UTC).

This mirrors db/migrations/snapshots.sql, so moving to Postgres later is a
straight port.
"""

import os
import json
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOTS_PATH = os.path.join(HERE, "..", "data", "snapshots.json")

# Which metric is each platform's "audience" (aligned with the UI + growth lib).
PRIMARY_AUDIENCE = {
    "x": "followers",
    "youtube": "subscribers",
    "instagram": "followers",
    "tiktok": "followers",
    "linkedin": "followers",
}


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load():
    try:
        with open(SNAPSHOTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_snapshot(rows):
    """Upsert rows: [{platform, metric, value, date?}]. Returns count written."""
    rows = [r for r in (rows or []) if r and r.get("value") is not None]
    if not rows:
        return 0

    store = _load()
    index = {(r["platform"], r["metric"], r["date"]): i for i, r in enumerate(store)}
    now = _now_iso()

    for r in rows:
        date = r.get("date") or _today()
        val = r["value"]
        val = int(val) if isinstance(val, (int, float)) and float(val).is_integer() else val
        rec = {"platform": r["platform"], "metric": r["metric"],
               "value": val, "date": date, "captured_at": now}
        key = (r["platform"], r["metric"], date)
        if key in index:
            store[index[key]] = rec
        else:
            index[key] = len(store)
            store.append(rec)

    store.sort(key=lambda r: (r["platform"], r["metric"], r["date"]))
    os.makedirs(os.path.dirname(os.path.abspath(SNAPSHOTS_PATH)), exist_ok=True)
    with open(SNAPSHOTS_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
    return len(rows)


if __name__ == "__main__":
    # Tiny self-test (writes nothing meaningful).
    n = save_snapshot([{"platform": "_test", "metric": "_m", "value": 1}])
    print(f"save_snapshot OK ({n} row upserted to {os.path.abspath(SNAPSHOTS_PATH)})")
