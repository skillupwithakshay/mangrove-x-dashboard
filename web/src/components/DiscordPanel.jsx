import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  Users, TrendingUp, MessageSquare, Hash, Shield, Sparkles, ArrowUpDown, Volume2,
  Activity, HeartPulse, Layers, UserCheck,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import InfoDot from "./InfoDot.jsx";
import { C, fmt, pct, num, fmtDate, TIP, H, R } from "../lib/theme.js";
import { communityHealth } from "../lib/metrics.js";

// Advanced Discord "Community Intelligence" tab. Reads data/discord.json
// (fallback data/discord.sample.json). Contract:
//   server{name,memberTotal,online,humans,bots,boostTier,boostCount}
//   growth{memberSnapshots:[{date,members}],joins:[{date,count}],leaves:[{date,count}],
//          joins30d,leaves30d,netGrowth30d,churnRate30d}
//   engagement{activeMembers7d,activeMembers30d,stickiness,messagesPerDay:[{date,count}],
//              postingMembersPerDay:[{date,count}],participationRate,topContributorsConcentration}
//   channels:[{name,type,messages24h,messages7d,messagesTotal,activeAuthors7d}]
//   roles:[{name,memberCount}]  retention{cohorts:[{cohort,size,activeWeek1,..}],note}
// Every time series is built to render with as little as 1–2 points.

const ROLE_COLORS = [C.teal, C.sky, C.gold, C.pink, C.coral, C.goldInk, C.faint];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const DEF = {
  health: "A 0–100 blend of engagement stickiness (40%), participation (35%) and growth health (25%). A single read on community vitality.",
  stickiness: "Stickiness (DAU/MAU-style): the share of monthly-active members who are also active in a short recent window. Higher means members return more often; ~0.2 is typical for communities.",
  participation: "Participation rate: the share of all members who posted at least once recently. Most members lurk, so even 20–30% is healthy.",
  churn: "Churn rate (30d): members who left in the last 30 days as a share of the server. Lower is better.",
  concentration: "Contributor concentration: the share of messages coming from the most active handful of members. High (>60%) means a few people carry the server; low means broad participation.",
};

function ScoreRing({ score }) {
  const v = clamp(Math.round(score || 0), 0, 100);
  const color = v >= 66 ? C.teal : v >= 40 ? C.gold : C.coral;
  const r = 46, cx = 56, cy = 56, circ = 2 * Math.PI * r;
  return (
    <svg width={112} height={112} role="img" aria-label={`Community health ${v} of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={11} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * circ} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central" fontSize={27} fontWeight={800} fill={C.ink} style={num}>{v}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={9.5} fill={C.faint}>/ 100</text>
    </svg>
  );
}

function ConcentrationBar({ value }) {
  const p = clamp((value || 0) * 100, 0, 100);
  const label = p >= 60 ? "Concentrated" : p >= 40 ? "Moderate" : "Broad";
  const color = p >= 60 ? C.coral : p >= 40 ? C.gold : C.teal;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
        <span style={{ color: C.sub }}>Top contributors' share of messages</span>
        <span style={{ color, fontWeight: 800, ...num }}>{p.toFixed(0)}% · {label}</span>
      </div>
      <div style={{ background: C.bg2, borderRadius: 6, height: 14, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${p}%`, background: color, height: "100%", borderRadius: 6 }} />
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
        {label === "Broad" ? "Participation is spread across many members — resilient." :
         label === "Moderate" ? "A core group leads, with a healthy long tail." :
         "A few members carry most of the conversation — a key-person risk."}
      </div>
    </div>
  );
}

function CohortGrid({ retention }) {
  const cohorts = retention?.cohorts || [];
  if (!cohorts.length) {
    return <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Not enough history yet — retention cohorts appear once a join-week has accumulated a couple of weeks of activity snapshots.</div>;
  }
  const weeks = Math.max(...cohorts.map((c) => Object.keys(c).filter((k) => k.startsWith("activeWeek")).length));
  const cell = (frac) => {
    if (frac == null) return { bg: "transparent", txt: C.faint, s: "" };
    const p = Math.round(frac * 100);
    const a = clamp(frac, 0, 1);
    return { bg: `rgba(14,124,102,${0.12 + a * 0.6})`, txt: a > 0.55 ? "#fff" : C.ink, s: p + "%" };
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", ...num }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: 0.3 }}>Join week</th>
            <th style={{ textAlign: "right", padding: "6px 10px", fontSize: 11, color: C.sub }}>Size</th>
            {Array.from({ length: weeks }, (_, i) => (
              <th key={i} style={{ padding: "6px 10px", fontSize: 11, color: C.sub }}>Wk {i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c, i) => (
            <tr key={i}>
              <td style={{ padding: "6px 10px", fontSize: 12.5, color: C.ink }}>{c.cohort}</td>
              <td style={{ padding: "6px 10px", fontSize: 12.5, color: C.sub, textAlign: "right" }}>{fmt(c.size)}</td>
              {Array.from({ length: weeks }, (_, w) => {
                const val = c[`activeWeek${w + 1}`];
                const frac = val == null || !c.size ? null : val / c.size;
                const st = cell(frac);
                return (
                  <td key={w} style={{ padding: 0 }}>
                    <div style={{ margin: 3, minWidth: 46, textAlign: "center", padding: "8px 6px", borderRadius: 6, background: st.bg, color: st.txt, fontSize: 12, fontWeight: 700 }}>
                      {st.s || "·"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelTable({ channels }) {
  const [key, setKey] = useState("messages7d");
  const [dir, setDir] = useState("desc");
  const rows = useMemo(() => [...channels].sort((a, b) => {
    const av = a[key], bv = b[key];
    const c = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av - bv);
    return dir === "asc" ? c : -c;
  }), [channels, key, dir]);
  const setSort = (k) => { if (k === key) setDir(dir === "asc" ? "desc" : "asc"); else { setKey(k); setDir("desc"); } };
  const Th = ({ k, label, align = "left" }) => (
    <th role="columnheader" aria-sort={key === k ? (dir === "asc" ? "ascending" : "descending") : "none"}
      tabIndex={0} onClick={() => setSort(k)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSort(k); } }}
      style={{ textAlign: align, padding: "7px 10px", cursor: "pointer", color: key === k ? C.ink : C.sub, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, userSelect: "none", whiteSpace: "nowrap" }}>
      {label} <ArrowUpDown size={11} style={{ verticalAlign: "middle", opacity: key === k ? 0.9 : 0.35 }} />
    </th>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", ...num }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.line}` }}>
            <Th k="name" label="Channel" /><Th k="type" label="Type" />
            <Th k="messages24h" label="24h" align="right" /><Th k="messages7d" label="7d" align="right" />
            <Th k="messagesTotal" label="Total" align="right" /><Th k="activeAuthors7d" label="Authors 7d" align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const dormant = (c.messages7d || 0) === 0 && c.type !== "voice";
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${C.line}`, opacity: dormant ? 0.6 : 1 }}>
                <td style={{ padding: "7px 10px", fontSize: 13, color: C.ink }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {c.type === "voice" ? <Volume2 size={13} color={C.faint} /> : <Hash size={12} color={C.faint} />}{c.name}
                    {dormant && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 4, padding: "0 4px" }}>DORMANT</span>}
                  </span>
                </td>
                <td style={{ padding: "7px 10px", fontSize: 12, color: C.sub }}>{c.type}</td>
                <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: c.messages24h ? C.ink : C.faint }}>{fmt(c.messages24h)}</td>
                <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: c.messages7d ? C.ink : C.faint }}>{fmt(c.messages7d)}</td>
                <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: C.sub }}>{fmt(c.messagesTotal)}</td>
                <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: C.sub }}>{fmt(c.activeAuthors7d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DiscordPanel({ data }) {
  if (!data) {
    return (
      <Panel title="Community (Discord)" icon={Users}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No Discord data yet. Runs once fetch-discord.mjs writes data/discord.json.</div>
      </Panel>
    );
  }
  const s = data.server || {};
  const g = data.growth || {};
  const eng = data.engagement || {};
  const channels = data.channels || [];
  const roles = data.roles || [];

  const snaps = useMemo(() => (g.memberSnapshots || []).map((p) => ({ ...p, label: fmtDate(p.date) })), [g.memberSnapshots]);
  const flow = useMemo(() => {
    const byDate = {};
    (g.joins || []).forEach((j) => { byDate[j.date] = { date: j.date, joins: j.count, leaves: 0 }; });
    (g.leaves || []).forEach((l) => { byDate[l.date] = { ...(byDate[l.date] || { date: l.date, joins: 0 }), leaves: -(l.count || 0) }; });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, label: fmtDate(r.date) }));
  }, [g.joins, g.leaves]);
  const msgs = useMemo(() => (eng.messagesPerDay || []).map((p) => ({ ...p, label: fmtDate(p.date) })), [eng.messagesPerDay]);
  const posters = useMemo(() => (eng.postingMembersPerDay || []).map((p) => ({ ...p, label: fmtDate(p.date) })), [eng.postingMembersPerDay]);

  // growth rates
  const growth7d = useMemo(() => {
    if (snaps.length < 2) return null;
    const last = snaps[snaps.length - 1].members;
    const prior = snaps[Math.max(0, snaps.length - 8)].members;
    return prior ? ((last - prior) / prior) * 100 : null;
  }, [snaps]);
  const base30 = (s.memberTotal || 0) - (g.netGrowth30d || 0);
  const growth30d = base30 > 0 ? ((g.netGrowth30d || 0) / base30) * 100 : null;

  // community health score (shared with the Overview portal)
  const health = useMemo(() => communityHealth(data), [data]);

  const net = g.netGrowth30d != null ? g.netGrowth30d : (g.joins30d || 0) - (g.leaves30d || 0);
  const gridCard = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Community intelligence · {s.name || "Discord"}</h2>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
          {fmt(s.memberTotal)} members · {fmt(s.online)} online · {fmt(channels.length)} channels · boost tier {s.boostTier ?? 0}
        </div>
      </div>

      {/* 1 — health header + score */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Community health" icon={HeartPulse}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={health.score} />
              <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>health score <InfoDot text={DEF.health} label="Community health" /></div>
            </div>
            <div style={{ flex: "1 1 320px", minWidth: 260 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <Kpi icon={Users} label="Members" value={fmt(s.memberTotal)} accent={C.teal} />
                <Kpi icon={UserCheck} label="Online" value={fmt(s.online)} accent={C.sky} />
                <Kpi label="Humans / bots" value={`${fmt(s.humans)} / ${fmt(s.bots)}`} accent={C.gold} />
                <Kpi icon={Sparkles} label={`Boost tier ${s.boostTier ?? 0}`} value={fmt(s.boostCount)} accent={C.pink} sub="boosts" />
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "10px 13px" }}>
                Most lifted by <b>{health.top}</b>; biggest opportunity is <b>{health.low}</b>. Score weights stickiness (40%), participation (35%) and growth health (25%).
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* 2 — growth analytics */}
      <div style={gridCard}>
        <Panel title="Member growth" icon={TrendingUp}
          right={<span style={{ fontSize: 12, ...num, color: net >= 0 ? C.teal : C.coral }}>net {net >= 0 ? "+" : ""}{fmt(net)} / 30d</span>}>
          {snaps.length >= 2 ? (
            <ResponsiveContainer width="100%" height={H.chartSm}>
              <AreaChart data={snaps} margin={{ left: -8, right: 8, top: 6 }}>
                <defs><linearGradient id="dgM" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.28} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.faint }} minTickGap={22} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} width={40} domain={["auto", "auto"]} />
                <Tooltip contentStyle={TIP} formatter={(v) => [fmt(v), "Members"]} />
                <Area type="monotone" dataKey="members" stroke={C.teal} strokeWidth={2} fill="url(#dgM)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Trend builds as daily snapshots accumulate.</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 12, color: C.sub }}>
            <span>7d growth <b style={{ color: growth7d >= 0 ? C.teal : C.coral, ...num }}>{growth7d == null ? "—" : `${growth7d >= 0 ? "+" : ""}${growth7d.toFixed(1)}%`}</b></span>
            <span>30d growth <b style={{ color: growth30d >= 0 ? C.teal : C.coral, ...num }}>{growth30d == null ? "—" : `${growth30d >= 0 ? "+" : ""}${growth30d.toFixed(1)}%`}</b></span>
            <span>churn <InfoDot text={DEF.churn} label="Churn rate" /> <b style={{ ...num, color: C.ink }}>{pct(g.churnRate30d, 1)}</b></span>
          </div>
        </Panel>

        <Panel title="Joins vs leaves" icon={Activity}>
          {flow.length >= 1 ? (
            <ResponsiveContainer width="100%" height={H.chartSm}>
              <BarChart data={flow} margin={{ left: -12, right: 8, top: 6 }} stackOffset="sign">
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} minTickGap={18} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} width={34} />
                <ReferenceLine y={0} stroke={C.line} />
                <Tooltip contentStyle={TIP} formatter={(v, n) => [fmt(Math.abs(v)), n === "joins" ? "Joins" : "Leaves"]} />
                <Bar dataKey="joins" name="joins" fill={C.teal} radius={[3, 3, 0, 0]} maxBarSize={16} stackId="f" />
                <Bar dataKey="leaves" name="leaves" fill={C.coral} radius={[0, 0, 3, 3]} maxBarSize={16} stackId="f" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Join/leave flow appears as daily data accumulates.</div>}
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: C.sub }}>
            <span>+{fmt(g.joins30d)} joined (30d)</span><span>−{fmt(g.leaves30d)} left (30d)</span>
          </div>
        </Panel>
      </div>

      {/* 3 — engagement depth */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Engagement depth" icon={Layers}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <Kpi label={<span>Stickiness <InfoDot text={DEF.stickiness} label="Stickiness" /></span>} value={(eng.stickiness ?? 0).toFixed(2)} accent={C.teal}
              sub={eng.stickiness >= 0.3 ? "sticky — members return often" : eng.stickiness >= 0.15 ? "typical for communities" : "low — few repeat visits"} />
            <Kpi label={<span>Participation <InfoDot text={DEF.participation} label="Participation rate" /></span>} value={pct((eng.participationRate ?? 0) * 100, 0)} accent={C.sky}
              sub="of members posted" />
            <Kpi label="Active · 7d / 30d" value={`${fmt(eng.activeMembers7d)} / ${fmt(eng.activeMembers30d)}`} accent={C.gold} />
          </div>
          <div style={gridCard}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><MessageSquare size={13} /> Messages & posting members / day</div>
              {msgs.length >= 2 ? (
                <ResponsiveContainer width="100%" height={H.chartSm}>
                  <AreaChart data={msgs} margin={{ left: -8, right: 8, top: 6 }}>
                    <defs><linearGradient id="dgMsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.26} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} minTickGap={22} />
                    <YAxis tick={{ fontSize: 11, fill: C.faint }} width={34} />
                    <Tooltip contentStyle={TIP} formatter={(v) => [fmt(v), "Messages"]} />
                    <Area type="monotone" dataKey="count" stroke={C.sky} strokeWidth={2} fill="url(#dgMsg)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Activity trend builds over time.</div>}
              {posters.length >= 2 && (
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
                  Posting members peaked at {fmt(Math.max(...posters.map((p) => p.count)))}/day — breadth of who's talking, not just volume.
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>Contributor concentration <InfoDot text={DEF.concentration} label="Contributor concentration" /></div>
              <ConcentrationBar value={eng.topContributorsConcentration} />
            </div>
          </div>
        </Panel>
      </div>

      {/* 4 — channel intelligence */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Channel intelligence" icon={Hash} right={<span style={{ fontSize: 11.5, color: C.faint }}>click a header to sort · dormant = 0 msgs / 7d</span>}>
          {channels.length ? <ChannelTable channels={channels} /> : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No channels.</div>}
        </Panel>
      </div>

      {/* 5 + 6 — retention cohorts & roles */}
      <div style={gridCard}>
        <Panel title="Retention cohorts" icon={Users} right={<span style={{ fontSize: 11.5, color: C.faint }}>% of join-week still active</span>}>
          <CohortGrid retention={data.retention} />
          {data.retention?.note && <div style={{ fontSize: 11, color: C.faint, marginTop: 8, fontStyle: "italic" }}>{data.retention.note}</div>}
        </Panel>

        <Panel title="Role distribution" icon={Shield}>
          {roles.length ? (
            <ResponsiveContainer width="100%" height={H.chart}>
              <PieChart>
                <Pie data={roles} dataKey="memberCount" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {roles.map((r, i) => <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v, n) => [fmt(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No roles.</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {roles.map((r, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: ROLE_COLORS[i % ROLE_COLORS.length] }} />
                {r.name} <b style={{ ...num }}>{fmt(r.memberCount)}</b>
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ fontSize: 11, color: C.faint, fontStyle: "italic" }}>
        Note: growth, engagement and retention are computed from the bot's daily snapshots (accumulating forward).
        Precise retention curves and some engagement funnels live only in Discord's owner-only Server Insights and would need manual import.
      </div>
    </div>
  );
}
