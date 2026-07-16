import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Users, TrendingUp, MessageSquare, Hash, Shield, Filter, Sparkles, ArrowUpDown,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import { C, fmt, num } from "../lib/theme.js";

// Renders the Discord "Community" tab from data/discord.json (written by the
// separately-authored fetch-discord.mjs), falling back to data/discord.sample.json.
// Shape:
//   server{name,memberTotal,online,humans,bots,boostTier,boostCount}
//   growth{memberSnapshots:[{date,members}],joins30d,leaves30d}
//   channels:[{name,type,messages24h,messagesTotal}]
//   roles:[{name,memberCount}]
//   activity{messagesPerDay:[{date,count}],topChannels:[{name,count}]}

const ROLE_COLORS = [C.teal, C.sky, C.gold, C.pink, C.coral, "#7A5B2E", C.faint];
const md = (d) => (d || "").slice(5); // YYYY-MM-DD -> MM-DD

function ChannelTable({ channels }) {
  const [key, setKey] = useState("messages24h");
  const [dir, setDir] = useState("desc");
  const rows = useMemo(() => {
    const s = [...channels].sort((a, b) => {
      const av = a[key], bv = b[key];
      const c = typeof av === "string" ? String(av).localeCompare(String(bv)) : (av - bv);
      return dir === "asc" ? c : -c;
    });
    return s;
  }, [channels, key, dir]);
  const setSort = (k) => { if (k === key) setDir(dir === "asc" ? "desc" : "asc"); else { setKey(k); setDir("desc"); } };
  const Th = ({ k, label, align = "left" }) => (
    <th onClick={() => setSort(k)} style={{ textAlign: align, padding: "7px 10px", cursor: "pointer", color: key === k ? C.ink : C.sub, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, userSelect: "none", whiteSpace: "nowrap" }}>
      {label} <ArrowUpDown size={11} style={{ verticalAlign: "middle", opacity: key === k ? 0.9 : 0.35 }} />
    </th>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", ...num }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.line}` }}>
            <Th k="name" label="Channel" />
            <Th k="type" label="Type" />
            <Th k="messages24h" label="24h" align="right" />
            <Th k="messagesTotal" label="Total" align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
              <td style={{ padding: "7px 10px", fontSize: 13, color: C.ink }}>
                {c.type === "voice" ? "🔊 " : "#"}{c.name}
              </td>
              <td style={{ padding: "7px 10px", fontSize: 12, color: C.sub }}>{c.type}</td>
              <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: c.messages24h ? C.ink : C.faint }}>{fmt(c.messages24h)}</td>
              <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", color: C.sub }}>{fmt(c.messagesTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ joined, active }) {
  const stages = [
    { label: "Joined", value: joined, color: C.teal, live: true },
    { label: "Active", value: active, color: C.sky, live: true },
    { label: "Clicked through", value: null, color: C.gold, live: false },
    { label: "Signed up", value: null, color: C.coral, live: false },
    { label: "Converted", value: null, color: C.pink, live: false },
  ];
  const max = Math.max(1, joined || 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {stages.map((s, i) => {
        const w = s.live && s.value != null ? Math.max(14, (s.value / max) * 100) : 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 120, fontSize: 12.5, color: s.live ? C.sub : C.faint, flexShrink: 0 }}>{s.label}</div>
            <div style={{ flex: 1, height: 34, display: "flex", alignItems: "center" }}>
              <div style={{
                width: `${w}%`, height: "100%", borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px",
                background: s.live ? s.color : "repeating-linear-gradient(45deg," + C.bg2 + "," + C.bg2 + " 8px," + C.line + " 8px," + C.line + " 16px)",
                border: s.live ? "none" : `1px dashed ${C.line}`,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: s.live ? "#fff" : C.faint, ...num }}>
                  {s.live && s.value != null ? fmt(s.value) : "—"}
                </span>
                {!s.live && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4 }}>coming soon</span>}
              </div>
            </div>
          </div>
        );
      })}
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
  const act = data.activity || {};
  const channels = data.channels || [];
  const roles = data.roles || [];
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  const snaps = useMemo(() => (g.memberSnapshots || []).map((p) => ({ date: md(p.date), members: p.members })), [g.memberSnapshots]);
  const perDay = useMemo(() => (act.messagesPerDay || []).map((p) => ({ date: md(p.date), count: p.count })), [act.messagesPerDay]);
  const topChannels = useMemo(() => {
    const src = (act.topChannels && act.topChannels.length)
      ? act.topChannels
      : [...channels].filter((c) => c.type !== "voice").sort((a, b) => b.messages24h - a.messages24h).slice(0, 6).map((c) => ({ name: c.name, count: c.messages24h }));
    return src.map((c) => ({ name: "#" + c.name, count: c.count }));
  }, [act.topChannels, channels]);
  const net = (g.joins30d || 0) - (g.leaves30d || 0);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Community · {s.name || "Discord"}</h2>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
          {fmt(s.memberTotal)} members · {fmt(s.online)} online now · {fmt(channels.length)} channels
        </div>
      </div>

      {/* 1 — health header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <Kpi icon={Users} label="Members" value={fmt(s.memberTotal)} accent={C.teal} />
        <Kpi label="Online now" value={fmt(s.online)} accent={C.sky} sub={s.memberTotal ? `${((s.online / s.memberTotal) * 100).toFixed(1)}% of server` : undefined} />
        <Kpi label="Humans" value={fmt(s.humans)} accent={C.gold} />
        <Kpi label="Bots" value={fmt(s.bots)} accent={C.faint} />
        <Kpi icon={Sparkles} label={`Boost tier ${s.boostTier ?? 0}`} value={fmt(s.boostCount)} accent={C.pink} sub="boosts" />
      </div>

      {/* 2 — growth */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Member growth" icon={TrendingUp}
          right={<span style={{ fontSize: 12, ...num, color: net >= 0 ? C.teal : C.coral }}>+{fmt(g.joins30d)} joins · −{fmt(g.leaves30d)} leaves · net {net >= 0 ? "+" : ""}{fmt(net)} (30d)</span>}>
          {snaps.length >= 2 ? (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={snaps} margin={{ left: -8, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="dgMembers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.teal} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} width={48} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), "Members"]} />
                <Area type="monotone" dataKey="members" stroke={C.teal} strokeWidth={2} fill="url(#dgMembers)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>Growth trend unavailable.</div>}
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            Trend accumulates from the first data run forward — Discord provides no retroactive member history.
          </div>
        </Panel>
      </div>

      {/* 3 — engagement */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel title="Messages per day" icon={MessageSquare}>
          {perDay.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={perDay} margin={{ left: -8, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="dgMsgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.sky} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.sky} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.faint }} minTickGap={26} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} width={44} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), "Messages"]} />
                <Area type="monotone" dataKey="count" stroke={C.sky} strokeWidth={2} fill="url(#dgMsgs)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No activity series yet.</div>}
        </Panel>
        <Panel title="Top channels (24h)" icon={Hash}>
          {topChannels.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topChannels} layout="vertical" margin={{ left: 10, right: 12, top: 4 }}>
                <CartesianGrid stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.faint }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5, fill: C.sub }} width={110} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), "Messages 24h"]} cursor={{ fill: C.bg2 }} />
                <Bar dataKey="count" fill={C.teal} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No channel activity yet.</div>}
        </Panel>
      </div>

      {/* 4 — channel breakdown */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Channel breakdown" icon={Hash}
          right={<span style={{ fontSize: 11.5, color: C.faint }}>click a header to sort</span>}>
          {channels.length ? <ChannelTable channels={channels} /> : <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>No channels.</div>}
        </Panel>
      </div>

      {/* 5 — role distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel title="Role distribution" icon={Shield}>
          {roles.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={roles} dataKey="memberCount" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {roles.map((r, i) => <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
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

        {/* 6 — conversion funnel placeholder */}
        <Panel title="Community → Conversion funnel" icon={Filter}>
          <Funnel joined={s.memberTotal} active={s.online} />
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>
            <b>Joined</b> and <b>Active</b> come from live Discord data (Active = online now, a proxy until
            per-member activity is tracked). Clicked-through, Signed up and Converted need instrumentation
            pending — UTM tags on invite/links plus product sign-up and conversion events — so they're shown
            greyed rather than estimated.
          </div>
        </Panel>
      </div>
    </div>
  );
}
