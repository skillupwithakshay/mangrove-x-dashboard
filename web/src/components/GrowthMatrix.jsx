import { C, fmt, num, CHANNELS } from "../lib/theme.js";
import { INTERVALS, seriesFor } from "../lib/growth.js";

const NAMES = { x: "X", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" };

// Tiny inline sparkline of the last ~30 snapshot points. Renders nothing until
// at least two days are banked (honest empty, not a flat fake line).
function Spark({ points, color }) {
  const pts = (points || []).slice(-30);
  if (pts.length < 2) return <span style={{ color: C.faint, fontSize: 11 }}>—</span>;
  const w = 68, h = 20;
  const vals = pts.map((p) => p.value);
  const mn = Math.min(...vals), rng = (Math.max(...vals) - mn) || 1;
  const step = w / (pts.length - 1);
  const d = pts.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p.value - mn) / rng) * (h - 2) - 1).toFixed(1)}`).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={d} fill="none" stroke={up ? C.teal : C.coral} strokeWidth="1.5" />
    </svg>
  );
}

// Heatmap tint for a growth %. Subtle on the light theme.
function tint(pct) {
  if (pct == null) return "transparent";
  const a = Math.min(0.18, Math.abs(pct) / 100 * 0.18 + 0.05);
  return pct >= 0 ? `rgba(14,124,102,${a})` : `rgba(194,74,54,${a})`;
}

function Cell({ g }) {
  // Not enough history for this interval → honest "tracking since", never a number.
  if (!g || !g.tracked) {
    const since = g && g.firstTracked;
    return (
      <td style={{ padding: "8px 6px", textAlign: "center", color: C.faint, fontSize: 11.5 }}>
        {since ? `tracking since ${since}` : "—"}
      </td>
    );
  }
  if (g.lowBase) {
    return (
      <td style={{ padding: "8px 6px", textAlign: "center", color: C.sub, fontSize: 12 }} title="Base too small for a meaningful %">
        {g.delta >= 0 ? "+" : ""}{fmt(g.delta)} <span style={{ color: C.faint }}>(low base)</span>
      </td>
    );
  }
  const up = g.pct >= 0;
  return (
    <td style={{ padding: "8px 6px", textAlign: "center", background: tint(g.pct), ...num }}>
      <div style={{ fontWeight: 800, color: up ? C.teal : C.coral, fontSize: 13 }}>
        {up ? "▲" : "▼"} {Math.abs(g.pct)}%
      </div>
      <div style={{ fontSize: 11, color: C.faint }}>{g.delta >= 0 ? "+" : ""}{fmt(g.delta)}</div>
    </td>
  );
}

// matrix: [{platform, metric, firstTracked, cells:{7D,30D,6M,1Y}}]
// manifest: {platform: "live"|"sample"|"missing"}; idx: snapshot index (sparklines)
export default function GrowthMatrix({ matrix, manifest = {}, idx = {} }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: C.sub }}>
            <th style={{ padding: "6px 6px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Channel</th>
            <th style={{ padding: "6px 6px", textAlign: "center", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Trend</th>
            <th style={{ padding: "6px 6px", textAlign: "right", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Audience</th>
            {INTERVALS.map((i) => (
              <th key={i.key} style={{ padding: "6px 6px", textAlign: "center", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>{i.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => {
            const cur = row.cells["30D"]?.current ?? row.cells["7D"]?.current ?? row.cells["1Y"]?.current;
            const isSample = manifest[row.platform] === "sample";
            return (
              <tr key={row.platform} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CHANNELS[row.platform], marginRight: 8 }} />
                  {NAMES[row.platform]}
                  {isSample && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 5, padding: "1px 5px" }}>SAMPLE</span>
                  )}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ display: "inline-block" }}><Spark points={seriesFor(idx, row.platform, row.metric)} /></div>
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, ...num }}>{cur != null ? fmt(cur) : "—"}</td>
                {INTERVALS.map((i) => <Cell key={i.key} g={row.cells[i.key]} />)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
