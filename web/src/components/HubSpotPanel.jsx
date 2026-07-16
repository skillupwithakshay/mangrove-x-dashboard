import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Activity, HeartPulse, AlertTriangle, GitBranch, Radio, PieChart, Coins,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import { C, fmt, pct, num } from "../lib/theme.js";

// Renders the HubSpot "Revenue Engine" from data/hubspot_latest.json (see
// pipeline/fetch_hubspot_data.py). `trend` is the monthly acquisition series
// augmented in App with monthly social engagement, for the closed-loop chart.

function Gauge({ score }) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const color = s >= 70 ? C.teal : s >= 40 ? C.gold : C.coral;
  const r = 54, cx = 64, cy = 64, circ = 2 * Math.PI * r, frac = s / 100;
  return (
    <svg width={128} height={128} role="img" aria-label={`CRM health ${s} of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${frac * circ} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central"
        fontSize={30} fontWeight={800} fill={C.ink} style={num}>{s}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill={C.faint}>/ 100</text>
    </svg>
  );
}

function BarList({ rows, keyFn, valFn, accentFn }) {
  const max = Math.max(1, ...rows.map(valFn));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 130, fontSize: 12.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{keyFn(r)}</div>
          <div style={{ flex: 1, background: C.bg2, borderRadius: 5, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${(valFn(r) / max) * 100}%`, background: accentFn ? accentFn(r) : C.teal, height: "100%", borderRadius: 5 }} />
          </div>
          <div style={{ width: 52, textAlign: "right", fontSize: 12.5, ...num }}>{fmt(valFn(r))}</div>
        </div>
      ))}
    </div>
  );
}

export default function HubSpotPanel({ data, trend }) {
  if (!data) {
    return (
      <Panel title="Revenue engine (HubSpot)" icon={Activity}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No HubSpot data yet. Run pipeline/fetch_hubspot_data.py (see README).
        </div>
      </Panel>
    );
  }

  const h = data.health || {};
  const deals = data.deals || { value_by_stage: [], total: 0, total_value: 0 };
  const sources = data.contacts_by_source || [];
  const socialSet = new Set(["PAID_SOCIAL", "SOCIAL_MEDIA"]);
  const srcAccent = (r) => (r.raw === "PAID_SOCIAL" ? C.sky : r.raw === "SOCIAL_MEDIA" ? C.gold : C.teal);
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };
  const maxDealVal = useMemo(() => Math.max(1, ...deals.value_by_stage.map((s) => s.value || 0)), [deals]);

  return (
    <div>
      {/* header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Revenue engine · HubSpot</h2>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
          {fmt(data.contacts_total)} contacts · {fmt(data.companies_total)} companies · {fmt(data.forms_count)} forms
        </div>
      </div>

      {/* 1 — CRM health gauge + reactivation callout */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="CRM health" icon={HeartPulse}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
            <Gauge score={h.score} />
            <div style={{ flex: "1 1 340px", minWidth: 260 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <Kpi label="Unowned" value={pct(h.unowned_pct, 1)} accent={C.coral} />
                <Kpi label="Never contacted" value={pct(h.never_contacted_pct, 1)} accent={C.coral} />
                <Kpi label="Missing email" value={pct(h.missing_email_pct, 1)} accent={C.gold} />
              </div>
              {h.reactivation && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.goldSoft, border: `1px solid #EADFC2`, borderLeft: `3px solid ${C.coral}`, borderRadius: 10, padding: "11px 13px", color: "#7A5B2E", fontSize: 13 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span><b>{fmt(h.reactivation.count)}</b> {h.reactivation.label.replace(/^\d+\s*/, "")} — a reactivation opportunity.</span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* 2 — closed-loop social: acquisition trend vs social activity + social funnel */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Closed-loop: social activity → contacts acquired" icon={Radio}>
          {trend && trend.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.faint }} minTickGap={20} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.faint }} width={40} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.faint }} width={44} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="contacts" name="Contacts acquired" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={34} />
                <Line yAxisId="r" type="monotone" dataKey="social" name="Social engagement" stroke={C.coral} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Monthly acquisition trend appears once HubSpot data is live.</div>
          )}
          {(data.social_funnel || []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
                Social-sourced funnel (Paid + Organic Social) — social → lead → MQL
              </div>
              <BarList rows={data.social_funnel} keyFn={(r) => r.stage} valFn={(r) => r.count} accentFn={() => C.sky} />
            </div>
          )}
        </Panel>
      </div>

      {/* 3 — pipeline: deal value by stage (near-empty is the point) */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Pipeline · deal value by stage" icon={GitBranch}
               right={<span style={{ fontSize: 12, color: C.faint, ...num }}>{fmt(deals.total)} deals · ${fmt(deals.total_value)}</span>}>
          {deals.value_by_stage.length > 0 ? (
            <BarList rows={deals.value_by_stage} keyFn={(r) => r.stage}
                     valFn={(r) => r.value} accentFn={() => C.teal} />
          ) : (
            <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No deals yet.</div>
          )}
          <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>
            Pipeline is near-empty by design — the CRM is capturing contacts faster than deals are being created. That gap is the story: turn reactivated leads into deals.
          </div>
        </Panel>
      </div>

      {/* 4 — source breakdown, Paid/Organic Social highlighted */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Contacts by original source" icon={PieChart}>
          <BarList rows={sources} keyFn={(r) => r.source} valFn={(r) => r.count} accentFn={srcAccent} />
          <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>
            <span style={{ color: C.sky, fontWeight: 700 }}>Paid social</span> and{" "}
            <span style={{ color: C.gold, fontWeight: 700 }}>Organic social</span> highlighted.
          </div>
        </Panel>
      </div>

      {/* 5 — cost-per-contact by channel (activates when ad spend is added) */}
      <Panel title="Cost per contact by channel" icon={Coins}>
        <div style={{ color: C.faint, fontSize: 13, padding: "6px 0" }}>
          Activates once ad-spend is added to the dashboard — it joins spend by channel with
          contacts-by-source (Paid social spend ÷ Paid social contacts, etc.). No spend source is
          connected yet, so this is intentionally empty rather than estimated.
        </div>
      </Panel>
    </div>
  );
}
