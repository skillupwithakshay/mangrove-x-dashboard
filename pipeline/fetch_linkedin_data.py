#!/usr/bin/env python3
"""
fetch_linkedin_data.py
----------------------
Pulls Mangrove AI's LinkedIn **Company Page** analytics and writes a clean,
dashboard-ready JSON file to data/linkedin_latest.json.

SWAPPABLE DATA SOURCE
LinkedIn has no simple public analytics API, so this ships with a Selenium
scraper for now. It's built to be swapped for the official API later WITHOUT
touching the dashboard or this orchestrator — just implement
pipeline/linkedin_api.py and set the environment variable:

  LINKEDIN_SOURCE = selenium   (default) -> pipeline/linkedin_selenium.py
  LINKEDIN_SOURCE = api                   -> pipeline/linkedin_api.py

Both providers return the same dict shape (see either module), and this file
adds the timestamp, snapshots follower history, and writes the JSON.

⚠️  The Selenium provider scrapes LinkedIn, which is against LinkedIn's User
Agreement and can get the signed-in account restricted. It's also unreliable
from datacenter/CI IPs (login challenges). Prefer running it locally, and move
to LINKEDIN_SOURCE=api as soon as you have API access.

FOLLOWER HISTORY
Like the X pipeline, each run appends today's follower count to
data/linkedin_followers_history.json (committed by the daily Action) and embeds
the accumulated series as `followers_history` so the panel can chart growth.

OUTPUT  (data/linkedin_latest.json)
{
  "last_updated": "...",
  "source": "selenium" | "api",
  "window_days": 30,
  "organization": {name, url, followers, logo_url},
  "summary": {followers, follower_growth, unique_visitors, page_views,
              post_impressions, post_reactions, post_comments, post_shares,
              engagement_rate},
  "followers_history": [{date, followers}, ...],
  "daily": [{date, impressions, engagements}, ...],
  "posts": [{id, date, text, impressions, reactions, comments, shares,
             engagement_rate, url}, ...]
}

ERROR HANDLING
Provider failure is fatal: the error is logged and the script exits non-zero
WITHOUT touching data/linkedin_latest.json, so a failed scrape never overwrites
the last good file. (In the daily Action the LinkedIn step is continue-on-error
so this doesn't block the other sources.)
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_linkedin_data")

HERE = os.path.dirname(os.path.abspath(__file__))
# HERE is already on sys.path when run as `python pipeline/fetch_linkedin_data.py`,
# but add it explicitly so provider imports also work if imported elsewhere.
if HERE not in sys.path:
    sys.path.insert(0, HERE)

OUTPUT_PATH = os.path.join(HERE, "..", "data", "linkedin_latest.json")
HISTORY_PATH = os.path.join(HERE, "..", "data", "linkedin_followers_history.json")
WINDOW_DAYS = 30
MAX_HISTORY = 400


def get_provider():
    source = os.getenv("LINKEDIN_SOURCE", "selenium").strip().lower()
    if source == "api":
        from linkedin_api import ApiProvider
        log.info("Using LinkedIn provider: api")
        return "api", ApiProvider()
    if source == "selenium":
        from linkedin_selenium import SeleniumProvider
        log.info("Using LinkedIn provider: selenium (best-effort scraper)")
        return "selenium", SeleniumProvider()
    log.error("Unknown LINKEDIN_SOURCE=%r (expected 'selenium' or 'api').", source)
    sys.exit(1)


def update_follower_history(followers_count):
    """Append today's follower count (dedupe by date). Missing/corrupt history
    starts fresh. Returns the list. Skips gracefully if followers is None."""
    history = []
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            if isinstance(loaded, list):
                history = [h for h in loaded if isinstance(h, dict) and h.get("date")]
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    if followers_count is not None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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
    source, provider = get_provider()

    try:
        result = provider.fetch()
    except NotImplementedError as e:
        log.error(str(e))
        sys.exit(1)
    except Exception as e:
        log.error("LinkedIn %s provider failed: %s", source, e)
        log.error("data/linkedin_latest.json left untouched (last good file kept).")
        sys.exit(1)

    organization = result.get("organization") or {}
    summary = dict(result.get("summary") or {})
    followers = summary.get("followers") or organization.get("followers")

    followers_history = update_follower_history(followers)
    if len(followers_history) >= 2 and summary.get("follower_growth") is None:
        summary["follower_growth"] = (followers_history[-1]["followers"]
                                      - followers_history[0]["followers"])

    output = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "window_days": WINDOW_DAYS,
        "organization": organization,
        "summary": summary,
        "followers_history": followers_history,
        "daily": result.get("daily") or [],
        "posts": result.get("posts") or [],
    }

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info("Wrote %s (source=%s, followers=%s, %d history points)",
             os.path.abspath(OUTPUT_PATH), source, followers, len(followers_history))


if __name__ == "__main__":
    main()
