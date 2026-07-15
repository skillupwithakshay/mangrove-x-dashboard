# v2 rebuild — QA notes & owner runbook

Growth-first, trustworthy dashboard. Built on the actual stack (Vite/React SPA +
Python pipelines + GitHub Actions + committed JSON) — **option B** (no database).
One section per phase with what changed and how it was verified.

## Phase 0 — provenance audit
- `docs/data-provenance-audit.md` (report only, no code). Classified every metric;
  found the silent sample→real fallback (YouTube, LinkedIn) as the key risk.

## Phase 1 — snapshot data layer
- `pipeline/save_snapshot.py` — idempotent upsert into `data/snapshots.json`
  (long format: platform/metric/value/date), optional explicit date for backfill.
- `pipeline/snapshot_from_latest.py` — banks today's values from live `*_latest.json`
  (never samples) + ingests `*_followers_history.json`.
- `db/migrations/snapshots.sql` — for a future Postgres move (unused in option B).
- Workflow: added "Bank daily snapshots" step + `data/snapshots.json` to the commit.
- **QA:** ran `snapshot_from_latest.py` → wrote 8 rows (x/ig/tiktok/pypi today);
  re-run updates in place (unique key), not duplicated.

## Phase 2 — historical backfill (owner-run)
- `pipeline/backfill_youtube.py` — Analytics API daily subs/views → cumulative curve
  reconstructed from today's total. **QA:** compiles; couldn't run here (sandbox
  can't reach Google). Run locally: `python3 pipeline/backfill_youtube.py`.
- `pipeline/backfill_pypi.py` — BigQuery `pypi.file_downloads`, mirror-excluded,
  same 3 packages. Needs GCP + billing: `GCP_PROJECT=… python3 pipeline/backfill_pypi.py`.
- `pipeline/ingest_linkedin_export.py` — parses the Page admin follower export
  (.xlsx/.csv) → dated snapshots. `python3 pipeline/ingest_linkedin_export.py file`.
- X / Instagram / TikTok: **not backfillable** — the UI shows "tracking since [date]",
  never fabricated history.

## Phase 3 — compute
- `web/src/lib/growth.js` — current/past/delta/growth %, `lowBase` (base < 50),
  `firstTracked`, blended audience (5 channels, PyPI excluded), indexed series.
- `web/src/lib/insight.js` — deterministic one-liner; excludes low-base channels.
- **QA:** `web/scripts/test-growth.mjs` — asserts growth %, low-base flag, blended
  total (PyPI excluded), untracked-when-predating-data, insight string. All pass.

## Trust labelling
- `web/scripts/copy-data.js` writes `public/data/_manifest.json` = live|sample|missing
  per source. UI shows a SAMPLE badge (tabs + matrix) + banner, a Sandbox note on
  TikTok, and per-source freshness. No mock value renders as real.

## Phase 4 — growth-first UI
- Tabbed app (Overview + per-platform). Overview: blended audience KPI + period
  growth, PyPI shown separately as adoption, one global 7D/30D/6M/1Y control,
  growth matrix (heatmap, low-base greyed, tracking-since), auto-insight, and an
  indexed-to-100 comparable chart. "Download / print" for a one-page snapshot.
- **QA:** production build passes; bundle contains the blended KPI, growth matrix,
  indexed chart, SAMPLE/tracking-since/Sandbox labels.

## Owner runbook (to finish going live)
1. `python3 pipeline/backfill_youtube.py` (uses existing YOUTUBE_* creds).
2. GCP: enable BigQuery + billing, `pip install google-cloud-bigquery`, then
   `GCP_PROJECT=<proj> python3 pipeline/backfill_pypi.py --days 365`.
3. Export LinkedIn Page followers-over-time → `python3 pipeline/ingest_linkedin_export.py <file>`.
4. Commit + push (incl. `data/snapshots.json`) and run the workflow. Daily runs then
   bank history so 7D/30D fill immediately and 6M/1Y fill in as days accrue.
5. Durability: swap Instagram to a Meta System User token (never expires); promote
   the TikTok app from Sandbox to production for real public figures.

## Suggested PR split (one per phase)
- PR1 data layer: `db/migrations/snapshots.sql`, `pipeline/save_snapshot.py`,
  `pipeline/snapshot_from_latest.py`, workflow + `copy-data.js` manifest.
- PR2 backfill: `pipeline/backfill_*.py`, `pipeline/ingest_linkedin_export.py`.
- PR3 compute: `web/src/lib/growth.js`, `web/src/lib/insight.js`, `web/scripts/test-growth.mjs`.
- PR4 UI: `App.jsx`, `components/OverviewTab.jsx`, `components/GrowthMatrix.jsx`,
  `components/PeriodTabs.jsx`, panel link/subline/period changes.
