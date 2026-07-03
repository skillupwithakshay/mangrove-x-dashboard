// Shared design tokens + formatting helpers used by every data-source panel
// (XPanel today, InstagramPanel later) so they look consistent without each
// panel re-declaring its own palette.

export const C = {
  ink: "#0E1B16",
  sub: "#5A6B62",
  faint: "#94A39A",
  bg: "#F2F5F3",
  card: "#FFFFFF",
  line: "#E4EAE6",
  teal: "#0E7C66",
  tealLine: "#16A085",
  tealSoft: "#DCEDE8",
  gold: "#BB8528",
  goldSoft: "#F6ECD7",
  coral: "#C24A36",
  sky: "#3E7CB1",
};

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const num = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export const fmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString();
};

export const pct = (n, d = 2) => (n == null || isNaN(n) ? "—" : n.toFixed(d) + "%");
