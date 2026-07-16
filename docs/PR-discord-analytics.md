# PR: Community Intelligence (Discord) + Acquisition funnel scaffold

Branch: `feat/discord-analytics` (off `main`). **Do not merge until reviewed.**

## Summary
Adds two standalone tabs to the dashboard, following the existing pattern (a daily
GitHub Action writes a JSON file; the React tab reads it at runtime, falling back to a
committed sample):

- **Community** — an advanced Discord analytics tab (not a status page): community
  health score, growth analytics, engagement depth, channel intelligence, retention
  cohorts, and role distribution.
- **Acquisition** — a Phase-2 scaffold for GA4 + the full community-to-revenue funnel,
  built to *receive* data honestly (pending stages are greyed with the specific
  instrumentation they need) rather than fake certainty.

Tokens are referenced only as `${{ secrets.DISCORD_BOT_TOKEN }}` / `${{ secrets.DISCORD_GUILD_ID }}`
and are never printed, logged, or committed. Every time-series renders gracefully with as
little as 1–2 days of data and improves as daily snapshots accumulate.

## Phase 1 — Community Intelligence (built now, against sample data)
`data/discord.sample.json` defines the richer contract the real `fetch-discord.mjs` will emit:
`server`, `growth{memberSnapshots,joins[],leaves[],joins30d,leaves30d,netGrowth30d,churnRate30d}`,
`engagement{activeMembers7d/30d,stickiness,messagesPerDay[],postingMembersPerDay[],participationRate,topContributorsConcentration}`,
`channels[{…,messages7d,activeAuthors7d}]`, `roles`, `retention{cohorts[],note}`.

Tab sections (`DiscordPanel.jsx`):
1. **Community health** — a computed 0–100 score (stickiness 40% / participation 35% /
   growth health 25%) with a one-line driver explanation, plus member/online/humans-bots/boost cards.
2. **Growth analytics** — member trend, joins-vs-leaves diverging bars, net growth + churn,
   7d/30d growth-rate percentages.
3. **Engagement depth** — stickiness (DAU/MAU-style) and participation with plain-English reads,
   messages- & posting-members-per-day trends, and a contributor-concentration indicator
   (are a few people carrying the server, or is it broad?).
4. **Channel intelligence** — sortable table (24h / 7d / total messages, active authors/channel)
   with dormant channels visibly flagged, plus implicit ranking by sort.
5. **Retention cohorts** — join-week × subsequent-week activity grid, color-graded, labeled
   "approximate, snapshot-derived", with an informative empty state when history is thin.
6. **Role distribution** — donut + legend.

Every advanced metric (stickiness, participation, churn, concentration, health score) has an
`InfoDot` tooltip defining it in plain English for non-technical viewers.

**Honesty note (in the UI):** growth/engagement/retention come from the bot's daily snapshots
(accumulating forward). Precise retention curves and some engagement funnels exist only in
Discord's owner-only Server Insights and would need manual import — the tab says so rather than
faking them.

## Phase 2 — GA4 + cross-source funnel (scaffolded, honest pending states)
`AcquisitionPanel.jsx` reads (when present) `data/ga4.json` and `data/funnel.json`; until those
files exist it renders "pending instrumentation" states, not fake data.
- **Website (GA4)** — active/new users, sessions, top source, top pages. Shows a labeled
  "GA4 integration pending" placeholder until `data/ga4.json` exists.
- **Community → Revenue funnel** — Discord joined → active → clicked-through (UTM) → website
  visit (GA4) → signed up → activated → paid (Stripe). Data-driven via a reusable
  `FunnelChart`: live stages fill with their source color + conversion %, pending stages are
  greyed/dashed with a specific reason ("awaiting UTM tagging", "awaiting product event
  tracking", "awaiting Stripe integration"). Joined + Active are already live from Discord.
- **Checkout funnel** — clicked-subscribe → reached-payment → paid, same pending treatment,
  ready for Stripe + front-end events.

The funnel is fully data-driven: dropping in `data/ga4.json` / `data/funnel.json` (or any source
file) lights up the relevant stage(s) with no code change.

Draft contracts (documented in `AcquisitionPanel.jsx`):
`data/ga4.json { updatedAt, activeUsers, newUsers, sessions, trafficBySource[], topPages[], keyEvents[] }`,
`data/funnel.json { updatedAt, stages[], checkoutStages[] }`.

## Wiring
- `App.jsx`: new **Community** and **Acquisition** tabs; soft-fetches `/data/discord.json`,
  `/data/ga4.json`, `/data/funnel.json`.
- `copy-data.js`: `discord.json` (sample fallback → SAMPLE badge), `ga4.json` + `funnel.json`
  (optional, no sample → "missing" → panels show pending).
- `.github/workflows/daily-refresh.yml`: `Fetch Discord metrics` step (`node fetch-discord.mjs`,
  `continue-on-error: true`, tokens via secrets) before the commit step, which stages
  `data/discord.json` if present.
- `.gitignore` ignores the real `data/discord.json` (CI force-adds it); `.env.example` documents
  `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID`.
- Also includes the earlier dashboard-wide **polish pass** (shared theme tokens, mobile tab strip,
  loading skeleton, tab a11y, brand favicon) — see commit `ebae855`.

## Live-data fetchers (included)
Node fetchers (no external deps; global `fetch`; tokens via env only, never logged/committed):
- **`fetch-discord.mjs`** → `data/discord.json`. Guild counts, members (Server Members Intent),
  roles, and message-based engagement read from recent channel history (bounded to ~300 msgs/
  channel/run to stay within rate limits). Accumulates history forward by merging the previously
  committed file (snapshots, running message totals, inferred leaves/churn, cohorts). Any section
  that can't be read (e.g. an intent isn't enabled) degrades to null/empty — a valid file is still
  written. Honest by design: no "total messages" or precise retention is invented (those are
  owner-only Server Insights).
- **`fetch-ga4.mjs`** → `data/ga4.json`. Mints a service-account JWT (`node:crypto`, RS256),
  exchanges it for an access token, and calls the GA4 Data API `runReport` for active/new users,
  sessions, traffic by channel, top pages, and key events.
- **`fetch-funnel.mjs`** → `data/funnel.json`. An assembler (no creds): stitches
  `discord.json` / `ga4.json` / future `stripe.json` / `product.json` / `links.json` into the
  funnel, marking each stage live or pending. Verified: with Discord data it lights up 2/7 stages
  (joined, active) and leaves the rest pending with labeled reasons. The tab reads this file when
  present, so adding Stripe/product/UTM sources later needs zero UI changes.

Workflow: added `Fetch GA4 website metrics` and `Build cross-source funnel` steps
(`continue-on-error`), and `data/ga4.json` + `data/funnel.json` to the commit loop and `.gitignore`
(CI force-adds them). `.env.example` documents `GA4_PROPERTY_ID` / `GA4_SA_KEY`.

## Activation checklist
| Source | Secrets to add | Lights up |
| --- | --- | --- |
| Discord | `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (bot in server; Server Members + Message Content intents) | Community tab (clears SAMPLE badge) + funnel Joined/Active |
| GA4 | `GA4_PROPERTY_ID`, `GA4_SA_KEY` (SA with Viewer on the property) | Website (GA4) section + funnel Website-visit stage |
| Stripe / product / UTM | future `data/stripe.json` / `product.json` / `links.json` | remaining funnel + checkout stages |

## Testing
- `vite build` passes. Community renders from `data/discord.sample.json` (badged SAMPLE);
  Acquisition shows Discord-sourced funnel stages live and the rest pending; GA4 shows its
  pending placeholder.

## Push + open the PR
```
git push -u origin feat/discord-analytics
```
Open a PR into `main`; confirm both tabs in the Vercel preview. Do not merge until reviewed.
