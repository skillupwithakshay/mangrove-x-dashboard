# PR: HubSpot "Revenue Engine" — workflow wiring + dashboard panel

Branch: `feat/hubspot-revenue-engine` (off `main`). **Do not merge until reviewed.**

## Summary
Wires HubSpot CRM into the dashboard as a "Revenue engine" tab, using the tested
`fetch-hubspot.mjs` (repo root) as the single source. The script writes
`data/hubspot.json`; the daily GitHub Action refreshes it in place; the React panel
turns it into a CRM health / funnel / attribution story.

The token is referenced only as `${{ secrets.HUBSPOT_TOKEN }}` (env), and is never
printed, logged, or committed.

## What's included
- **Daily workflow step** (`.github/workflows/daily-refresh.yml`): `Fetch HubSpot CRM
  metrics` → `node fetch-hubspot.mjs`, `env: HUBSPOT_TOKEN: ${{ secrets.HUBSPOT_TOKEN }}`,
  `continue-on-error` (a HubSpot hiccup never blocks the other sources). Runs before the
  commit step, which now stages `data/hubspot.json`.
- **`data/hubspot.json`** — real, non-PII CRM aggregates from a local test run, committed
  so the panel renders immediately. Counts only (via the Search API `total` trick) — no
  contact records or PII are pulled.
- **Revenue engine tab** (`web/src/components/HubSpotPanel.jsx`), in priority order:
  1. **CRM health gauge** — `health.score` (34/100) with unowned / never-contacted /
     missing-email % beneath, and the **reactivation** callout (2,912 leads acquired but
     never contacted).
  2. **Closed-loop social** — monthly contacts acquired (`contacts.monthlyTrend`, bars)
     overlaid with monthly social engagement (line, from the social panels' daily series)
     + the social-sourced funnel, flagging that all 682 social-sourced contacts are stuck
     at Lead (0 → MQL/SQL/customer).
  3. **Pipeline** — deal value by stage (near-empty demo CRM; the note explains the gap).
  4. **Source breakdown** — contacts by original source, Paid social + Organic social highlighted.
  5. **Cost-per-contact by channel** — activates when an ad-spend source is added
     (spend ÷ contacts-by-source). No spend source is wired, so it's intentionally empty,
     not estimated.
- **Wiring**: `copy-data.js` treats `data/hubspot.json` as live committed data (no sample);
  `App.jsx` fetches `/data/hubspot.json` (camelCase); `snapshot_from_latest.py` banks
  hubspot contacts + health.score over time.
- **Retired** the earlier Python port to avoid two competing sources:
  `pipeline/fetch_hubspot_data.py`, `data/hubspot_latest.sample.json`,
  `web/public/data/hubspot_latest.json`.

## Data shape (`data/hubspot.json`)
`health{score,unowned,unownedPct,neverContacted,neverContactedPct,missingEmail,missingEmailPct,reactivationOpportunity}`,
`contacts{total,newLast30d,bySource{},funnel{},socialFunnel{},monthlyTrend:[{month,count}]}`,
`companies{total}`, `deals{total,wonCount,wonValue,openCount,openValue,byStage{id:{count,value}}}`,
`forms{total}`.

## Testing
- Production `vite build` passes; the tab renders from the committed real `data/hubspot.json`.

## Push + open the PR
```
git push -u origin feat/hubspot-revenue-engine
```
Open a PR into `main` on GitHub (paste this file as the description). Then run the daily
workflow once manually (Actions → Daily data refresh → Run workflow) to confirm the
`node fetch-hubspot.mjs` step succeeds with the `HUBSPOT_TOKEN` secret.
