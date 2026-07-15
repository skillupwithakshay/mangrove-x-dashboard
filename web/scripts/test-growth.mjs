// Correctness test for the growth/insight compute layer (run: node scripts/test-growth.mjs).
// Verifies growth %, low-base flagging, blended audience (PyPI excluded),
// and that pre-tracking intervals return an untracked result (→ "tracking since").
import assert from "node:assert/strict";
import {
  indexSnapshots, growth, growthMatrix, blendedAudience, blendedGrowth,
} from "../src/lib/growth.js";
import { buildInsight } from "../src/lib/insight.js";

const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

const snaps = [
  { platform: "x", metric: "followers", value: 100, date: iso(60) },
  { platform: "x", metric: "followers", value: 115, date: iso(30) },
  { platform: "x", metric: "followers", value: 130, date: iso(0) },
  { platform: "youtube", metric: "subscribers", value: 1000, date: iso(40) },
  { platform: "youtube", metric: "subscribers", value: 1200, date: iso(0) },
  { platform: "instagram", metric: "followers", value: 10, date: iso(30) }, // low base
  { platform: "instagram", metric: "followers", value: 40, date: iso(0) },
];
const idx = indexSnapshots(snaps);

// 30-day X growth: 115 -> 130
const gx = growth(idx, "x", "followers", 30);
assert.equal(gx.tracked, true);
assert.equal(gx.current, 130);
assert.equal(gx.past, 115);
assert.equal(gx.delta, 15);
assert.equal(gx.pct, 13); // 15/115 = 13.0%
assert.equal(gx.lowBase, false);

// Instagram flagged low-base (past 10 < 50) — no misleading % rendered
const gi = growth(idx, "instagram", "followers", 30);
assert.equal(gi.tracked, true);
assert.equal(gi.lowBase, true);

// Interval predating the first data point → untracked (UI shows "tracking since"),
// never a fabricated number. This is the core honesty guarantee.
const gFar = growth(idx, "youtube", "subscribers", 365 * 5);
assert.equal(gFar.tracked, false);
const gNone = growth(idx, "tiktok", "followers", 30);
assert.equal(gNone.tracked, false);
assert.equal(gNone.current, null);

// Blended audience = X + YouTube + Instagram (PyPI never included)
assert.equal(blendedAudience(idx, {}), 130 + 1200 + 40);
const bg = blendedGrowth(idx, 30);
assert.equal(bg.tracked, true);

// Insight is a non-empty deterministic string
const insight = buildInsight(growthMatrix(idx));
assert.equal(typeof insight, "string");
assert.ok(insight.length > 0);

console.log("blended:", blendedAudience(idx, {}), "| x 30d:", gx.pct + "%", "| insight:", insight);
console.log("ALL GROWTH/INSIGHT TESTS PASSED");
