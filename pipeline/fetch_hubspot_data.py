#!/usr/bin/env python3
"""
fetch_hubspot_data.py
---------------------
Pulls Mangrove AI's HubSpot CRM into a "Revenue Engine" snapshot and writes
data/hubspot_latest.json — same pattern as the social fetchers.

AUTH
Reads a HubSpot private-app token from the environment:
  HUBSPOT_TOKEN
Never printed, logged, or written to disk. Required scopes: crm.objects.
contacts.read, crm.objects.companies.read, crm.objects.deals.read,
crm.schemas.deals.read (pipeline labels), and forms (optional).

WHAT IT PULLS (all via the HubSpot v3 REST API, https://api.hubapi.com)
  - CRM health: % unowned, % never-contacted, % missing-email, a composite
    health score, and the "reactivation opportunity" (leads acquired but never
    contacted).
  - Contacts by original source (hs_analytics_source), with Paid/Organic Social
    surfaced.
  - Lifecycle funnel (counts by lifecyclestage).
  - Social-sourced funnel: Paid + Organic Social contacts by lifecycle stage,
    so social → lead → MQL conversion is visible.
  - 6-month monthly acquisition trend (contacts created per month).
  - Companies total; deals value-by-stage; form count.

OUTPUT  (data/hubspot_latest.json)
{
  "last_updated": "...",
  "health": {"score", "unowned_pct", "never_contacted_pct", "missing_email_pct",
             "reactivation": {"count", "label"}},
  "contacts_total": N,
  "contacts_by_source": [{"source", "count"}],
  "lifecycle_funnel": [{"stage", "count"}],
  "social_funnel": [{"stage", "count"}],
  "monthly_trend": [{"month": "YYYY-MM", "contacts": N}],
  "companies_total": N,
  "deals": {"total": N, "total_value": N, "value_by_stage": [{"stage","count","value"}]},
  "forms_count": N | null
}

ERROR HANDLING
Missing token or a failed contacts fetch is FATAL (exits non-zero WITHOUT
touching the output file). Deals / companies / forms soft-degrade so one
missing scope doesn't blank the whole panel.
"""

import os
import sys
import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("fetch_hubspot_data")

try:
    import requests
except ImportError:
    log.error("Missing dependency. Run: pip install -r pipeline/requirements.txt")
    sys.exit(1)


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

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(HERE, "..", "data", "hubspot_latest.json")
BASE = "https://api.hubapi.com"
MAX_CONTACTS = 10000  # safety cap for the aggregate pull
MONTHS = 6

# hs_analytics_source enum -> friendly label
SOURCE_LABELS = {
    "ORGANIC_SEARCH": "Organic search", "PAID_SEARCH": "Paid search",
    "EMAIL_MARKETING": "Email", "SOCIAL_MEDIA": "Organic social",
    "PAID_SOCIAL": "Paid social", "REFERRALS": "Referrals",
    "DIRECT_TRAFFIC": "Direct", "OTHER_CAMPAIGNS": "Other campaigns",
    "OFFLINE": "Offline", "": "Unknown",
}
SOCIAL_SOURCES = {"PAID_SOCIAL", "SOCIAL_MEDIA"}
LIFECYCLE_ORDER = ["subscriber", "lead", "marketingqualifiedlead",
                   "salesqualifiedlead", "opportunity", "customer", "evangelist", "other"]
LIFECYCLE_LABELS = {
    "subscriber": "Subscriber", "lead": "Lead",
    "marketingqualifiedlead": "MQL", "salesqualifiedlead": "SQL",
    "opportunity": "Opportunity", "customer": "Customer",
    "evangelist": "Evangelist", "other": "Other",
}


def get_token():
    tok = os.getenv("HUBSPOT_TOKEN")
    if not tok:
        log.error("Missing HUBSPOT_TOKEN. See .env.example. (Private-app token from "
                  "HubSpot -> Settings -> Integrations -> Private Apps.)")
        sys.exit(1)
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def fetch_all_contacts(headers):
    """Paginate all contacts with the properties we aggregate on."""
    props = ["email", "lifecyclestage", "hubspot_owner_id",
             "hs_analytics_source", "notes_last_contacted", "createdate"]
    out, after = [], None
    while len(out) < MAX_CONTACTS:
        params = {"limit": 100, "properties": ",".join(props)}
        if after:
            params["after"] = after
        r = requests.get(f"{BASE}/crm/v3/objects/contacts", headers=headers, params=params, timeout=30)
        if r.status_code == 401:
            log.error("401 Unauthorized on contacts — check the token + scopes.")
            sys.exit(1)
        if not r.ok:
            log.error("contacts fetch failed (%s): %s", r.status_code, r.text[:200])
            sys.exit(1)
        body = r.json()
        out.extend(body.get("results", []))
        after = (body.get("paging", {}).get("next", {}) or {}).get("after")
        if not after:
            break
    return out


def search_total(headers, obj):
    """Total count of an object via the search API (limit=1)."""
    try:
        r = requests.post(f"{BASE}/crm/v3/objects/{obj}/search", headers=headers,
                          json={"limit": 1}, timeout=20)
        if r.ok:
            return r.json().get("total")
    except requests.RequestException:
        pass
    return None


def fetch_deal_stage_labels(headers):
    try:
        r = requests.get(f"{BASE}/crm/v3/pipelines/deals", headers=headers, timeout=20)
        if not r.ok:
            return {}
        labels = {}
        for pipe in r.json().get("results", []):
            for st in pipe.get("stages", []):
                labels[st["id"]] = st.get("label", st["id"])
        return labels
    except requests.RequestException:
        return {}


def fetch_deals(headers):
    labels = fetch_deal_stage_labels(headers)
    by_stage, after, total, total_value = defaultdict(lambda: {"count": 0, "value": 0.0}), None, 0, 0.0
    while True:
        params = {"limit": 100, "properties": "amount,dealstage"}
        if after:
            params["after"] = after
        r = requests.get(f"{BASE}/crm/v3/objects/deals", headers=headers, params=params, timeout=30)
        if not r.ok:
            log.warning("deals fetch unavailable (%s) — skipping.", r.status_code)
            return None
        body = r.json()
        for d in body.get("results", []):
            p = d.get("properties", {})
            stage = labels.get(p.get("dealstage"), p.get("dealstage") or "Unknown")
            amt = float(p.get("amount") or 0)
            by_stage[stage]["count"] += 1
            by_stage[stage]["value"] += amt
            total += 1
            total_value += amt
        after = (body.get("paging", {}).get("next", {}) or {}).get("after")
        if not after:
            break
    return {
        "total": total, "total_value": round(total_value, 2),
        "value_by_stage": sorted(
            [{"stage": s, "count": v["count"], "value": round(v["value"], 2)} for s, v in by_stage.items()],
            key=lambda x: -x["value"]),
    }


def fetch_forms_count(headers):
    try:
        r = requests.get(f"{BASE}/marketing/v3/forms", headers=headers, params={"limit": 100}, timeout=20)
        if r.ok:
            return len(r.json().get("results", []))
    except requests.RequestException:
        pass
    return None


def build(contacts):
    total = len(contacts)
    unowned = never = missing_email = 0
    by_source = Counter()
    lifecycle = Counter()
    social_lifecycle = Counter()
    monthly = Counter()
    reactivation = 0

    now = datetime.now(timezone.utc)
    month_keys = []
    y, m = now.year, now.month
    for _ in range(MONTHS):
        month_keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    month_set = set(month_keys)

    for c in contacts:
        p = c.get("properties", {})
        owner = (p.get("hubspot_owner_id") or "").strip()
        email = (p.get("email") or "").strip()
        contacted = (p.get("notes_last_contacted") or "").strip()
        stage = (p.get("lifecyclestage") or "other").strip() or "other"
        src = (p.get("hs_analytics_source") or "").strip()

        if not owner:
            unowned += 1
        if not email:
            missing_email += 1
        if not contacted:
            never += 1
        if not contacted and stage in ("lead", "subscriber", "marketingqualifiedlead"):
            reactivation += 1

        by_source[src] += 1
        lifecycle[stage if stage in LIFECYCLE_ORDER else "other"] += 1
        if src in SOCIAL_SOURCES:
            social_lifecycle[stage if stage in LIFECYCLE_ORDER else "other"] += 1

        cd = (p.get("createdate") or "")[:7]  # YYYY-MM
        if cd in month_set:
            monthly[cd] += 1

    pct = lambda n: round(n / total * 100, 1) if total else 0.0
    unowned_pct, never_pct, missing_pct = pct(unowned), pct(never), pct(missing_email)
    # Transparent composite: penalize unowned + never-contacted heavily, missing email lightly.
    score = round(max(0, 100 - 0.4 * unowned_pct - 0.4 * never_pct - 0.2 * missing_pct))

    return {
        "health": {
            "score": score, "unowned_pct": unowned_pct,
            "never_contacted_pct": never_pct, "missing_email_pct": missing_pct,
            "reactivation": {"count": reactivation,
                             "label": f"{reactivation} leads acquired but never contacted"},
        },
        "contacts_total": total,
        "contacts_by_source": sorted(
            [{"source": SOURCE_LABELS.get(s, s or "Unknown"), "raw": s, "count": n}
             for s, n in by_source.items()], key=lambda x: -x["count"]),
        "lifecycle_funnel": [{"stage": LIFECYCLE_LABELS[s], "count": lifecycle[s]}
                             for s in LIFECYCLE_ORDER if lifecycle[s]],
        "social_funnel": [{"stage": LIFECYCLE_LABELS[s], "count": social_lifecycle[s]}
                          for s in LIFECYCLE_ORDER if social_lifecycle[s]],
        "monthly_trend": [{"month": mk, "contacts": monthly.get(mk, 0)} for mk in reversed(month_keys)],
    }


def main():
    tok = get_token()
    headers = _auth(tok)

    log.info("Fetching contacts...")
    contacts = fetch_all_contacts(headers)
    log.info("Aggregating %d contacts...", len(contacts))
    out = build(contacts)

    log.info("Fetching companies / deals / forms...")
    out["companies_total"] = search_total(headers, "companies")
    out["deals"] = fetch_deals(headers) or {"total": 0, "total_value": 0.0, "value_by_stage": []}
    out["forms_count"] = fetch_forms_count(headers)
    out["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    out_dir = os.path.dirname(os.path.abspath(OUTPUT_PATH))
    os.makedirs(out_dir, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    log.info("Wrote %s (health=%s, contacts=%s, deals=%s)",
             os.path.abspath(OUTPUT_PATH), out["health"]["score"],
             out["contacts_total"], out["deals"]["total"])


if __name__ == "__main__":
    main()
