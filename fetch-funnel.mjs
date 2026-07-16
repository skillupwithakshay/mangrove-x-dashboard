#!/usr/bin/env node
/**
 * fetch-funnel.mjs
 * ----------------
 * Composes data/funnel.json — the cross-source Community → Revenue funnel the
 * "Acquisition" tab renders. This is an ASSEMBLER, not a fetcher: it reads the
 * per-source files that already exist and stitches them into one funnel, marking
 * each stage "live" (with a value) or "pending" (with the specific instrumentation
 * it still needs). No credentials, no external calls.
 *
 * Sources it reads if present (all optional):
 *   data/discord.json  → Discord joined / active
 *   data/ga4.json      → website visits
 *   data/stripe.json   → payments (future: { paidCount })
 *   data/product.json  → signup / activation (future: { signups, activations })
 *   data/links.json    → UTM click-throughs (future: { clicks })
 *
 * The dashboard reads funnel.json when it exists (fully data-driven); until then
 * the panel builds an equivalent default from discord.json/ga4.json directly. So
 * running this is optional but makes the funnel authoritative from one file and
 * ready to absorb Stripe/product/UTM sources with zero UI changes.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const OUT = join(DATA, "funnel.json");

const load = (name) => { try { return JSON.parse(readFileSync(join(DATA, name), "utf8")); } catch { return null; } };

const discord = load("discord.json");
const ga4 = load("ga4.json");
const stripe = load("stripe.json");   // future
const product = load("product.json"); // future
const links = load("links.json");     // future

// stage(value, source, reasonIfPending) — live when value is a finite number.
const stage = (key, label, source, value, reason) => {
  const live = typeof value === "number" && isFinite(value);
  return { key, label, source, value: live ? value : null, status: live ? "live" : "pending", reason };
};

const stages = [
  stage("joined", "Discord joined", "discord", discord?.server?.memberTotal, "awaiting Discord data"),
  stage("active", "Active in community", "discord", discord?.engagement?.activeMembers30d, "awaiting Discord data"),
  stage("clicked", "Clicked through", "links", links?.clicks, "awaiting UTM tagging"),
  stage("visited", "Website visit", "ga4", ga4?.activeUsers, "awaiting GA4 integration"),
  stage("signup", "Signed up", "product", product?.signups, "awaiting product event tracking"),
  stage("activated", "Activated", "product", product?.activations, "awaiting product event tracking"),
  stage("paid", "Paid", "stripe", stripe?.paidCount, "awaiting Stripe integration"),
];

const checkoutStages = [
  stage("clicked_sub", "Clicked subscribe", "product", product?.subscribeClicks, "awaiting front-end events"),
  stage("reached_pay", "Reached payment", "stripe", stripe?.reachedPayment, "awaiting Stripe integration"),
  stage("paid", "Paid", "stripe", stripe?.paidCount, "awaiting Stripe integration"),
];

const out = { updatedAt: new Date().toISOString(), stages, checkoutStages };
mkdirSync(DATA, { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
const live = stages.filter((s) => s.status === "live").length;
console.log(`Wrote ${OUT} — ${live}/${stages.length} funnel stages live`);
