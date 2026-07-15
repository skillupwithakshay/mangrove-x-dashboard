# Phase 0 — data provenance audit

Report only. No code was changed. Traces every metric shown on the dashboard to
its source and classifies it. Read the **trust findings** section first.

## Architecture reality (important — differs from the v2 brief)

The v2 brief assumes Next.js + Postgres (`social_snapshots`), `pg`, `/api/growth`,
`lib/insight.ts`, and a Node `scripts/refresh.mjs`. The actual repo is:

- **Vite + React static SPA** (no Next.js, no server, no API routes).
- **Python pipelines** (`pipeline/fetch_*_data.py`) that write `data/<src>_latest.json`.
- A **GitHub Actions** workflow (`.github/workflows/daily-refresh.yml`) runs them daily and commits the JSON.
- The SPA reads those JSON files as static assets (copied at build time by `web/scripts/copy-data.js`).
- **No database.** The only "history" today is `data/x_followers_history.json` (daily follower snapshots) + `data/linkedin_followers_history.json`.

Phases 1–4 (SQL migration, `pg`, `/api/growth`, `lib/insight.ts`) will need adapting
to this stack — see "Blocking decision" at the end.

## Classification table

Shown values are the current **live** figures on disk unless marked SAMPLE.

| platform | metric (card/chart) | shown value | source file:function | classification | live endpoint / literal | confidence | notes |
|---|---|---|---|---|---|---|---|
| **X** | Followers, Following, Total posts, Listed | 326 / … | `fetch_x_data.py:fetch_account` | **live** | `GET api.x.com/2/users/me` (public_metrics) | high | OAuth1 user context |
| X | Total impressions, avg engagement rate, engagements | 2,280,535 / … | `fetch_x_data.py:build_summary` | **computed** | sum of per-tweet `public_metrics` over last ≤100 tweets | high | reach ≠ followers; it's summed post impressions |
| X | Likes/Reposts/Replies/Quotes/Bookmarks | live | `fetch_x_data.py:fetch_tweets` | **computed** (from live per-tweet metrics) | `GET /2/users/:id/tweets` | high | |
| X | Link clicks / Profile clicks | live or hidden | `fetch_x_data.py:enrich_organic_metrics` | **live-or-absent** | `GET /2/tweets?...organic_metrics` | high | soft-degrades to `null` → card hidden; never faked |
| X | Follower-growth chart | real series | `fetch_x_data.py:update_follower_history` | **cached** (daily snapshots) | `data/x_followers_history.json` | high | only since first tracked day |
| X | "Impressions & engagement" trend + period tabs (7/30/6M/1Y) + Growth % | computed | `XPanel.jsx` + `lib/period.js:periodView` | **computed** | client-side from `daily` (tweets bucketed by date) | med | activity, not audience; 6M/1Y sparse → growth may be null |
| X | Recent posts table | live | `fetch_x_data.py:fetch_tweets` | **live** | timeline | high | |
| **YouTube** | Subscribers / total views / videos / watch time / impressions / CTR / net subs / traffic / videos | **SAMPLE 1,280 subs, etc.** | pipeline `fetch_youtube_data.py`; **but live file missing → `copy-data.js` serves `youtube_latest.sample.json`** | **mock/fallback shown as real** ⚠️ | would be Data API v3 + Analytics API if live | high | no live `youtube_latest.json` on disk; renders fabricated sample with **no indicator** |
| YouTube (when live) | same | — | `fetch_youtube_data.py:fetch_analytics/fetch_channel` | live / live-or-absent | `googleapis.com/youtube/v3` + `youtubeanalytics/v2` | high | `analytics_available:false` hides owner-only cards honestly |
| **Instagram** | Followers / follows / media count | 325 / … | `fetch_instagram_data.py:fetch_account` | **live** | `graph.facebook.com/v21.0/{ig-id}` | high | |
| Instagram | Reach 863 / views / profile views / interactions / likes / comments / saves / shares | live | `fetch_instagram_data.py:fetch_totals` | **live-or-absent** | `/{ig-id}/insights` | high | any missing metric → `null` → card hidden |
| Instagram | Reach & views trend + period tabs | computed | `InstagramPanel.jsx` + `periodView` | **computed** | from `daily` insights | med | 6M/1Y limited to ~30d of IG day-data |
| Instagram | Demographics (countries/age/gender) | live | `fetch_instagram_data.py:fetch_demographics` | **live-or-absent** | `follower_demographics` | med | needs ≥100 followers; may be empty |
| Instagram | Recent posts | live | `fetch_instagram_data.py:fetch_media` | **live** | `/{ig-id}/media` | high | |
| **TikTok** | Followers 2 / following / total likes 9 / videos 2 | live **(sandbox-scoped)** | `fetch_tiktok_data.py:fetch_account` | **live, but sandbox** ⚠️ | `open.tiktokapis.com/v2/user/info/` | high | Sandbox credentials → these are sandbox/target-user values, **not the public brand account's real reach** |
| TikTok | Views / likes / comments / shares totals | computed | `fetch_tiktok_data.py:build_summary` | **computed** (from live per-video) | `/v2/video/list/` | high | sandbox-scoped |
| TikTok | Views & engagement trend + period tabs | computed | `TikTokPanel.jsx` + `periodView` | **computed** | from `daily` | med | |
| **LinkedIn** | Followers / impressions / reactions / visitors / page views / eng. rate + trends | **SAMPLE 3,120 followers, 48,200 impressions, etc.** | pipeline `fetch_linkedin_data.py`; **live file missing → `copy-data.js` serves `linkedin_latest.sample.json`** | **mock/fallback shown as real** ⚠️ | scraper (can't run in CI) or official API (stub) | high | fabricated sample, **no indicator**; the old "via scraper" label was removed in the last UI pass |
| **PyPI** | Total downloads | **9,160** | `fetch_pypi_data.py:fetch_from_wordpress` | **live** | `GET mangrove.ai/wp-json/mangrove/v1/pypi-downloads` (`source:"wordpress"`) | high | see PyPI deep-dive |
| PyPI | Per-package (mangrove-kb 6,043 / mangroveai 3,117 / mangrovemarkets 0) | live | `fetch_pypi_data.py:_packages_sorted` | **live** (independently provided, not derived) | WordPress `packages` map | high | sorted high→low |
| PyPI | window "rolling ~180 days" | label | `fetch_pypi_data.py` `WINDOW_LABEL` | **hardcoded label** (accurate) | literal | high | matches pypistats overall window |
| **Header** | "Last updated: …" | X's timestamp | `App.jsx` `lastUpdated` | **computed** (X only) | `x_latest.last_updated` | high | implies whole page is fresh even when other panels are stale samples |

## PyPI deep-dive (owner asked specifically)

- **Source:** the founder's WordPress REST endpoint `https://mangrove.ai/wp-json/mangrove/v1/pypi-downloads` (`fetch_from_wordpress`), which is the same endpoint that powers the number on mangrove.ai — so by construction the dashboard matches the site. **Fallback:** if that endpoint is down, `fetch_from_pypistats` queries `pypistats.org/api/packages/<pkg>/overall?mirrors=false` and sums only rows where `category == "without_mirrors"`.
- **Packages summed (exact identifiers in code):** `["mangrovemarkets", "mangroveai", "mangrove-kb"]` (the `PACKAGES` constant). The WordPress path sums whatever that endpoint returns in its `packages` map (currently those three).
- **Window / "11.9K":** the window is **rolling ~180 days** (pypistats' "overall" horizon), not lifetime. Note the current live total is **9,160**, not 11.9K — the "11.9K / 6.5K / 3.6K / 1.8K" figures in the brief don't match the live data (they look like earlier or preview values). Current split is 6,043 / 3,117 / 0.
- **"Mirror traffic excluded — same figure as mangrove.ai":** the mirror exclusion is **actually implemented** in the pypistats fallback (the `without_mirrors` filter). On the primary WordPress path it is **trusted, not recomputed** — the dashboard inherits whatever the founder's PHP does. Recommend confirming the WordPress PHP itself excludes mirrors; the label is correct only if it does.
- **Per-package splits:** **independently fetched**, not derived from the total (each package is summed on its own, then the list is sorted).

## Trust findings (the dangerous ones)

1. **Silent sample fallback with no UI label — the core problem.** `web/scripts/copy-data.js` does `existsSync(live) ? live : sample`. If any live `data/<src>_latest.json` is missing at build time, it serves the committed `*.sample.json` **fabricated** values, and **no panel renders any "sample data" indicator** (`grep sample web/src/components` → 0 hits). Right now on disk that affects:
   - **YouTube → SAMPLE** (shows 1,280 subscribers — fabricated). No live file present.
   - **LinkedIn → SAMPLE** (shows 3,120 followers / 48,200 impressions — fabricated). Cannot self-heal: the scraper can't run in CI, and the official-API provider is an unimplemented stub.
   - (X, Instagram, TikTok, PyPI have live files on disk and render real data.)
2. **TikTok is live but Sandbox-scoped.** Real values are tiny (2 followers, 9 likes, 2 videos) because the app uses TikTok **Sandbox** credentials — these are not the public brand account's real numbers. Truthful, but misleading without a "sandbox" caveat; promote the app to production for real figures.
3. **Header freshness is X-only.** "Last updated" reflects only `x_latest.json`, so a stale sample panel looks as fresh as the live ones.
4. **The standalone `mangrove-dashboard-preview.html` is 100% synthetic** (including a fabricated 365-day series used to demo the period tabs). It is not the deployed app, but it should never be mistaken for real data.

## Summary — every metric that is NOT live

- **YouTube (all cards): mock/fallback** rendered as real, unlabeled. ⚠️
- **LinkedIn (all cards): mock/fallback** rendered as real, unlabeled, and can't self-heal in CI. ⚠️
- **TikTok: live but Sandbox-scoped** (real-but-unrepresentative). ⚠️
- X impressions/engagement totals, all trend charts, all period-tab Growth %: **computed** (honest, but activity-based and sparse over long windows).
- X & LinkedIn follower-growth charts: **cached** snapshots (real, only since tracking start).
- PyPI window label: **hardcoded** (accurate).
- Everything else (X profile + tweets, Instagram, PyPI totals/splits): **live**.

The only outright integrity risk is finding #1: **YouTube and LinkedIn currently display fabricated sample numbers as if real.** Recommended immediate remediation (Phase 1+/quick fix): make `copy-data.js` mark sample-sourced files and have panels show a "sample data" badge, or refuse to render a panel whose live file is absent.

## Blocking decision before Phase 1

The brief's data layer is Postgres-based (`social_snapshots`, `pg`, SQL growth query, `/api/growth`). This repo has no server or DB. Please choose:

- **(A) Add a real database** (e.g. Supabase/Neon Postgres) + `DATABASE_URL` secret, implement the brief as written, and add a small serverless function or build-time step to expose `/api/growth`. Closest to the brief; new infra to provision (owner task).
- **(B) Keep it serverless/static** — bank snapshots as committed JSON (extend the existing `*_followers_history.json` pattern to all platforms/metrics) and compute growth client-side. No new infra; diverges from the brief's SQL.

I recommend (B) for this stack unless you specifically want the Postgres layer. Tell me A or B and I'll start Phase 1.
