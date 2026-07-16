import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Users, Package, TrendingUp, Sparkles, MessageCircle, Building2, DollarSign,
  Globe, HeartPulse, Filter, Radar,
} from "lucide-react";
import Panel from "./Panel.jsx";
import Kpi from "./Kpi.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import GrowthMatrix from "./GrowthMatrix.jsx";
import FunnelChart, { buildRevenueStages } from "./FunnelChart.jsx";
import { communityHealth } from "../lib/metrics.js";
import { C, fmt, pct, num, CHANNELS, TIP, R } from "../lib/theme.js";

const NAMES = { x: "X", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" };
const DISCORD = "#5865F2";

// Governance board: every data source and whether it's serving live data, a
// labelled sample, or is still pending instrumentation.
const SOURCES = [
  { id: "x", label: "X" }, { id: "youtube", label: "YouTube" }, { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" }, { id: "linkedin", label: "LinkedIn" }, { id: "pypi", label: "PyPI" },
  { id: "hubspot", label: "HubSpot CRM" }, { id: "discord", label: "Discord" },
  { id: "ga4", label: "GA4" }, { id: "funnel", label: "Funnel" },
];
const STATUS = {
  live: { txt: "live", color: C.teal },
  sample: { txt: "sample", color: C.gold },
  missing: { txt: "pending", color: C.faint },
};
const scoreColor = (v) => (v >= 66 ? C.teal : v >= 40 ? C.gold : C.coral);

function ScoreCard({ title, icon: Icon, score, accent, note, stats, empty }) {
  if (empty) {
    return (
      <Panel title={title} icon={Icon} accent={accent}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>{empty}</div>
      </Panel>
    );
  }
  const col = scoreColor(score);
  return (
    <Panel title={title} icon={Icon} accent={accent}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8, color: col, ...num }}>{score}</span>
        <span style={{ fontSize: 13, color: C.faint }}>/ 100</span>
      </div>
      <div style={{ height: 8, background: C.bg2, borderRadius: 5, overflow: "hidden", margin: "8px 0 10px" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: col, borderRadius: 5 }} />
      </div>
      {note && <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>{note}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {stats.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, ...num }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.faint }}>{s.label}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function OverviewTab({
  period, setPeriod, blended, trackedCount, blendedG,
  pypiTotal, pypiWindow, insight, matrix, manifest, indexed, idx,
  hs, discord, ga4, funnel,
}) {
  const health = hs?.health || {};
  const contacts = hs?.contacts || {};
  const deals = hs?.deals || {};
  const server = discord?.server || {};
  const eng = discord?.engagement || {};
  const dg = discord?.growth || {};
  const ch = discord ? communityHealth(discord) : null;
  const revenueStages = buildRevenueStages({ discord, ga4, funnel });

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
  const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 };

  return (
    <div>
      {/* executive KPI strip — one number per pillar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <Kpi icon={Users} label="Blended audience" value={fmt(blended)} accent={C.teal}
          sub={blendedG.tracked ? `${blendedG.pct >= 0 ? "▲" : "▼"} ${Math.abs(blendedG.pct)}% / ${period}` : `${trackedCount}/5 channels live`} />
        <Kpi icon={MessageCircle} label="Community" value={fmt(server.memberTotal)} accent={DISCORD}
          sub={eng.activeMembers30d != null ? `${fmt(eng.activeMembers30d)} active / 30d` : "Discord"} />
        <Kpi icon={Building2} label="CRM contacts" value={fmt(contacts.total)} accent={C.sky}
          sub={contacts.newLast30d != null ? `+${fmt(contacts.newLast30d)} new / 30d` : "HubSpot"} />
        <Kpi icon={DollarSign} label="Deals won" value={deals.wonValue != null ? `$${fmt(deals.wonValue)}` : "—"} accent={C.teal}
          sub={deals.wonCount != null ? `${fmt(deals.wonCount)} closed-won` : "HubSpot"} />
        <Kpi icon={Package} label="PyPI downloads" value={fmt(pypiTotal)} accent={C.gold} sub={pypiWindow || "~180 days"} />
        <Kpi icon={Globe} label="Website users" value={ga4?.activeUsers != null ? fmt(ga4.activeUsers) : "—"} accent={"#E8552F"}
          sub={ga4?.activeUsers != null ? "GA4 · 28d" : "GA4 pending"} />
      </div>

      {/* auto-insight */}
      {insight && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: R.md, padding: "11px 14px", marginBottom: 14, fontSize: 13.5, color: C.ink }}>
          <Sparkles size={15} color={C.teal} style={{ flexShrink: 0 }} />
          <span>{insight}</span>
        </div>
      )}

      {/* health scorecards — revenue engine + community */}
      <div style={grid2}>
        <ScoreCard
          title="CRM health" icon={HeartPulse} accent={C.sky}
          score={health.score}
          empty={hs ? null : "Revenue engine not connected yet."}
          note={health.reactivationOpportunity != null ? `${fmt(health.reactivationOpportunity)} leads acquired but never contacted — the reactivation opportunity.` : null}
          stats={[
            { value: pct(health.unownedPct, 0), label: "unowned" },
            { value: pct(health.neverContactedPct, 0), label: "never contacted" },
            { value: fmt(contacts.total), label: "contacts" },
          ]}
        />
        <ScoreCard
          title="Community health" icon={MessageCircle} accent={DISCORD}
          score={ch?.score}
          empty={discord ? null : "Discord not connected yet."}
          note={ch ? `Most lifted by ${ch.top}; biggest opportunity is ${ch.low}.` : null}
          stats={[
            { value: (eng.stickiness ?? 0).toFixed(2), label: "stickiness" },
            { value: pct((eng.participationRate ?? 0) * 100, 0), label: "participation" },
            { value: `${(dg.netGrowth30d ?? 0) >= 0 ? "+" : ""}${fmt(dg.netGrowth30d)}`, label: "net / 30d" },
          ]}
        />
      </div>

      {/* cross-source funnel */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Community → Revenue funnel" icon={Filter}
          right={<span style={{ fontSize: 11.5, color: C.faint }}>{revenueStages.filter((s) => s.status === "live").length}/{revenueStages.length} stages live</span>}>
          <FunnelChart stages={revenueStages}
            note="The whole journey in one view. Live stages come from connected sources; greyed stages await instrumentation and light up automatically as sources connect. Full detail on the Acquisition tab." />
        </Panel>
      </div>

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

      {/* comparable indexed trend */}
      <div style={{ marginBottom: 14 }}>
        <Panel title={`Comparable growth · indexed to 100 at period start · ${period}`} icon={TrendingUp}>
          {indexed && indexed.rows.length >= 2 && indexed.platforms.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={indexed.rows} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} width={40} domain={["auto", "auto"]} />
                <Tooltip contentStyle={TIP} />
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

      {/* data-source status board */}
      <Panel title="Data sources" icon={Radar} right={<span style={{ fontSize: 11.5, color: C.faint }}>live · sample · pending</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {SOURCES.map((s) => {
            const st = STATUS[manifest[s.id]] || STATUS.missing;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "8px 11px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 10.5, color: st.color, marginLeft: "auto", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{st.txt}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
