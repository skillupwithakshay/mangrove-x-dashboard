// Shared design tokens + formatting helpers used by every data-source panel.
// Light theme matching mangrove.ai's content sections: soft neutral canvas,
// white cards, deep-teal primary with the brand's gold / coral / blue / pink
// accents. Token keys are kept stable so panels adapt automatically.

export const C = {
  // text
  ink: "#0E1B16",     // primary text
  sub: "#5A6B62",     // secondary text
  faint: "#93A29A",   // tertiary / axis labels

  // surfaces
  bg: "#EEF2F1",      // page canvas (soft cool off-white)
  bg2: "#F7F9F8",     // inner panel surface
  card: "#FFFFFF",    // KPI / card surface
  cardHi: "#FFFFFF",  // tooltip / raised surface
  line: "#E4EAE7",    // borders / gridlines

  // accents (brand spectrum, tuned for contrast on light)
  teal: "#0E7C66",    // primary accent
  tealLine: "#16A085",
  tealSoft: "#DCEDE8",
  gold: "#B67F26",
  goldSoft: "#F6ECD7",
  coral: "#C24A36",
  sky: "#2F7FB8",     // logo blue
  pink: "#BE4C74",    // brand pink

  // semantic soft-surface + ink pairs for alert/callout/sample boxes
  goldSoftBorder: "#EADFC2",
  goldInk: "#7A5B2E",
  coralSoft: "#FBEAE6",
  coralInk: "#8A3324",
};

// Shared chart tooltip style — previously duplicated verbatim in every panel.
export const TIP = {
  background: C.cardHi,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  fontSize: 12,
  padding: "8px 10px",
  color: C.ink,
};

// Standard chart heights and corner radii so panels feel uniform.
export const H = { chart: 220, chartSm: 200 };
export const R = { sm: 8, md: 12, lg: 16 };

// Per-channel accent colors, echoing the logo's blue→teal→gold→orange→pink arc.
export const CHANNELS = {
  x: C.teal,
  youtube: C.coral,
  instagram: C.gold,
  tiktok: C.pink,
  linkedin: C.sky,
  pypi: C.gold,
};

// Official channel links. PyPI/downloads point to the site; TikTok handle
// confirmed as @mangrove.ai.
export const LINKS = {
  x: "https://x.com/Mangrove_AI",
  youtube: "https://www.youtube.com/@Mangrove-AI",
  instagram: "https://www.instagram.com/mangrove.ai/",
  tiktok: "https://www.tiktok.com/@mangrove.ai",
  linkedin: "https://www.linkedin.com/company/mangrove-technologies-inc/",
  pypi: "https://mangrove.ai/",
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

// Normalize any ISO date / "YYYY-MM-DD" to a compact "MMM D" label. Guards
// against full timestamps leaking into axis labels.
export const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(typeof v === "string" && v.length <= 10 ? v + "T00:00:00Z" : v);
  if (isNaN(d)) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
