// fetch-hubspot.mjs  (consultant edition)
// Pulls read-only CRM metrics from HubSpot and writes data/hubspot.json.
// Measures the revenue ENGINE (health, funnel, attribution) — not just vanity counts.
// Runs in the daily GitHub Actions workflow alongside the social fetchers.
// Requires env var: HUBSPOT_TOKEN  (a HubSpot Private App token, read-only scopes)
// Node 18+ (uses global fetch). No external dependencies.

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error("Missing HUBSPOT_TOKEN env var");
  process.exit(1);
}

const BASE = "https://api.hubapi.com";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0); // 1 decimal %

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Total count for a filtered search (limit:1 trick — no need to pull records).
async function count(objectType, filters = []) {
  const data = await apiPost(`/crm/v3/objects/${objectType}/search`, {
    filterGroups: filters.length ? [{ filters }] : [],
    properties: ["hs_object_id"],
    limit: 1,
  });
  await sleep(150);
  return data.total ?? 0;
}

// --- CRM HEALTH: makes the neglect visible ---
async function crmHealth(totalContacts) {
  const unowned = await count("contacts", [
    { propertyName: "hubspot_owner_id", operator: "NOT_HAS_PROPERTY" },
  ]);
  const neverContacted = await count("contacts", [
    { propertyName: "notes_last_contacted", operator: "NOT_HAS_PROPERTY" },
  ]);
  const missingEmail = await count("contacts", [
    { propertyName: "email", operator: "NOT_HAS_PROPERTY" },
  ]);
  // Simple 0-100 health score: penalize unowned + uncontacted + missing email.
  const score = Math.max(
    0,
    Math.round(100 - (pct(unowned, totalContacts) + pct(neverContacted, totalContacts) + pct(missingEmail, totalContacts)) / 3)
  );
  return {
    score,
    unowned, unownedPct: pct(unowned, totalContacts),
    neverContacted, neverContactedPct: pct(neverContacted, totalContacts),
    missingEmail, missingEmailPct: pct(missingEmail, totalContacts),
    reactivationOpportunity: neverContacted, // paid-for leads sitting idle
  };
}

// --- SOURCE x LIFECYCLE: conversion by channel, not just volume ---
const SOURCES = [
  "ORGANIC_SEARCH", "PAID_SEARCH", "PAID_SOCIAL", "SOCIAL_MEDIA",
  "EMAIL_MARKETING", "REFERRALS", "DIRECT_TRAFFIC", "OFFLINE",
];
const STAGES = [
  "subscriber", "lead", "marketingqualifiedlead",
  "salesqualifiedlead", "opportunity", "customer", "evangelist",
];

async function contactsBySource() {
  const out = {};
  for (const s of SOURCES) {
    out[s] = await count("contacts", [
      { propertyName: "hs_analytics_source", operator: "EQ", value: s },
    ]);
  }
  return out;
}

async function lifecycleFunnel() {
  const out = {};
  for (const st of STAGES) {
    out[st] = await count("contacts", [
      { propertyName: "lifecyclestage", operator: "EQ", value: st },
    ]);
  }
  return out;
}

// Social-sourced funnel: how Paid + Organic Social contacts progress.
async function socialFunnel() {
  const out = {};
  for (const st of STAGES) {
    out[st] = await count("contacts", [
      { propertyName: "hs_analytics_source", operator: "IN", values: ["PAID_SOCIAL", "SOCIAL_MEDIA"] },
      { propertyName: "lifecyclestage", operator: "EQ", value: st },
    ]);
  }
  return out;
}

// --- ACQUISITION TREND: overlay against social activity for the closed loop ---
async function monthlyContactTrend(months = 6) {
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const n = await count("contacts", [
      { propertyName: "createdate", operator: "GTE", value: String(start.getTime()) },
      { propertyName: "createdate", operator: "LT", value: String(end.getTime()) },
    ]);
    out.push({ month: start.toISOString().slice(0, 7), count: n });
  }
  return out;
}

async function newContactsLast30d() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return count("contacts", [
    { propertyName: "createdate", operator: "GTE", value: String(cutoff) },
  ]);
}

// --- PIPELINE: value by stage, won vs open ---
async function dealSummary() {
  let after;
  let total = 0, wonCount = 0, wonValue = 0, openCount = 0, openValue = 0;
  const byStage = {};
  do {
    const body = { filterGroups: [], properties: ["amount", "dealstage"], limit: 100 };
    if (after) body.after = after;
    const data = await apiPost("/crm/v3/objects/deals/search", body);
    for (const d of data.results ?? []) {
      const amt = parseFloat(d.properties.amount || "0") || 0;
      const stage = d.properties.dealstage || "unknown";
      total += 1;
      byStage[stage] = byStage[stage] || { count: 0, value: 0 };
      byStage[stage].count += 1;
      byStage[stage].value += amt;
      if (stage === "closedwon") { wonCount += 1; wonValue += amt; }
      else if (stage !== "closedlost") { openCount += 1; openValue += amt; }
    }
    after = data.paging?.next?.after;
    await sleep(150);
  } while (after);
  return { total, wonCount, wonValue, openCount, openValue, byStage };
}

async function formCount() {
  try {
    let n = 0, after;
    do {
      const q = after ? `?limit=50&after=${after}` : `?limit=50`;
      const data = await apiGet(`/marketing/v3/forms/${q}`);
      n += data.results?.length ?? 0;
      after = data.paging?.next?.after;
      await sleep(150);
    } while (after);
    return n;
  } catch (e) {
    console.warn("Forms fetch skipped (needs 'forms' scope):", e.message);
    return null;
  }
}

async function main() {
  const totalContacts = await count("contacts");
  const totalCompanies = await count("companies");
  const health = await crmHealth(totalContacts);
  const bySource = await contactsBySource();
  const funnel = await lifecycleFunnel();
  const social = await socialFunnel();
  const trend = await monthlyContactTrend(6);
  const newLast30d = await newContactsLast30d();
  const deals = await dealSummary();
  const forms = await formCount();

  const payload = {
    updatedAt: new Date().toISOString(),
    health,
    contacts: { total: totalContacts, newLast30d, bySource, funnel, socialFunnel: social, monthlyTrend: trend },
    companies: { total: totalCompanies },
    deals,
    forms: { total: forms },
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/hubspot.json", JSON.stringify(payload, null, 2));
  console.log("Wrote data/hubspot.json");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
