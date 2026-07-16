#!/usr/bin/env node
/**
 * fetch-ga4.mjs
 * -------------
 * Writes data/ga4.json — website metrics for the dashboard's "Acquisition" tab.
 * Uses a Google service account (no user OAuth) to call the GA4 Data API.
 *
 * AUTH (env only — never printed, logged, or committed):
 *   GA4_PROPERTY_ID   numeric GA4 property id (Admin → Property Settings).
 *   GA4_SA_KEY        the full service-account JSON key (as a single secret).
 *                     Grant the service account "Viewer" on the GA4 property.
 *
 * Emits the contract AcquisitionPanel documents:
 *   { updatedAt, activeUsers, newUsers, sessions,
 *     trafficBySource:[{source,users}], topPages:[{path,views}],
 *     keyEvents:[{name,count}] }
 *
 * The dashboard shows a "GA4 integration pending" placeholder until this file
 * exists, so it is safe to add the secrets later — nothing fakes GA4 data.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data", "ga4.json");

const PROPERTY = process.env.GA4_PROPERTY_ID;
const RAW_KEY = process.env.GA4_SA_KEY;
if (!PROPERTY || !RAW_KEY) {
  console.error("Missing GA4_PROPERTY_ID and/or GA4_SA_KEY env vars.");
  process.exit(1);
}

let SA;
try { SA = JSON.parse(RAW_KEY); } catch { console.error("GA4_SA_KEY is not valid JSON."); process.exit(1); }

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function accessToken() {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec, exp: nowSec + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(SA.private_key));
  const assertion = `${header}.${claim}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`token exchange → ${res.status} ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).access_token;
}

async function runReport(token, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`runReport → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const dateRange = [{ startDate: "28daysAgo", endDate: "today" }];
const metricVal = (rep, i = 0) => Number(rep?.rows?.[0]?.metricValues?.[i]?.value || 0);

async function main() {
  const token = await accessToken();

  const totals = await runReport(token, {
    dateRanges: dateRange,
    metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }],
  });

  const bySource = await runReport(token, {
    dateRanges: dateRange,
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    limit: 8,
  });

  const pages = await runReport(token, {
    dateRanges: dateRange,
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 8,
  });

  const events = await runReport(token, {
    dateRanges: dateRange,
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 10,
  });

  const out = {
    updatedAt: new Date().toISOString(),
    activeUsers: metricVal(totals, 0),
    newUsers: metricVal(totals, 1),
    sessions: metricVal(totals, 2),
    trafficBySource: (bySource.rows || []).map((r) => ({ source: r.dimensionValues[0].value, users: Number(r.metricValues[0].value || 0) })),
    topPages: (pages.rows || []).map((r) => ({ path: r.dimensionValues[0].value, views: Number(r.metricValues[0].value || 0) })),
    keyEvents: (events.rows || []).map((r) => ({ name: r.dimensionValues[0].value, count: Number(r.metricValues[0].value || 0) })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT} — activeUsers=${out.activeUsers}, sources=${out.trafficBySource.length}, pages=${out.topPages.length}`);
}

main().catch((e) => { console.error("fetch-ga4 failed:", e.message); process.exit(1); });
