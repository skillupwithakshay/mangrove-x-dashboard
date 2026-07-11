// Period filtering for the 7D / 30D / 6M / 1Y tabs. Given a `daily` time series
// (rows with a `date` and numeric metric fields), returns the rows within the
// selected window, the per-metric totals, and period-over-period growth
// (current window vs the immediately preceding window of equal length).
//
// Note: growth/6M/1Y are only as complete as the data the pipeline provides —
// most sources currently return ~30-90 days, so longer windows simply show
// what's available until the pipelines are extended to keep more history.

export const PERIODS = ["7D", "30D", "6M", "1Y"];
export const PERIOD_DAYS = { "7D": 7, "30D": 30, "6M": 180, "1Y": 365 };

const DAY_MS = 86400000;
const parseDay = (d) => new Date(String(d || "").slice(0, 10)).getTime();

export function periodView(daily, period, keys) {
  const rowsAll = Array.isArray(daily) ? daily.filter((r) => r && r.date) : [];
  if (!rowsAll.length) {
    return { rows: [], totals: {}, prev: {}, growth: {}, days: PERIOD_DAYS[period] };
  }
  const days = PERIOD_DAYS[period] || 30;
  const maxT = Math.max(...rowsAll.map((r) => parseDay(r.date) || 0));
  const curStart = maxT - (days - 1) * DAY_MS;
  const prevStart = maxT - (2 * days - 1) * DAY_MS;

  const cur = rowsAll.filter((r) => parseDay(r.date) >= curStart);
  const prev = rowsAll.filter((r) => {
    const t = parseDay(r.date);
    return t >= prevStart && t < curStart;
  });

  const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const totals = {}, prevT = {}, growth = {};
  for (const k of keys) {
    totals[k] = sum(cur, k);
    prevT[k] = sum(prev, k);
    growth[k] = prevT[k] > 0 ? ((totals[k] - prevT[k]) / prevT[k]) * 100 : null;
  }
  return { rows: cur, totals, prev: prevT, growth, days };
}
