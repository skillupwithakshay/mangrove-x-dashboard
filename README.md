# Mangrove AI — Analytics Dashboard (X + YouTube + Instagram + TikTok + LinkedIn)

Pulls Mangrove AI's social analytics daily and displays them as KPI cards and
charts. Data sources currently live: **X (Twitter)**, **YouTube**,
**Instagram**, **TikTok**, **LinkedIn**, and PyPI open-source downloads. Each
source is a self-contained pipeline that writes a `data/<source>_latest.json`
file plus a matching panel that renders it, so a new source drops in without
restructuring the app.

Live: https://mangrove-x-dashboard.vercel.app

## Project structure

```
dashboard/
  diagnostics/
    check_x_auth.py         # standalone X auth check — run first if the API 401s
    check_get_tweets.py     # raw-HTTP test of get_users_tweets specifically
  pipeline/
    fetch_x_data.py         # pulls X data, writes data/x_latest.json
    fetch_youtube_data.py     # pulls YouTube data, writes data/youtube_latest.json
    youtube_oauth_setup.py    # one-time: get a YouTube OAuth refresh token
    fetch_instagram_data.py   # pulls Instagram data, writes data/instagram_latest.json
    instagram_token_setup.py  # one-time: get an IG token + business account id
    fetch_tiktok_data.py      # pulls TikTok data, writes data/tiktok_latest.json
    tiktok_oauth_setup.py     # one-time: get a TikTok OAuth refresh token
    fetch_linkedin_data.py    # LinkedIn orchestrator (selects provider below)
    linkedin_selenium.py      # LinkedIn provider: company-page scraper (now)
    linkedin_api.py           # LinkedIn provider: official API stub (later)
    requirements-linkedin.txt # extra dep (selenium) for the scraper only
    fetch_pypi_data.py        # pulls PyPI downloads, writes data/pypi_latest.json
    post_slack_summary.py     # posts a formatted summary to Slack (optional)
    requirements.txt
  data/
    x_latest.json                 # pipeline output the dashboard reads (gitignored — real data)
    x_latest.sample.json          # committed sample so the dashboard renders before a real run
    youtube_latest.json           # YouTube pipeline output (gitignored — real data)
    youtube_latest.sample.json    # committed YouTube sample
    instagram_latest.json         # Instagram pipeline output (gitignored — real data)
    instagram_latest.sample.json  # committed Instagram sample
    tiktok_latest.json            # TikTok pipeline output (gitignored — real data)
    tiktok_latest.sample.json     # committed TikTok sample
    linkedin_latest.json          # LinkedIn pipeline output (gitignored — real data)
    linkedin_latest.sample.json   # committed LinkedIn sample
    x_followers_history.json      # daily X follower snapshots (Action-committed)
    linkedin_followers_history.json  # daily LinkedIn follower snapshots
    pypi_latest.json / .sample.json
  web/                      # React + Vite dashboard
    src/
      App.jsx
      components/
        XPanel.jsx          # X KPI cards, chart, tweet table
        YouTubePanel.jsx    # YouTube KPIs, views/watch-time chart, traffic sources, video table
        InstagramPanel.jsx  # IG KPIs, reach/views chart, follower demographics, media table
        TikTokPanel.jsx     # TikTok KPIs, views/engagement chart, top-videos table
        LinkedInPanel.jsx   # LinkedIn KPIs, follower-growth + impressions charts, posts table
        PyPIPanel.jsx       # PyPI download counts
        Kpi.jsx, Panel.jsx  # shared UI atoms
  .github/workflows/daily-refresh.yml   # scheduled daily pipeline run (all sources)
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

## 6. YouTube setup (Data API + Analytics API)

The YouTube pipeline uses **one OAuth 2.0 credential set** to power both the
public channel/video stats (Data API v3) and the owner-only analytics (watch
time, impressions, average view duration, traffic sources, subscriber gains —
YouTube Analytics API). Do this once:

1. **Google Cloud project** — at [console.cloud.google.com](https://console.cloud.google.com)
   create or select a project.
2. **Enable both APIs** — APIs & Services → Library → enable **YouTube Data
   API v3** *and* **YouTube Analytics API**.
3. **OAuth consent screen** — configure it, and under *Test users* add the
   Google account that owns the Mangrove YouTube channel (needed while the app
   is in "testing" mode).
4. **OAuth client** — APIs & Services → Credentials → Create Credentials →
   OAuth client ID → application type **Desktop app**. Copy the Client ID and
   Client secret.
5. **Get a refresh token** (once):

   ```bash
   export YOUTUBE_CLIENT_ID=...        # from step 4
   export YOUTUBE_CLIENT_SECRET=...
   python3 pipeline/youtube_oauth_setup.py
   ```

   Open the printed URL, sign in **as the channel owner**, approve, and paste
   the code back. It prints `YOUTUBE_REFRESH_TOKEN=...`.
6. **Store the three values** — put `YOUTUBE_CLIENT_ID`,
   `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN` in both your local
   `.env` and the repo's GitHub Secrets (same names).
7. **Test it:**

   ```bash
   python3 pipeline/fetch_youtube_data.py
   ```

   On success this writes `data/youtube_latest.json`. Until then the dashboard
   renders `data/youtube_latest.sample.json` so the panel isn't blank. If the
   OAuth token somehow lacks the analytics scope, the pipeline still writes
   public video stats and the panel hides the owner-only cards
   (`analytics_available: false`) rather than showing blanks.

## 7. Instagram setup (Graph API)

Instagram insights (reach, views, demographics, per-post metrics) are only
available through the Instagram **Graph API**, which requires a **Business or
Creator** account linked to a Facebook Page, plus a Meta app. Do this once:

1. **Account type** — in the Instagram app, switch the Mangrove account to a
   Business or Creator account and link it to a Facebook Page (Settings →
   Account type and tools).
2. **Meta app** — at [developers.facebook.com](https://developers.facebook.com)
   → My Apps → Create App (type "Business"). Add the **Instagram Graph API**
   product. Note the App ID and App secret.
3. **Short-lived token** — open the Graph API Explorer, select your app, click
   *Generate Access Token*, and grant: `instagram_basic`,
   `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
   Copy the token.
4. **Get the long-lived token + account id:**

   ```bash
   export FB_APP_ID=...
   export FB_APP_SECRET=...
   export FB_SHORT_TOKEN=...      # from the Explorer in step 3
   python3 pipeline/instagram_token_setup.py
   ```

   It prints `IG_ACCESS_TOKEN=...` and `IG_BUSINESS_ACCOUNT_ID=...`.
5. **Store both values** in your local `.env` and the repo's GitHub Secrets
   (same names).
6. **Test it:**

   ```bash
   python3 pipeline/fetch_instagram_data.py
   ```

   On success this writes `data/instagram_latest.json`. Until then the
   dashboard renders `data/instagram_latest.sample.json`. Because Meta
   deprecates/renames insight metrics often, the pipeline treats every insight
   call as optional — any metric that isn't available for the account/API
   version is skipped and its card is hidden, rather than failing the run.

**Token longevity (important for the daily job):** the token from step 4 is a
user token that expires in ~60 days. For the unattended GitHub Action, create
a **System User** in Meta Business Settings and generate a token that never
expires (assign the app + Page with the same insight permissions), and use
that as `IG_ACCESS_TOKEN` in the repo secrets. Otherwise you'll need to re-run
the setup every ~60 days. If the token lapses, the Action's Instagram step
just logs a failure and the last good data stays deployed (`continue-on-error`).

## 8. TikTok setup (Display API + Login Kit)

TikTok analytics come from the **TikTok API for Developers** (Display API via
Login Kit). It's OAuth 2.0: a long-lived refresh token is exchanged for a fresh
~24h access token on each run. Do this once:

1. **Developer app** — at [developers.tiktok.com](https://developers.tiktok.com)
   create an app (Manage apps → Connect an app).
2. **Login Kit** — add the Login Kit product and enable the scopes
   `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`.
   Add the redirect URI `http://localhost:8080/callback`.
3. **Client credentials** — copy the app's Client key and Client secret.
4. **Get the refresh token:**

   ```bash
   export TIKTOK_CLIENT_KEY=...
   export TIKTOK_CLIENT_SECRET=...
   python3 pipeline/tiktok_oauth_setup.py
   ```

   A browser opens; log in as the Mangrove TikTok account and approve. It
   prints `TIKTOK_REFRESH_TOKEN=...`.
5. **Store all three values** (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
   `TIKTOK_REFRESH_TOKEN`) in your local `.env` and the repo's GitHub Secrets.
6. **Test it:**

   ```bash
   python3 pipeline/fetch_tiktok_data.py
   ```

   On success this writes `data/tiktok_latest.json`; until then the dashboard
   renders `data/tiktok_latest.sample.json`.

**Token longevity:** TikTok refresh tokens last ~365 days. Re-run the setup
once a year to mint a fresh one. If it lapses, the Action's TikTok step just
logs a failure (`continue-on-error`) and the last good data stays deployed.

## 9. LinkedIn setup (scraper now, official API later)

LinkedIn has no simple public analytics API, so the pipeline ships with a
**Selenium scraper** for the company page, built to be swapped for the official
API later without touching anything else. The provider is chosen by
`LINKEDIN_SOURCE` (`selenium` default, or `api`).

> ⚠️ **Read this first.** Automated scraping is against LinkedIn's User
> Agreement and can get the signed-in account challenged or restricted. Logins
> from datacenter/CI IPs (like GitHub Actions) also frequently hit security
> checkpoints. So the scraper is **best-effort** and most reliable run from a
> trusted local machine. Move to the official API as soon as you have access.

Setup (scraper):

1. **Install the extra dependency** (kept separate from the other pipelines):

   ```bash
   pip install -r pipeline/requirements-linkedin.txt
   ```

   You also need Chrome/Chromium installed; Selenium 4 auto-resolves the driver.
2. **Company slug** — set `LINKEDIN_COMPANY` to the vanity name in the page URL
   (`linkedin.com/company/<this>/`), e.g. `mangrove-ai`. You must be a Page admin.
3. **Auth (recommended: session cookie)** — in a logged-in browser, open
   DevTools → Application → Cookies → `www.linkedin.com` → copy the `li_at`
   value into `LINKEDIN_LI_AT`. Treat it like a password. (Email/password is
   supported as a fallback but more likely to trip 2FA.)
4. **Run it (locally is best):**

   ```bash
   python3 pipeline/fetch_linkedin_data.py
   ```

   It writes `data/linkedin_latest.json` and snapshots the follower count into
   `data/linkedin_followers_history.json` for the growth chart. The scraper's
   selectors live in `pipeline/linkedin_selenium.py`; LinkedIn's markup drifts,
   so update the `_extract_*` helpers there if a metric stops coming through.
   Until a real run succeeds, the dashboard shows `linkedin_latest.sample.json`.

**Switching to the official API later:** apply for LinkedIn's Community
Management API, implement `fetch()` in `pipeline/linkedin_api.py` (the file
documents the exact endpoints + auth), add `LINKEDIN_ACCESS_TOKEN` /
`LINKEDIN_ORG_ID`, and set `LINKEDIN_SOURCE=api`. The dashboard, follower
history, and output shape stay identical.

## 10. How production stays updated

`.github/workflows/daily-refresh.yml` runs on a cron (06:00 UTC daily) and
can also be triggered manually from the Actions tab (`workflow_dispatch`).
It installs `pipeline/requirements.txt` and runs each source's pipeline using
credentials from **repo Settings → Secrets and variables → Actions** (never
in code), then commits the refreshed `data/*.json` back to the repo:

- **X** (`fetch_x_data.py`) — needs `X_API_KEY`, `X_API_SECRET`,
  `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`. Required: if it fails (bad creds,
  rate limit, API error) the job fails and nothing is committed. Also maintains
  `data/x_followers_history.json` — one follower-count snapshot per day,
  committed by the Action, which powers the follower-growth chart (the X API
  has no historical-follower endpoint, so this accumulates over time).
- **YouTube** (`fetch_youtube_data.py`) — needs `YOUTUBE_CLIENT_ID`,
  `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Runs with
  `continue-on-error` so a YouTube/token hiccup doesn't block the X commit;
  on failure the last good `data/youtube_latest.json` stays deployed.
- **Instagram** (`fetch_instagram_data.py`) — needs `IG_ACCESS_TOKEN` and
  `IG_BUSINESS_ACCOUNT_ID`. Also `continue-on-error`; on failure (e.g. the
  60-day user token expired) the last good `data/instagram_latest.json` stays
  deployed. Use a System User token to avoid expiry (see section 7).
- **TikTok** (`fetch_tiktok_data.py`) — needs `TIKTOK_CLIENT_KEY`,
  `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`. Also `continue-on-error`; on
  failure (e.g. the ~365-day refresh token expired) the last good
  `data/tiktok_latest.json` stays deployed (see section 8).
- **LinkedIn** (`fetch_linkedin_data.py`) — scraper needs `LINKEDIN_COMPANY` +
  `LINKEDIN_LI_AT` (see section 9). Installs Chrome + `requirements-linkedin.txt`
  and runs `continue-on-error` — expect it to fail often from CI IPs (login
  checkpoints); when it does, the last good `data/linkedin_latest.json` stays
  deployed. Runs reliably from a local machine. Also snapshots
  `data/linkedin_followers_history.json` daily.
- **PyPI** (`fetch_pypi_data.py`) — no secrets, also `continue-on-error`.

The commit step adds whichever `data/*.json` files exist, so a source that
hasn't been configured yet simply isn't committed (no failure). Because Vercel
serves the data as static assets copied in at build time, redeploy (or wire a
Vercel deploy hook into the Action) to pick up each day's fresh data.

## 11. Slack daily summary (optional)

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
