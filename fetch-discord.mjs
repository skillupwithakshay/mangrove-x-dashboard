#!/usr/bin/env node
/**
 * fetch-discord.mjs
 * -----------------
 * Writes data/discord.json — the "Community Intelligence" dataset the dashboard
 * reads (see web/src/components/DiscordPanel.jsx for the exact contract).
 *
 * AUTH (env only — never printed, logged, or committed):
 *   DISCORD_BOT_TOKEN   a bot token; the bot must be in the server. For member
 *                       counts/roles enable the "Server Members Intent", and for
 *                       message-based engagement enable "Message Content Intent"
 *                       (both in the Developer Portal → Bot). Read scopes only.
 *   DISCORD_GUILD_ID    the server (guild) id.
 *
 * DESIGN — honesty first:
 *   - Discord's REST API has no "total messages" or precise retention endpoints
 *     (those live in owner-only Server Insights). So we measure what a bot can
 *     truly see and ACCUMULATE history forward across daily runs by merging the
 *     previously committed data/discord.json. Every time series therefore starts
 *     thin and improves over time — exactly how the UI is built to render.
 *   - Message metrics are computed by reading recent messages per text channel,
 *     BOUNDED (page + age caps) to stay well within rate limits. messagesTotal is
 *     accumulated (previous total + messages newer than the last run), never faked.
 *   - Any section that fails (e.g. an intent isn't enabled) degrades to null/empty
 *     rather than aborting; a valid file is still written.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data", "discord.json");
const API = "https://discord.com/api/v10";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
if (!TOKEN || !GUILD) {
  console.error("Missing DISCORD_BOT_TOKEN and/or DISCORD_GUILD_ID env vars.");
  process.exit(1);
}
const HEADERS = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- rate-limit-aware GET (handles 429 + light retry) -----------------------
async function api(path, { tolerate = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: HEADERS });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.min(5000, (body.retry_after || 1) * 1000 + 250));
      continue;
    }
    if (!res.ok) {
      if (tolerate) return null;
      throw new Error(`GET ${path} → ${res.status} ${(await res.text()).slice(0, 160)}`);
    }
    // gentle pacing between calls to respect the global limit
    await sleep(120);
    return res.json();
  }
  if (tolerate) return null;
  throw new Error(`GET ${path} → repeatedly rate-limited`);
}

function loadPrev() {
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; }
}

// ISO week label like "2026-W27"
function isoWeek(ms) {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function main() {
  const prev = loadPrev();
  const prevRunAt = prev?.updatedAt ? Date.parse(prev.updatedAt) : 0;

  // ---- guild + counts ------------------------------------------------------
  const guild = await api(`/guilds/${GUILD}?with_counts=true`);
  const server = {
    name: guild.name,
    memberTotal: guild.approximate_member_count ?? null,
    online: guild.approximate_presence_count ?? null,
    humans: null, bots: null,
    boostTier: guild.premium_tier ?? 0,
    boostCount: guild.premium_subscription_count ?? 0,
  };

  // ---- members (needs Server Members Intent) -------------------------------
  let members = [];
  try {
    let after = "0";
    for (let i = 0; i < 20; i++) { // up to 20k members
      const page = await api(`/guilds/${GUILD}/members?limit=1000&after=${after}`);
      if (!page || !page.length) break;
      members = members.concat(page);
      after = page[page.length - 1].user.id;
      if (page.length < 1000) break;
    }
  } catch (e) {
    console.warn("Members list unavailable (enable Server Members Intent):", e.message);
    members = [];
  }
  if (members.length) {
    server.bots = members.filter((m) => m.user?.bot).length;
    server.humans = (server.memberTotal ?? members.length) - server.bots;
    if (server.memberTotal == null) server.memberTotal = members.length;
  }

  // ---- roles ---------------------------------------------------------------
  let roles = [];
  try {
    const roleDefs = await api(`/guilds/${GUILD}/roles`, { tolerate: true }) || [];
    const nameById = Object.fromEntries(roleDefs.map((r) => [r.id, r.name]));
    if (members.length) {
      const count = {};
      for (const m of members) for (const rid of m.roles || []) count[rid] = (count[rid] || 0) + 1;
      roles = Object.entries(count)
        .map(([rid, n]) => ({ name: nameById[rid] || "role", memberCount: n }))
        .filter((r) => r.name !== "@everyone")
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 8);
    }
  } catch { /* soft */ }

  // ---- channels + bounded message reads ------------------------------------
  const channelDefs = (await api(`/guilds/${GUILD}/channels`, { tolerate: true })) || [];
  const TYPE = { 0: "text", 2: "voice", 5: "announcement", 13: "voice", 15: "forum" };
  const READABLE = new Set([0, 5]); // text + announcement (forum threads are out of scope)
  const PAGE_CAP = 3;               // ≤300 msgs/channel/run — rate-limit safe
  const READ_WINDOW = 30 * DAY;

  const channels = [];
  // per-day + per-author aggregates for engagement
  const msgsByDay = {}, postersByDay = {}, authorMsgCount = {};
  const active7 = new Set(), active30 = new Set();

  for (const ch of channelDefs) {
    const type = TYPE[ch.type] || "other";
    const base = { name: ch.name, type, messages24h: 0, messages7d: 0, messagesTotal: 0, activeAuthors7d: 0 };
    const prevCh = prev?.channels?.find((c) => c.name === ch.name);
    base.messagesTotal = prevCh?.messagesTotal || 0; // accumulate

    if (READABLE.has(ch.type)) {
      const authors7 = new Set();
      let before = null, newSincePrev = 0, stop = false;
      try {
        for (let p = 0; p < PAGE_CAP && !stop; p++) {
          const q = before ? `?limit=100&before=${before}` : `?limit=100`;
          const msgs = await api(`/channels/${ch.id}/messages${q}`, { tolerate: true });
          if (!msgs || !msgs.length) break;
          for (const m of msgs) {
            const ts = Date.parse(m.timestamp);
            if (now - ts > READ_WINDOW) { stop = true; break; }
            const aid = m.author?.id;
            const bot = m.author?.bot;
            if (now - ts <= DAY) base.messages24h++;
            if (now - ts <= 7 * DAY) { base.messages7d++; if (aid) authors7.add(aid); }
            if (ts > prevRunAt) newSincePrev++;
            if (!bot && aid) {
              const dk = dayKey(ts);
              msgsByDay[dk] = (msgsByDay[dk] || 0) + 1;
              (postersByDay[dk] = postersByDay[dk] || new Set()).add(aid);
              authorMsgCount[aid] = (authorMsgCount[aid] || 0) + 1;
              if (now - ts <= 7 * DAY) active7.add(aid);
              active30.add(aid);
            }
          }
          before = msgs[msgs.length - 1].id;
          if (msgs.length < 100) break;
        }
        base.activeAuthors7d = authors7.size;
        base.messagesTotal += newSincePrev; // add only messages newer than last run
      } catch { /* soft — leave zeros */ }
    }
    channels.push(base);
  }

  // ---- engagement aggregates ----------------------------------------------
  const last = (n) => Array.from({ length: n }, (_, i) => dayKey(now - (n - 1 - i) * DAY));
  const messagesPerDay = last(14).map((d) => ({ date: d, count: msgsByDay[d] || 0 }));
  const postingMembersPerDay = last(14).map((d) => ({ date: d, count: (postersByDay[d] || new Set()).size }));
  const activeMembers7d = active7.size;
  const activeMembers30d = active30.size;
  const totalMsgs = Object.values(authorMsgCount).reduce((a, b) => a + b, 0);
  const topN = Math.max(1, Math.ceil(Object.keys(authorMsgCount).length * 0.1)); // top 10% of authors
  const topSum = Object.values(authorMsgCount).sort((a, b) => b - a).slice(0, topN).reduce((a, b) => a + b, 0);
  const engagement = {
    activeMembers7d,
    activeMembers30d,
    stickiness: activeMembers30d ? +(activeMembers7d / activeMembers30d).toFixed(2) : 0,
    messagesPerDay,
    postingMembersPerDay,
    participationRate: server.memberTotal ? +(activeMembers30d / server.memberTotal).toFixed(2) : 0,
    topContributorsConcentration: totalMsgs ? +(topSum / totalMsgs).toFixed(2) : 0,
  };

  // ---- growth: snapshots + joins (from joined_at) + inferred leaves --------
  const snaps = (prev?.growth?.memberSnapshots || []).filter((s) => s.date !== dayKey(now));
  snaps.push({ date: dayKey(now), members: server.memberTotal ?? null });
  const memberSnapshots = snaps.slice(-90);

  const joinsByDay = {};
  for (const m of members) {
    if (!m.joined_at) continue;
    const ts = Date.parse(m.joined_at);
    if (now - ts <= 30 * DAY) joinsByDay[dayKey(ts)] = (joinsByDay[dayKey(ts)] || 0) + 1;
  }
  const joins = last(14).map((d) => ({ date: d, count: joinsByDay[d] || 0 }));
  const joins30d = Object.values(joinsByDay).reduce((a, b) => a + b, 0);

  // Leaves aren't directly queryable. Infer today's leaves from the member-count
  // delta since the previous run: leaves = max(0, prevTotal + joinsSince - curTotal).
  // Accumulate a rolling per-day leaves series in the committed file.
  const prevLeaves = (prev?.growth?.leaves || []).filter((l) => l.date !== dayKey(now));
  let leavesToday = 0;
  if (prev?.server?.memberTotal != null && server.memberTotal != null) {
    const joinsSince = Object.entries(joinsByDay)
      .filter(([d]) => Date.parse(d) > prevRunAt).reduce((a, [, n]) => a + n, 0);
    leavesToday = Math.max(0, prev.server.memberTotal + joinsSince - server.memberTotal);
  }
  prevLeaves.push({ date: dayKey(now), count: leavesToday });
  const leaves = prevLeaves.slice(-30);
  const leaves30d = leaves.reduce((a, l) => a + l.count, 0);
  const netGrowth30d = joins30d - leaves30d;
  const churnRate30d = server.memberTotal ? +((leaves30d / server.memberTotal) * 100).toFixed(1) : 0;

  // ---- retention cohorts (approximate, snapshot-derived) -------------------
  // Group members by ISO join-week; "activeWeekN" = cohort members seen posting
  // in the N-th week after their join. Only computable for weeks within our read
  // window; earlier weeks are carried forward from the previous file.
  const cohortMembers = {};
  for (const m of members) {
    if (!m.joined_at || m.user?.bot) continue;
    const jts = Date.parse(m.joined_at);
    if (now - jts > 56 * DAY) continue; // last ~8 weeks
    const wk = isoWeek(jts);
    (cohortMembers[wk] = cohortMembers[wk] || []).push({ id: m.user.id, jts });
  }
  const cohorts = Object.entries(cohortMembers).sort((a, b) => a[0].localeCompare(b[0])).map(([cohort, mem]) => {
    const row = { cohort, size: mem.length };
    for (let w = 1; w <= 3; w++) {
      const anyInWindow = mem.some((x) => now - x.jts >= (w - 1) * 7 * DAY);
      if (!anyInWindow) break; // week hasn't elapsed yet
      // active if the member posted at all in our read window (approximation)
      row[`activeWeek${w}`] = mem.filter((x) => active30.has(x.id)).length;
    }
    return row;
  });
  const retention = {
    cohorts: cohorts.length ? cohorts : (prev?.retention?.cohorts || []),
    note: "approximate, built from join + activity snapshots (not Discord Server Insights)",
  };

  const out = {
    updatedAt: iso(now),
    server,
    growth: { memberSnapshots, joins, leaves, joins30d, leaves30d, netGrowth30d, churnRate30d },
    engagement,
    channels,
    roles,
    retention,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT} — members=${server.memberTotal}, channels=${channels.length}, active30d=${activeMembers30d}, cohorts=${retention.cohorts.length}`);
}

main().catch((e) => { console.error("fetch-discord failed:", e.message); process.exit(1); });
