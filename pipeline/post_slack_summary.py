#!/usr/bin/env python3
"""
post_slack_summary.py
---------------------
Posts a growth-first daily summary to a Slack Incoming Webhook: blended audience
across the five social channels (PyPI kept separate as adoption), each channel's
30-day change, and current values. Reads the same trustworthy sources the
dashboard uses — data/snapshots.json for growth and data/<src>_latest.json for
current values — so Slack never reports numbers the dashboard wouldn't.

Gated + safe:
  - No SLACK_WEBHOOK_URL set  -> logs "skipped" and exits 0 (nothing posted).
  - --dry-run                 -> prints the Block Kit payload instead of sending.

SETUP: api.slack.com/apps -> Incoming Webhooks -> Add to Workspace -> copy the
URL into SLACK_WEBHOOK_URL (.env locally + GitHub secret). Optional DASHBOARD_URL.

USAGE
  python3 pipeline/post_slack_summary.py [--dry-run]
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("post_slack_summary")


def _load_env():
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
                    if s and not s.startswith("#") and "=" in s:
                        k, v = s.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
                break
        except OSError:
            pass


_load_env()

try:
    import requests
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "https://mangrove-x-dashboard.vercel.app")

PRIMARY = {"x": "followers", "youtube": "subscribers", "instagram": "followers",
           "tiktok": "followers", "linkedin": "followers"}
NAMES = {"x": "X", "youtube": "YouTube", "instagram": "Instagram",
         "tiktok": "TikTok", "linkedin": "LinkedIn"}
CURRENT_PATHS = {
    "x": ("x_latest.json", "account.followers_count"),
    "youtube": ("youtube_latest.json", "channel.subscribers"),
    "instagram": ("instagram_latest.json", "account.followers"),
    "tiktok": ("tiktok_latest.json", "account.followers"),
    "linkedin": ("linkedin_latest.json", "summary.followers"),
}


def fmt(n):
    if n is None:
        return "—"
    n = float(n); a = abs(n)
    if a >= 1e6: return f"{n / 1e6:.1f}".rstrip("0").rstrip(".") + "M"
    if a >= 1e3: return f"{n / 1e3:.1f}".rstrip("0").rstrip(".") + "K"
    return f"{int(round(n)):,}"


def _load(name):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _dig(d, path):
    cur = d
    for k in path.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def growth_30d(snapshots):
    """Per-platform {current, delta, pct} over 30 days from snapshots (live only)."""
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
    bykey = {}
    for r in snapshots or []:
        if r.get("metric") != PRIMARY.get(r.get("platform")):
            continue
        bykey.setdefault(r["platform"], []).append((r["date"], float(r["value"])))
    out = {}
    for p, rows in bykey.items():
        rows.sort()
        current = rows[-1][1]
        past = None
        for d, v in rows:
            if d <= cutoff:
                past = v
        if past is not None and past > 0:
            out[p] = {"current": current, "delta": current - past,
                      "pct": round((current - past) / past * 100, 1)}
        else:
            out[p] = {"current": current, "delta": None, "pct": None}
    return out


def build_payload():
    snaps = _load("snapshots.json") or []
    g = growth_30d(snaps)

    current = {}
    for p, (fname, path) in CURRENT_PATHS.items():
        d = _load(fname)
        v = _dig(d, path) if d else None
        if v is None and p == "linkedin" and d:
            v = _dig(d, "organization.followers")
        if v is None and p in g:
            v = g[p]["current"]
        if v is not None:
            current[p] = float(v)

    blended = sum(current.values()) if current else 0
    tracked = [p for p in g if g[p]["delta"] is not None]
    blended_delta = sum(g[p]["delta"] for p in tracked) if tracked else None

    lines = []
    for p in ["x", "youtube", "instagram", "tiktok", "linkedin"]:
        if p not in current:
            continue
        gg = g.get(p, {})
        if gg.get("pct") is not None:
            arrow = "▲" if gg["delta"] >= 0 else "▼"
            chg = f"{arrow} {fmt(abs(gg['delta']))} ({gg['pct']:+}% / 30d)"
        else:
            chg = "_tracking…_"
        lines.append(f"*{NAMES[p]}*: {fmt(current.get(p))}  {chg}")

    pypi = _load("pypi_latest.json")
    head_delta = ""
    if blended_delta is not None:
        head_delta = f"  ({'+' if blended_delta >= 0 else ''}{fmt(blended_delta)} / 30d)"

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": "Mangrove · social growth", "emoji": True}},
        {"type": "section", "text": {"type": "mrkdwn",
            "text": f"*Blended audience:* {fmt(blended)}{head_delta}\n_across {len(current)} of 5 channels · PyPI shown separately_"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines) or "_No live channels yet._"}},
    ]
    if pypi:
        blocks.append({"type": "context", "elements": [{"type": "mrkdwn",
            "text": f"*PyPI adoption*: {fmt(_dig(pypi, 'total'))} downloads · {pypi.get('window', 'rolling ~180 days')}"}]})
    blocks.append({"type": "context", "elements": [{"type": "mrkdwn",
        "text": f"<{DASHBOARD_URL}|Open the dashboard> · {datetime.now(timezone.utc):%Y-%m-%d}"}]})

    fallback = f"Mangrove social growth: blended audience {fmt(blended)}{head_delta}."
    return {"text": fallback, "blocks": blocks}


def main():
    dry = "--dry-run" in sys.argv or os.getenv("SLACK_DRY_RUN") == "1"
    payload = build_payload()
    if dry:
        log.info("DRY RUN — payload that would be sent:")
        print(json.dumps(payload, indent=2))
        return
    url = os.getenv("SLACK_WEBHOOK_URL")
    if not url:
        log.info("SLACK_WEBHOOK_URL not set — skipping Slack post (nothing sent).")
        return
    r = requests.post(url, json=payload, timeout=15)
    if not r.ok:
        log.error("Slack post failed (%s): %s", r.status_code, r.text)
        sys.exit(1)
    log.info("Posted growth summary to Slack.")


if __name__ == "__main__":
    main()
