#!/usr/bin/env node
/**
 * fetch-ga4.mjs
 * -------------
 * Writes data/ga4.json — website metrics for the dashboard's "Acquisition" tab.
 * Calls the GA4 Data API using a service account via Workload Identity
 * Federation (keyless — no JSON key stored anywhere).
 *
 * AUTH:
 *   GA4_PROPERTY_ID   numeric GA4 property id (Admin → Property Settings).
 *   Credentials come from Application Default Credentials (ADC). In GitHub
 *   Actions, the google-github-actions/auth step sets GOOGLE_APPLICATION_CREDENTIALS
 *   and google-auth-library picks it up automatically. The service account must
 *   have "Viewer" on the GA4 property.
 *
 * Emits the contract AcquisitionPanel documents:
 *   { updatedAt, activeUsers, newUsers, sessions,
 *     trafficBySource:[{source,users}], topPages:[{path,views}],
 *     keyEvents:[{name,count}] }
 *
 * The dashboard shows a "GA4 integration pending" placeholder until this file
 * exists, so it is safe to wire auth later — nothing fakes GA4 data.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data", "ga4.json");

const PROPERTY = process.env.GA4_PROPERTY_ID;
if (!PROPERTY) {
  console.error("Missing GA4_PROPERTY_ID env var.");
  process.exit(1);
}

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/analytics.readonly",
});

async function accessToken() {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain access token from ADC.");
  return token;
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
