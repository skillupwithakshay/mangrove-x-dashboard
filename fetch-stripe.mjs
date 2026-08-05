#!/usr/bin/env node
/**
 * fetch-stripe.mjs
 * ----------------
 * Writes data/stripe.json — the payments dataset the Acquisition funnel reads
 * (see fetch-funnel.mjs and web/src/components/AcquisitionPanel.jsx). It lights
 * up the funnel's "Reached payment" and "Paid" stages, plus the checkout funnel.
 *
 * AUTH (env only — never printed, logged, or committed):
 *   STRIPE_API_KEY   a Stripe RESTRICTED key (rk_live_… or rk_test_…) with
 *                    READ access to: Charges, PaymentIntents, Checkout Sessions
 *                    (Balance transactions optional). Read scopes only.
 *
 * CONTRACT written to data/stripe.json:
 *   {
 *     updatedAt, mode ("live"|"test"), windowDays,
 *     paidCount,        // succeeded payments in the window  → funnel "Paid"
 *     reachedPayment,   // checkout sessions started in the window → "Reached payment"
 *     grossRevenue,     // sum of paid amounts (major units, e.g. dollars)
 *     currency,         // dominant currency of paid charges (lowercase)
 *     refundedCount,    // refunded payments in the window (context)
 *     newCustomers      // customers created in the window (context)
 *   }
 *
 * DESIGN — honesty first (mirrors the other fetchers):
 *   - Every section is optional: if the restricted key can't read a resource,
 *     that field degrades to null rather than aborting; a valid file is still
 *     written so the funnel keeps rendering (pending stages stay pending).
 *   - Read-only; no writes to Stripe. Bounded by a 30-day created[gte] window
 *     and cursor pagination, well within Stripe's rate limits.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data", "stripe.json");
const API = "https://api.stripe.com/v1";

const KEY = process.env.STRIPE_API_KEY;
if (!KEY) {
  console.error("Missing STRIPE_API_KEY env var.");
  process.exit(1);
}
const HEADERS = { Authorization: `Bearer ${KEY}` };
const MODE = KEY.includes("_test_") ? "test" : "live";

const DAY = 86400000;
const WINDOW_DAYS = 30;
const since = Math.floor((Date.now() - WINDOW_DAYS * DAY) / 1000); // Stripe uses epoch seconds
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- rate-limit-aware GET (handles 429 + light retry) -----------------------
async function api(path, { tolerate = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: HEADERS });
    if (res.status === 429) {
      await sleep(1000 + attempt * 500);
      continue;
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (tolerate) {
        console.warn(`GET ${path.split("?")[0]} → ${res.status} (tolerated): ${body}`);
        return null;
      }
      throw new Error(`GET ${path.split("?")[0]} → ${res.status} ${body}`);
    }
    await sleep(80); // gentle pacing
    return res.json();
  }
  if (tolerate) return null;
  throw new Error(`GET ${path.split("?")[0]} → repeatedly rate-limited`);
}

// Page through a Stripe list endpoint (cursor pagination via starting_after).
// `base` must already include its leading params (e.g. "created[gte]=...").
// Returns all items, or null if the very first page is unreadable (tolerated).
async function listAll(resource, base, cap = 5000) {
  const out = [];
  let startingAfter = null;
  for (let i = 0; i < 100 && out.length < cap; i++) {
    const q = `${base}&limit=100${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
    const page = await api(`/${resource}?${q}`, { tolerate: true });
    if (!page) return out.length ? out : null; // first-page failure → null (no access)
    const data = page.data || [];
    out.push(...data);
    if (!page.has_more || !data.length) break;
    startingAfter = data[data.length - 1].id;
  }
  return out;
}

function loadPrev() {
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; }
}

async function main() {
  const prev = loadPrev();

  // ---- payments (Charges) -> paidCount, grossRevenue, currency, refunds ----
  let paidCount = null, grossRevenue = null, currency = null, refundedCount = null;
  const charges = await listAll("charges", `created[gte]=${since}`);
  if (charges) {
    const paid = charges.filter((c) => c.paid && c.status === "succeeded" && !c.refunded);
    paidCount = paid.length;
    refundedCount = charges.filter((c) => c.refunded).length;
    // Sum in major units per Stripe's zero-decimal rules kept simple: assume
    // 2-decimal currencies (usd/eur/gbp/…). Adjust if you sell in JPY etc.
    const cents = paid.reduce((a, c) => a + (c.amount_captured || c.amount || 0), 0);
    grossRevenue = +(cents / 100).toFixed(2);
    const byCur = {};
    for (const c of paid) byCur[c.currency] = (byCur[c.currency] || 0) + 1;
    currency = Object.entries(byCur).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  // ---- reached payment (Checkout Sessions) ---------------------------------
  // A started checkout session means the customer reached the hosted payment
  // page. If Checkout isn't used/readable, fall back to PaymentIntents created.
  let reachedPayment = null;
  const sessions = await listAll("checkout/sessions", `created[gte]=${since}`);
  if (sessions) {
    reachedPayment = sessions.length;
  } else {
    const intents = await listAll("payment_intents", `created[gte]=${since}`);
    if (intents) reachedPayment = intents.length;
  }

  // ---- new customers (context) ---------------------------------------------
  let newCustomers = null;
  const customers = await listAll("customers", `created[gte]=${since}`);
  if (customers) newCustomers = customers.length;

  const out = {
    updatedAt: new Date().toISOString(),
    mode: MODE,
    windowDays: WINDOW_DAYS,
    // Preserve last-known values if a field couldn't be read this run, so a
    // partial-permission key never blanks a stage that previously worked.
    paidCount: paidCount ?? prev?.paidCount ?? null,
    reachedPayment: reachedPayment ?? prev?.reachedPayment ?? null,
    grossRevenue: grossRevenue ?? prev?.grossRevenue ?? null,
    currency: currency ?? prev?.currency ?? null,
    refundedCount: refundedCount ?? prev?.refundedCount ?? null,
    newCustomers: newCustomers ?? prev?.newCustomers ?? null,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    `Wrote ${OUT} — mode=${MODE}, paid=${out.paidCount}, reachedPayment=${out.reachedPayment}, ` +
    `revenue=${out.grossRevenue} ${out.currency || ""}`.trim()
  );
}

main().catch((e) => { console.error("fetch-stripe failed:", e.message); process.exit(1); });
