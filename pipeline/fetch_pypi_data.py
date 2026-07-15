#!/usr/bin/env python3
"""
fetch_pypi_data.py
------------------
Pulls Mangrove AI's open-source PyPI download count and writes a clean,
dashboard-ready JSON file to data/pypi_latest.json.

SINGLE SOURCE OF TRUTH
By default this reads the founder's WordPress REST endpoint:
  https://mangrove.ai/wp-json/mangrove/v1/pypi-downloads
which is what powers the download number shown on mangrove.ai. Reading it
here means the dashboard number always matches the website number — one
source of truth, already cached server-side (2h transient), no drift.

The WordPress endpoint returns:
  {"total": N, "packages": {"pkg": N, ...}, "updated": "ISO8601"}

FALLBACK
If the WordPress endpoint is unreachable, this falls back to querying
pypistats.org directly for the same three packages and summing the
NON-MIRROR downloads — the identical logic the founder's PHP uses. This
keeps the dashboard working even if the WordPress site is briefly down.

WHAT THE NUMBER MEANS
pypistats' "overall" data covers only a rolling recent window (~180 days),
so this total is a ROLLING RECENT total, not lifetime downloads. The output
records this in the "window" field and the dashboard labels it honestly. If
a true lifetime figure is ever wanted, pepy.tech provides all-time totals.

OUTPUT
Writes data/pypi_latest.json shaped as:
{
  "last_updated": "2026-07-07T20:33:16Z",
  "total": 9160,
  "window": "rolling ~180 days",
  "source": "wordpress" | "pypistats",
  "upstream_updated": "2026-07-07T20:33:16+00:00",
  "packages": [
    {"name": "mangrove-kb", "downloads": 6043},
    {"name": "mangroveai", "downloads": 3117},
    {"name": "mangrovemarkets", "downloads": 0}
  ]
}

ERROR HANDLING
If both the WordPress endpoint AND the pypistats fallback fail, the script
logs to stderr and exits non-zero WITHOUT touching data/pypi_latest.json, so
a bad run never overwrites good data (same contract as fetch_x_data.py).
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_pypi_data")

try:
    import requests
except ImportError:
    log.error("Missing dependency 'requests'. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)


def _load_env():
    """Load .env for local runs (CI injects real env). python-dotenv if present,
    else a tiny parser; never overrides variables already set in the env."""
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

# Source of truth: the founder's WordPress endpoint (matches the website).
WORDPRESS_ENDPOINT = os.environ.get(
    "PYPI_WP_ENDPOINT",
    "https://mangrove.ai/wp-json/mangrove/v1/pypi-downloads",
)

# Fallback: query pypistats directly for these packages.
PACKAGES = ["mangrovemarkets", "mangroveai", "mangrove-kb"]

OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "pypi_latest.json"
)

WINDOW_LABEL = "rolling ~180 days"


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _packages_sorted(pkg_map):
    """Turn {name: downloads} into a list sorted high -> low."""
    return [
        {"name": name, "downloads": int(dl)}
        for name, dl in sorted(pkg_map.items(), key=lambda kv: -int(kv[1]))
    ]


def fetch_from_wordpress():
    """Read the founder's WordPress REST endpoint. Returns output dict or raises."""
    log.info("Fetching from WordPress endpoint: %s", WORDPRESS_ENDPOINT)
    res = requests.get(
        WORDPRESS_ENDPOINT,
        timeout=20,
        headers={"Accept": "application/json"},
    )
    res.raise_for_status()
    body = res.json()

    if "total" not in body or "packages" not in body:
        raise ValueError(f"Unexpected WordPress response shape: {body!r}")

    return {
        "last_updated": _now_iso(),
        "total": int(body["total"]),
        "window": WINDOW_LABEL,
        "source": "wordpress",
        "upstream_updated": body.get("updated"),
        "packages": _packages_sorted(body.get("packages", {})),
    }


def fetch_from_pypistats():
    """Fallback: sum non-mirror downloads per package straight from pypistats."""
    log.info("Falling back to pypistats.org for %d packages", len(PACKAGES))
    pkg_map = {}
    total = 0
    any_ok = False

    for pkg in PACKAGES:
        url = f"https://pypistats.org/api/packages/{pkg}/overall?mirrors=false"
        pkg_total = 0
        try:
            res = requests.get(url, timeout=20, headers={"Accept": "application/json"})
            res.raise_for_status()
            data = res.json().get("data", [])
            # Guard so mirror rows are never counted (matches the founder's PHP).
            pkg_total = sum(
                int(row["downloads"])
                for row in data
                if row.get("category") == "without_mirrors" and "downloads" in row
            )
            any_ok = True
        except Exception as e:  # noqa: BLE001
            log.warning("pypistats failed for %s: %s", pkg, e)
        pkg_map[pkg] = pkg_total
        total += pkg_total

    if not any_ok:
        raise RuntimeError("pypistats fallback failed for every package")

    return {
        "last_updated": _now_iso(),
        "total": total,
        "window": WINDOW_LABEL,
        "source": "pypistats",
        "upstream_updated": None,
        "packages": _packages_sorted(pkg_map),
    }


def main():
    output = None
    try:
        output = fetch_from_wordpress()
    except Exception as e:  # noqa: BLE001
        log.warning("WordPress endpoint failed (%s). Trying pypistats fallback...", e)
        try:
            output = fetch_from_pypistats()
        except Exception as e2:  # noqa: BLE001
            log.error("Both WordPress and pypistats failed: %s", e2)
            log.error("Leaving data/pypi_latest.json untouched.")
            sys.exit(1)

    out_path = os.path.abspath(OUTPUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    log.info(
        "Wrote total=%s (source=%s, %s) -> %s",
        output["total"], output["source"], output["window"], out_path,
    )


if __name__ == "__main__":
    main()
