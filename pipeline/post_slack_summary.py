#!/usr/bin/env python3
"""
post_slack_summary.py
-----------------------
Posts a short, formatted summary of the latest X analytics to Slack.

Reads data/x_latest.json (the file fetch_x_data.py writes) and sends a
Slack "Block Kit" message — a formatted card with headers and sections,
rather than a plain wall of text — to a Slack Incoming Webhook URL.

WHY AN INCOMING WEBHOOK (not a full Slack bot/app):
This only ever needs to post one-way into a single channel. An Incoming
Webhook is a single private URL with no OAuth, no bot user, and no scopes
to manage — the simplest thing that could work. If this later needs to do
more (react to messages, post to multiple channels dynamically, respond to
slash commands), that's a real Slack App with a bot token, but that's not
needed for "post a daily summary."

SETUP (one-time, in Slack)
  1. Go to https://api.slack.com/apps -> Create New App -> From scratch.
  2. Pick your workspace.
  3. In the app's settings, open "Incoming Webhooks" and toggle it on.
  4. Click "Add New Webhook to Workspace", choose the channel, and allow it.
  5. Copy the URL it gives you (looks like
     https://hooks.slack.com/services/T000/B000/xxxxxxxxxxxx) and set it as
     SLACK_WEBHOOK_URL (see .env.example / GitHub Secrets).

USAGE
  export SLACK_WEBHOOK_URL=...
  export DASHBOARD_URL=https://mangrove-x-dashboard.vercel.app   # optional
  python3 pipeline/post_slack_summary.py

Run this any time after fetch_x_data.py has written data/x_latest.json —
manually, or as a step in .github/workflows/daily-refresh.yml (already
wired up there, right after the data commit).

ERROR HANDLING
Missing webhook URL, missing/unreadable data file, or a failed POST to
Slack all log a clear error and exit non-zero. A failed Slack post does
NOT touch data/x_latest.json — this script only reads it.
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("post_slack_summary")

try:
    import requests
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "..", "data", "x_latest.json")


def fmt(n):
    if n is None:
        return "—"
    n = float(n)
    a = abs(n)
    if a >= 1_000_000:
        return f"{n / 1_000_000:.1f}".rstrip("0").rstrip(".") + "M"
    if a >= 1_000:
        return f"{n / 1_000:.1f}".rstrip("0").rstrip(".") + "K"
    return f"{int(round(n)):,}"


def load_data():
    if not os.path.exists(DATA_PATH):
        log.error("No data file at %s. Run pipeline/fetch_x_data.py first.", DATA_PATH)
        sys.exit(1)
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def top_tweet(tweets):
    if not tweets:
        return None
    return max(tweets, key=lambda t: t.get("impressions", 0))


def build_blocks(data, dashboard_url):
    account = data.get("account", {})
    summary = data.get("summary", {})
    tweets = data.get("tweets", [])
    last_updated = data.get("last_updated", "")

    top = top_tweet(tweets)

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"📊 {account.get('name', 'Mangrove')} · X Daily Update", "emoji": True},
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"{account.get('handle', '')} · data as of {last_updated}"}
            ],
        },
        {"type": "divider"},
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Followers*\n{fmt(account.get('followers_count'))}"},
                {"type": "mrkdwn", "text": f"*Total impressions*\n{fmt(summary.get('total_impressions'))}"},
                {"type": "mrkdwn", "text": f"*Avg engagement rate*\n{summary.get('avg_engagement_rate', 0):.2f}%"},
                {"type": "mrkdwn", "text": f"*Posts tracked*\n{summary.get('post_count', len(tweets))}"},
            ],
        },
    ]

    if top:
        text = (top.get("text") or "").strip()
        if len(text) > 200:
            text = text[:197] + "..."
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*Top post* ({fmt(top.get('impressions'))} impressions, "
                    f"{top.get('engagement_rate', 0):.2f}% ER)\n>{text}"
                ),
            },
        })

    if dashboard_url:
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"<{dashboard_url}|View the full dashboard>"}],
        })

    return blocks


def build_fallback_text(data):
    """Plain-text fallback shown in notifications/previews that don't render blocks."""
    account = data.get("account", {})
    summary = data.get("summary", {})
    return (
        f"{account.get('name', 'Mangrove')} X update: "
        f"{fmt(account.get('followers_count'))} followers, "
        f"{fmt(summary.get('total_impressions'))} impressions, "
        f"{summary.get('avg_engagement_rate', 0):.2f}% avg engagement rate."
    )


def post_to_slack(webhook_url, payload):
    resp = requests.post(webhook_url, json=payload, timeout=15)
    if resp.status_code != 200:
        log.error("Slack rejected the message: %s %s", resp.status_code, resp.text)
        sys.exit(1)


def main():
    dry_run = "--dry-run" in sys.argv or os.getenv("SLACK_DRY_RUN") == "1"
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")

    if not webhook_url and not dry_run:
        log.error(
            "Missing SLACK_WEBHOOK_URL environment variable. See .env.example. "
            "(Run with --dry-run to preview the message without a webhook.)"
        )
        sys.exit(1)

    dashboard_url = os.getenv("DASHBOARD_URL", "").strip()

    data = load_data()
    blocks = build_blocks(data, dashboard_url)
    payload = {"text": build_fallback_text(data), "blocks": blocks}

    if dry_run:
        log.info("DRY RUN — not posting to Slack. Payload that would be sent:")
        print(json.dumps(payload, indent=2))
        return

    post_to_slack(webhook_url, payload)
    log.info("Posted summary to Slack (%s).", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))


if __name__ == "__main__":
    main()
