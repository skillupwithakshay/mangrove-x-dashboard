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

// Renders the HubSpot "Revenue Engine" from data/hubspot.json (written by the
// tested fetch-hubspot.mjs). Shape (camelCase):
//   health{score,unowned,unownedPct,neverContacted,neverContactedPct,missingEmail,
//          missingEmailPct,reactivationOpportunity}
//   contacts{total,newLast30d,bySource{SRC:n},funnel{stage:n},socialFunnel{stage:n},
//            monthlyTrend:[{month,count}]}
//   companies{total}  deals{total,wonCount,wonValue,openCount,openValue,byStage{id:{count,value}}}
//   forms{total}
// `trend` is contacts.monthlyTrend augmented in App with monthly social engagement.

const SOURCE_LABELS = {
  ORGANIC_SEARCH: "Organic search", PAID_SEARCH: "Paid search",
  PAID_SOCIAL: "Paid social", SOCIAL_MEDIA: "Organic social",
  EMAIL_MARKETING: "Email", REFERRALS: "Referrals",
  DIRECT_TRAFFIC: "Direct", OFFLINE: "Offline",
};
const STAGE_ORDER = ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "evangelist"];
const STAGE_LABELS = {
  subscriber: "Subscriber", lead: "Lead", marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL", opportunity: "Opportunity", customer: "Customer", evangelist: "Evangelist",
};
const DEAL_STAGE_LABELS = {
  closedwon: "Closed won", closedlost: "Closed lost", appointmentscheduled: "Appointment scheduled",
  qualifiedtobuy: "Qualified to buy", presentationscheduled: "Presentation scheduled",
  decisionmakerboughtin: "Decision maker bought-in", contractsent: "Contract sent",
};

function Gauge({ score }) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const color = s >= 70 ? C.teal : s >= 40 ? C.gold : C.coral;
  const r = 54, cx = 64, cy = 64, circ = 2 * Math.PI * r, frac = s / 100;
  return (
    <svg width={128} height={128} role="img" aria-label={`CRM health ${s} of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${frac * circ} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central" fontSize={30} fontWeight={800} fill={C.ink} style={num}>{s}</text>
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize={10} fill={C.faint}>/ 100</text>
    </svg>
  );
}

function BarList({ rows, accentFn }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 130, fontSize: 12.5, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{r.label}</div>
          <div style={{ flex: 1, background: C.bg2, borderRadius: 5, height: 14, overflow: "hidden" }}>
            <div style={{ width: `${(r.value / max) * 100}%`, background: accentFn ? accentFn(r) : C.teal, height: "100%", borderRadius: 5 }} />
          </div>
          <div style={{ width: 60, textAlign: "right", fontSize: 12.5, ...num }}>{r.fmt ? r.fmt(r.value) : fmt(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

export default function HubSpotPanel({ data, trend }) {
  if (!data) {
    return (
      <Panel title="Revenue engine (HubSpot)" icon={Activity}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No HubSpot data yet. Run fetch-hubspot.mjs (see README).</div>
      </Panel>
    );
  }
  const h = data.health || {};
  const c = data.contacts || {};
  const deals = data.deals || {};
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  const sources = useMemo(() => Object.entries(c.bySource || {})
    .map(([raw, v]) => ({ raw, label: SOURCE_LABELS[raw] || raw, value: v }))
    .filter((r) => r.value > 0).sort((a, b) => b.value - a.value), [c.bySource]);
  const socialRows = useMemo(() => STAGE_ORDER
    .map((s) => ({ label: STAGE_LABELS[s], value: (c.socialFunnel || {})[s] || 0 }))
    .filter((r) => r.value > 0), [c.socialFunnel]);
  const dealRows = useMemo(() => Object.entries(deals.byStage || {})
    .map(([id, v]) => ({ label: DEAL_STAGE_LABELS[id] || id, value: v.value || 0, count: v.count || 0, fmt: (n) => `$${fmt(n)}` }))
    .sort((a, b) => b.value - a.value), [deals.byStage]);

  const srcAccent = (r) => (r.raw === "PAID_SOCIAL" ? C.sky : r.raw === "SOCIAL_MEDIA" ? C.gold : C.teal);
  const socialLeads = (c.socialFunnel || {}).lead || 0;
  const socialBeyond = STAGE_ORDER.slice(2).reduce((a, s) => a + ((c.socialFunnel || {})[s] || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Revenue engine · HubSpot</h2>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
          {fmt(c.total)} contacts
          {c.newLast30d != null && <span style={{ color: C.teal, fontWeight: 700 }}> · +{fmt(c.newLast30d)} new (30d)</span>}
          {" · "}{fmt((data.companies || {}).total)} companies · {fmt((data.forms || {}).total)} forms
        </div>
      </div>

      {/* 1 — CRM health */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="CRM health" icon={HeartPulse}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
            <Gauge score={h.score} />
            <div style={{ flex: "1 1 340px", minWidth: 260 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <Kpi label="Unowned" value={pct(h.unownedPct, 1)} accent={C.coral} />
                <Kpi label="Never contacted" value={pct(h.neverContactedPct, 1)} accent={C.coral} />
                <Kpi label="Missing email" value={pct(h.missingEmailPct, 1)} accent={C.gold} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.goldSoft, border: `1px solid #EADFC2`, borderLeft: `3px solid ${C.coral}`, borderRadius: 10, padding: "11px 13px", color: "#7A5B2E", fontSize: 13 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span><b>{fmt(h.reactivationOpportunity)}</b> leads acquired but never contacted — a reactivation opportunity.</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* 2 — closed-loop social */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Closed-loop: social activity → contacts acquired" icon={Radio}>
          {trend && trend.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.faint }} minTickGap={20} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.faint }} width={44} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.faint }} width={44} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="contacts" name="Contacts acquired" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={34} />
                <Line yAxisId="r" type="monotone" dataKey="social" name="Social engagement" stroke={C.coral} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Monthly acquisition trend unavailable.</div>
          )}
          {socialRows.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>Social-sourced funnel (Paid + Organic Social)</div>
              <BarList rows={socialRows} accentFn={() => C.sky} />
              {socialLeads > 0 && socialBeyond === 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.goldSoft, border: `1px solid #EADFC2`, borderLeft: `3px solid ${C.coral}`, borderRadius: 10, padding: "10px 13px", color: "#7A5B2E", fontSize: 12.5, marginTop: 10 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>All <b>{fmt(socialLeads)}</b> social-sourced contacts are stuck at <b>Lead</b> — 0 have progressed to MQL, SQL, or customer. Social is filling the top of the funnel but not converting.</span>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* 3 — pipeline */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Pipeline · deal value by stage" icon={GitBranch}
               right={<span style={{ fontSize: 12, color: C.faint, ...num }}>${fmt(deals.wonValue)} won · ${fmt(deals.openValue)} open</span>}>
          {dealRows.length > 0 ? <BarList rows={dealRows} accentFn={(r) => (r.label === "Closed won" ? C.teal : r.label === "Closed lost" ? C.coral : C.sky)} />
            : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No deals yet.</div>}
          <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>
            {fmt(deals.total)} deals total · {fmt(deals.wonCount)} won, {fmt(deals.openCount)} open. Open pipeline is empty — the engine is acquiring contacts but not yet creating deals. That gap is the story.
          </div>
        </Panel>
      </div>

      {/* 4 — source breakdown */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Contacts by original source" icon={PieChart}>
          <BarList rows={sources} accentFn={srcAccent} />
          <div style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>
            <span style={{ color: C.sky, fontWeight: 700 }}>Paid social</span> and{" "}
            <span style={{ color: C.gold, fontWeight: 700 }}>Organic social</span> highlighted.
          </div>
        </Panel>
      </div>

      {/* 5 — cost-per-contact (activates with ad spend) */}
      <Panel title="Cost per contact by channel" icon={Coins}>
        <div style={{ color: C.faint, fontSize: 13, padding: "6px 0" }}>
          Activates once an ad-spend source is connected — it joins spend by channel with contacts
          by source (e.g. Paid social spend ÷ {fmt((c.bySource || {}).PAID_SOCIAL)} Paid social contacts).
          No spend source is wired yet, so this is intentionally empty rather than estimated.
        </div>
      </Panel>
    </div>
  );
}
