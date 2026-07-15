// Deterministic, rules-based one-liner (no LLM). Given the 30-day growth matrix
// rows (primary-audience only), it names the leader by absolute new audience,
// its share of total new audience, and flags flat/declining channels. Low-base
// channels are excluded from the percentage/leader math so a "+2 → +50%" blip
// never dominates the story.

const NAMES = {
  x: "X", youtube: "YouTube", instagram: "Instagram",
  tiktok: "TikTok", linkedin: "LinkedIn",
};

export function buildInsight(matrix) {
  // matrix: [{platform, cells: {"30D": {delta, pct, lowBase, tracked}}}]
  const rows = (matrix || [])
    .map((r) => ({ platform: r.platform, g: r.cells && r.cells["30D"] }))
    .filter((r) => r.g && r.g.tracked && r.g.delta != null);

  if (!rows.length) return "Not enough tracked history yet — growth over time appears as days are banked.";

  const gained = rows.filter((r) => !r.g.lowBase && r.g.delta > 0);
  const totalNew = gained.reduce((a, r) => a + r.g.delta, 0);

  if (!gained.length) {
    const flat = rows.filter((r) => r.g.delta === 0).map((r) => NAMES[r.platform]);
    const down = rows.filter((r) => r.g.delta < 0).map((r) => NAMES[r.platform]);
    if (down.length) return `Audience is soft this month — ${down.join(", ")} declined; others flat.`;
    if (flat.length) return `Audience held flat across ${flat.join(", ")} over the last 30 days.`;
    return "Audience is roughly flat over the last 30 days.";
  }

  const leader = gained.reduce((a, b) => (b.g.delta > a.g.delta ? b : a));
  const share = totalNew > 0 ? Math.round((leader.g.delta / totalNew) * 100) : 0;
  const flatOrDown = rows
    .filter((r) => r.g.delta <= 0)
    .map((r) => NAMES[r.platform]);

  let s = `${NAMES[leader.platform]} led growth over the last 30 days (+${leader.g.delta.toLocaleString()}`;
  if (leader.g.pct != null) s += `, ${leader.g.pct >= 0 ? "+" : ""}${leader.g.pct}%`;
  s += `), ${share}% of all new audience`;
  if (flatOrDown.length) s += `; ${flatOrDown.join(", ")} flat or down`;
  return s + ".";
}
