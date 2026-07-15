import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Users, Package, TrendingUp, Sparkles } from "lucide-react";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import GrowthMatrix from "./GrowthMatrix.jsx";
import { C, fmt, num, CHANNELS } from "../lib/theme.js";

const NAMES = { x: "X", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" };

export default function OverviewTab({
  period, setPeriod, blended, trackedCount, blendedG,
  pypiTotal, pypiWindow, insight, matrix, manifest, indexed, idx,
}) {
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  function downloadCsv() {
    const head = ["channel", "audience", "7D_%", "30D_%", "6M_%", "1Y_%"];
    const cell = (g) => (!g || !g.tracked ? "" : g.lowBase ? "low-base" : g.pct);
    const lines = [head.join(",")];
    (matrix || []).forEach((r) => {
      const cur = r.cells["30D"]?.current ?? r.cells["7D"]?.current ?? "";
      lines.push([r.platform, cur, cell(r.cells["7D"]), cell(r.cells["30D"]), cell(r.cells["6M"]), cell(r.cells["1Y"])].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mangrove-growth.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const btn = { border: `1px solid ${C.line}`, background: C.card, color: C.sub, borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
  return (
    <div>
      {/* headline row: blended audience + PyPI adoption (kept separate) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: "2 1 320px", minWidth: 260, background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.teal}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.teal }}>
            <Users size={16} strokeWidth={2.2} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, letterSpacing: 0.3, textTransform: "uppercase" }}>Blended audience</span>
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, ...num }}>{fmt(blended)}</span>
            {blendedG.tracked ? (
              <span style={{ fontSize: 15, fontWeight: 800, color: blendedG.pct >= 0 ? C.teal : C.coral, ...num }}>
                {blendedG.pct >= 0 ? "▲" : "▼"} {Math.abs(blendedG.pct)}% <span style={{ color: C.faint, fontWeight: 600 }}>· {blendedG.delta >= 0 ? "+" : ""}{fmt(blendedG.delta)} / {period}</span>
              </span>
            ) : (
              <span style={{ fontSize: 12.5, color: C.faint }}>growth over {period} appears as history is banked</span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: C.faint }}>
            followers/subscribers across {trackedCount} of 5 channels tracked live · excludes PyPI
          </div>
        </div>

        <div style={{ flex: "1 1 200px", minWidth: 180, background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.gold }}>
            <Package size={16} strokeWidth={2.2} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, letterSpacing: 0.3, textTransform: "uppercase" }}>PyPI adoption</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, ...num }}>{fmt(pypiTotal)}</div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: C.faint }}>downloads · {pypiWindow || "rolling ~180 days"} · not audience</div>
        </div>
      </div>

      {/* auto-insight */}
      {insight && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px", marginBottom: 14, fontSize: 13.5, color: C.ink }}>
          <Sparkles size={15} color={C.teal} style={{ flexShrink: 0 }} />
          <span>{insight}</span>
        </div>
      )}

      {/* growth matrix */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Growth by channel and period" icon={TrendingUp}
               right={
                 <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                   <PeriodTabs value={period} onChange={setPeriod} accent={C.teal} />
                   <button className="no-print" onClick={downloadCsv} style={btn}>CSV</button>
                 </div>
               }>
          <GrowthMatrix matrix={matrix} manifest={manifest} idx={idx} />
        </Panel>
      </div>

      {/* comparable, indexed trend */}
      <Panel title={`Comparable growth · indexed to 100 at period start · ${period}`} icon={TrendingUp}>
        {indexed && indexed.rows.length >= 2 && indexed.platforms.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={indexed.rows} margin={{ left: -10, right: 8, top: 6 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} width={40} domain={["auto", "auto"]} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {indexed.platforms.map((p) => (
                <Line key={p} type="monotone" dataKey={p} name={NAMES[p]} stroke={CHANNELS[p]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: C.faint, fontSize: 13, padding: "18px 4px" }}>
            Collecting daily history — comparable trend lines appear once at least two days are banked per channel.
          </div>
        )}
      </Panel>
    </div>
  );
}
