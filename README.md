# Mangrove AI — Analytics Dashboard (Phase 1: X)

Pulls Mangrove AI's X (Twitter) analytics daily and displays them as KPI
cards and charts. Built so a second data source (Instagram, Phase 2) can be
added alongside X without restructuring the app — see `web/src/components/InstagramPanel.jsx`.

## Project structure

```
dashboard/
  diagnostics/
    check_x_auth.py       # standalone auth check — run this first if the API 401s
    check_get_tweets.py   # raw-HTTP test of get_users_tweets specifically
  pipeline/
    fetch_x_data.py         # pulls X data, writes data/x_latest.json
    post_slack_summary.py   # posts a formatted summary to Slack (optional)
    requirements.txt
  data/
    x_latest.json          # pipeline output the dashboard reads (gitignored — real data)
    x_latest.sample.json   # committed sample so the dashboard has something to render
  web/                      # React + Vite dashboard
    src/
      App.jsx
      components/
        XPanel.jsx          # X KPI cards, chart, tweet table
        InstagramPanel.jsx  # Phase 2 placeholder — extension point
        Kpi.jsx, Panel.jsx  # shared UI atoms
  .github/workflows/daily-refresh.yml   # scheduled pipeline run
```

## 1. Fix the X API 401 first

`get_users_tweets` returning 401 usually means one of:

1. **Access tier** — the X API Free tier only allows `POST /2/tweets`
   (posting) and `GET /2/users/me`. Reading a user's tweet timeline
   (`get_users_tweets`) requires at least the **Basic** tier. Check your
   tier at [developer.x.com](https://developer.x.com) under your Project.
2. **Expired/regenerated token** — if the App's permissions changed (e.g.
   Read → Read+Write) after the Access Token was generated, the old token
   is invalid. Regenerate it.
3. **App not attached to a Project** — every App must live inside a Project
   in the current developer portal.
4. **tweepy-specific auth bug** — in testing on this account (Pro tier,
   valid credentials confirmed via `GET /2/users/me`), tweepy's
   `Client.get_users_tweets` returned a bare 401 with no useful detail,
   while an identical call made with plain `requests` +
   `requests_oauthlib.OAuth1` succeeded and returned real tweet data. If
   you hit this, don't chase tweepy further — `pipeline/fetch_x_data.py`
   already uses the raw-request approach for exactly this reason.

Run the diagnostics in order to see exact status/bodies X returns:

```bash
pip install -r diagnostics/requirements.txt
export X_API_KEY=...
export X_API_SECRET=...
export X_ACCESS_TOKEN=...
export X_ACCESS_TOKEN_SECRET=...
python3 diagnostics/check_x_auth.py     # isolates "are creds valid" (GET /2/users/me only)
python3 diagnostics/check_get_tweets.py # tests the actual get_users_tweets call with raw HTTP
```

## 2. Install dependencies

```bash
# Pipeline (Python)
pip install -r pipeline/requirements.txt

# Dashboard (Node)
cd web && npm install
```

## 3. Set environment variables locally

```bash
cp .env.example .env
# fill in X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
```

`.env` is gitignored — never commit real credentials. Load it into your
shell before running the pipeline (e.g. `export $(grep -v '^#' .env | xargs)`,
or use a tool like `direnv`/`python-dotenv` if you prefer).

## 4. Run the pipeline manually once

```bash
python3 pipeline/fetch_x_data.py
```

On success this writes `data/x_latest.json` with fresh account/tweet data.
On failure (missing creds, bad auth, rate limit) it logs the error and
exits non-zero **without touching the existing data file**.

## 5. Run the dashboard locally

```bash
cd web
npm run dev
```

Opens at `http://localhost:5173`. `npm run dev` automatically copies
`data/x_latest.json` (or `data/x_latest.sample.json` if that doesn't exist
yet) into `web/public/data/` so the app can fetch it — see
`web/scripts/copy-data.js`.

## 6. How production stays updated

`.github/workflows/daily-refresh.yml` runs on a cron (06:00 UTC daily) and
can also be triggered manually from the Actions tab (`workflow_dispatch`).
It installs `pipeline/requirements.txt`, runs `fetch_x_data.py` with your
API credentials from **repo Settings → Secrets and variables → Actions**
(add `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`
there — never in code), and commits the updated `data/x_latest.json` back
to the repo if the pipeline succeeds. A failed pipeline run (bad creds, API
error, rate limit) fails the whole job and nothing gets committed.

## 7. Slack daily summary (optional)

`pipeline/post_slack_summary.py` posts a formatted card (followers, total
impressions, avg engagement rate, top post, link to the live dashboard) to
a Slack channel via an Incoming Webhook. It's wired into
`daily-refresh.yml` already, but skipped automatically until you set it up:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
   → From scratch → pick your workspace.
2. Open **Incoming Webhooks** → toggle it on → **Add New Webhook to
   Workspace** → choose the channel → Allow.
3. Copy the URL it gives you (`https://hooks.slack.com/services/...`).
4. Add it as `SLACK_WEBHOOK_URL` in **both** your local `.env` and the
   repo's GitHub Secrets (same place as the X API keys).

Once that secret exists, the next daily run (or a manual `workflow_dispatch`
run) will post automatically. To test locally without spamming the channel:

```bash
python3 pipeline/post_slack_summary.py --dry-run
```

This prints the exact message payload instead of sending it — useful for
checking formatting before wiring up the real webhook.

## Deploy note

This is intended to be deployed to **Vercel**, pointed at the `web/`
folder (Root Directory = `web`, Build Command = `npm run build`, Output
Directory = `dist`). Because the dashboard fetches `data/x_latest.json` as
a static asset copied in at build time, redeploy (or wire a Vercel deploy
hook into the daily GitHub Action) to pick up each day's fresh data.

Currently deployed under a personal account/email for speed — transfer the
GitHub repo (Settings → Transfer ownership) and the Vercel project
(Project Settings → Transfer Project) to a company-owned account once one
exists, so the founder/team aren't dependent on one person's login.
