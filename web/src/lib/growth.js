// Growth compute layer (option B: client-side over data/snapshots.json).
// Mirrors the brief's SQL: for each platform+metric and interval, compare the
// latest value to the value on-or-before (today - days). A null past value
// means the interval predates tracking → the UI shows "tracking since [date]",
// never a fabricated number. `lowBase` flags tiny denominators so we don't
// render absurd percentages (e.g. +19530%).

export const PRIMARY_AUDIENCE = {
  x: "followers",
  youtube: "subscribers",
  instagram: "followers",
  tiktok: "followers",
  linkedin: "followers",
};

export const AUDIENCE_PLATFORMS = ["x", "youtube", "instagram", "tiktok", "linkedin"];

export const INTERVALS = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
];

const DAY_MS = 86400000;
const LOW_BASE = 50;

const dstr = (d) => d.toISOString().slice(0, 10);

// snapshots: [{platform, metric, value, date}] → index[platform][metric] = sorted asc by date
export function indexSnapshots(snapshots) {
  const idx = {};
  for (const r of snapshots || []) {
    if (!r || !r.date || r.value == null) continue;
    (idx[r.platform] ??= {})[r.metric] ??= [];
    idx[r.platform][r.metric].push({ date: r.date, value: Number(r.value) });
  }
  for (const p of Object.keys(idx))
    for (const m of Object.keys(idx[p]))
      idx[p][m].sort((a, b) => (a.date < b.date ? -1 : 1));
  return idx;
}

const series = (idx, platform, metric) => (idx[platform] && idx[platform][metric]) || [];

// Public accessor for a platform/metric snapshot series (used for sparklines).
export function seriesFor(idx, platform, metric) {
  return series(idx, platform, metric);
}

export function firstTracked(idx, platform, metric) {
  const s = series(idx, platform, metric);
  return s.length ? s[0].date : null;
}

function valueOnOrBefore(s, isoDate) {
  let hit = null;
  for (const pt of s) {
    if (pt.date <= isoDate) hit = pt;
    else break;
  }
  return hit; // {date,value} or null
}

// Growth of one platform/metric over `days`. Returns null fields when the
// window predates available history.
export function growth(idx, platform, metric, days) {
  const s = series(idx, platform, metric);
  const current = s.length ? s[s.length - 1].value : null;
  const cutoff = dstr(new Date(Date.now() - days * DAY_MS));
  const past = valueOnOrBefore(s, cutoff);
  const first = s.length ? s[0].date : null;

  if (current == null) return { current: null, past: null, delta: null, pct: null, lowBase: false, firstTracked: first, tracked: false };
  if (!past) return { current, past: null, delta: null, pct: null, lowBase: false, firstTracked: first, tracked: false };

  const delta = current - past.value;
  const lowBase = past.value < LOW_BASE;
  const pct = past.value > 0 ? Math.round(((delta) / past.value) * 1000) / 10 : null;
  return { current, past: past.value, delta, pct, lowBase, firstTracked: first, tracked: true };
}

// Full matrix: rows = audience platforms, each with growth per interval.
export function growthMatrix(idx) {
  return AUDIENCE_PLATFORMS.map((platform) => {
    const metric = PRIMARY_AUDIENCE[platform];
    const cells = {};
    for (const { key, days } of INTERVALS) cells[key] = growth(idx, platform, metric, days);
    return { platform, metric, firstTracked: firstTracked(idx, platform, metric), cells };
  });
}

// Blended audience = SUM of the five audience metrics' current values (never
// PyPI). `blendedGrowth` sums only platforms that have a comparable past point
// so the % is internally consistent.
export function blendedAudience(idx, latestByPlatform) {
  let current = 0;
  for (const p of AUDIENCE_PLATFORMS) {
    const s = series(idx, p, PRIMARY_AUDIENCE[p]);
    if (s.length) current += s[s.length - 1].value;
    else if (latestByPlatform && latestByPlatform[p] != null) current += latestByPlatform[p];
  }
  return current;
}

export function blendedGrowth(idx, days) {
  let cur = 0, past = 0, haveAny = false;
  for (const p of AUDIENCE_PLATFORMS) {
    const g = growth(idx, p, PRIMARY_AUDIENCE[p], days);
    if (g.tracked) { cur += g.current; past += g.past; haveAny = true; }
  }
  if (!haveAny || past <= 0) return { delta: null, pct: null, tracked: false };
  return { delta: cur - past, pct: Math.round(((cur - past) / past) * 1000) / 10, tracked: true };
}

// Series indexed to 100 at the start of the window — makes small and large
// accounts comparable on one chart. Returns [{date, [platform]: idx100...}].
export function indexedSeries(idx, days) {
  const cutoff = dstr(new Date(Date.now() - days * DAY_MS));
  const dates = new Set();
  const bases = {};
  const perP = {};
  for (const p of AUDIENCE_PLATFORMS) {
    const s = series(idx, p, PRIMARY_AUDIENCE[p]).filter((pt) => pt.date >= cutoff);
    if (s.length < 2) continue;
    bases[p] = s[0].value || 1;
    perP[p] = Object.fromEntries(s.map((pt) => [pt.date, pt.value]));
    s.forEach((pt) => dates.add(pt.date));
  }
  const out = [...dates].sort().map((date) => {
    const row = { date };
    for (const p of Object.keys(perP)) {
      if (perP[p][date] != null) row[p] = Math.round((perP[p][date] / bases[p]) * 1000) / 10;
    }
    return row;
  });
  return { rows: out, platforms: Object.keys(perP) };
}
