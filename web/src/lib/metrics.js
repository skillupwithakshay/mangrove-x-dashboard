// Shared metric computations so the same numbers appear everywhere.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Community health: 0–100 blend of engagement stickiness (40%), participation
// (35%) and growth health (25%). Returns the score plus which component lifts
// it most / drags it most, for a one-line explanation. Shared by DiscordPanel
// and the Overview portal.
export function communityHealth(discord) {
  const eng = discord?.engagement || {};
  const g = discord?.growth || {};
  const memberTotal = discord?.server?.memberTotal || 0;
  const stick = clamp(eng.stickiness || 0, 0, 1) * 100;
  const part = clamp(eng.participationRate || 0, 0, 1) * 100;
  const netPct = memberTotal ? ((g.netGrowth30d || 0) / memberTotal) * 100 : 0;
  const growthHealth = clamp(60 + netPct - (g.churnRate30d || 0), 0, 100);
  const score = Math.round(0.40 * stick + 0.35 * part + 0.25 * growthHealth);
  const comps = [
    { k: "engagement stickiness", v: stick },
    { k: "participation", v: part },
    { k: "growth health", v: growthHealth },
  ].sort((a, b) => b.v - a.v);
  return { score, top: comps[0].k, low: comps[comps.length - 1].k };
}
