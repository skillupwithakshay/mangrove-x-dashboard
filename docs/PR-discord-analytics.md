# PR: Discord "Community" analytics tab

Branch: `feat/discord-analytics` (off `main`). **Do not merge until reviewed.**

## Summary
Adds a standalone **Community** tab driven by Discord server analytics, following the
existing data-source pattern: a daily GitHub Action runs a fetch script that writes a
JSON file, and the React tab reads it at runtime. This PR ships the UI, the data contract,
and the workflow wiring. The fetch script (`fetch-discord.mjs`) is authored separately;
until it lands, the tab renders `data/discord.sample.json` and is clearly badged **SAMPLE**.

Independent of HubSpot — separate data source, separate tab, no shared data. Tokens are
referenced only as `${{ secrets.DISCORD_BOT_TOKEN }}` / `${{ secrets.DISCORD_GUILD_ID }}`
and are never printed, logged, or committed.

## What's included
- **`data/discord.sample.json`** — realistic placeholder matching the exact shape
  `fetch-discord.mjs` will emit:
  `server{name,memberTotal,online,humans,bots,boostTier,boostCount}`,
  `growth{memberSnapshots:[{date,members}],joins30d,leaves30d}`,
  `channels:[{name,type,messages24h,messagesTotal}]`,
  `roles:[{name,memberCount}]`,
  `activity{messagesPerDay:[{date,count}],topChannels:[{name,count}]}`.
- **Community tab** (`web/src/components/DiscordPanel.jsx`), in order:
  1. **Community health header** — members, online now, humans vs bots, boost tier/count.
  2. **Member growth** — area chart of `growth.memberSnapshots`; joins vs leaves + net (30d),
     with a note that trend accumulates from the first run forward (no retroactive history).
  3. **Engagement** — messages-per-day area chart + ranked bar of top channels (24h).
  4. **Channel breakdown** — sortable table (name, type, 24h, total); click any header to sort.
  5. **Role distribution** — donut of members per role with a legend.
  6. **Community → Conversion funnel** — Joined → Active → Clicked-through → Signed up →
     Converted. Joined/Active come from live data (Active = online-now proxy); the later
     stages are greyed "coming soon", pending instrumentation (UTM + product events).
- **Wiring**: `App.jsx` fetches `/data/discord.json` (soft-fallback), new `Community` tab;
  `copy-data.js` copies `discord.json` with a `discord.sample.json` fallback (manifest marks
  it `sample` so the UI shows the SAMPLE badge); `.gitignore` ignores the real `data/discord.json`
  (CI force-adds it); `.env.example` documents `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID`.
- **Workflow** (`.github/workflows/daily-refresh.yml`): `Fetch Discord metrics` step runs
  `node fetch-discord.mjs` with the two secrets, `continue-on-error: true`, before the commit
  step — which now stages `data/discord.json` if present.

## Testing
- `vite build` passes; the tab renders from `data/discord.sample.json`, badged SAMPLE.

## Activate live data
1. Author/commit `fetch-discord.mjs` (writes `data/discord.json` in the shape above).
2. Add repo secrets `DISCORD_BOT_TOKEN` (bot with Server Members Intent, invited to the server)
   and `DISCORD_GUILD_ID`.
3. Run the workflow (or `node fetch-discord.mjs` locally). The SAMPLE badge clears once a real
   `data/discord.json` is committed.

## Push + open the PR
```
git push -u origin feat/discord-analytics
```
Open a PR into `main`; confirm the Community tab renders against the sample in the Vercel
preview. Do not merge until reviewed.
