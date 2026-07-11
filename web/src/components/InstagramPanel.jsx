import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Instagram, Users, Eye, Play, UserCheck, Activity, MousePointerClick,
  Heart, MessageCircle, Bookmark, Share2, TrendingUp, Database, Globe, PieChart,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import { C, fmt, pct, num, LINKS, CHANNELS } from "../lib/theme.js";
import { periodView } from "../lib/period.js";

// Renders Instagram analytics from the shape written by
// pipeline/fetch_instagram_data.py -> data/instagram_latest.json:
//   { last_updated, window_days,
//     account: {id, username, name, biography, website, followers, follows,
//               media_count, profile_picture},
//     summary: {reach, views, profile_views, website_clicks, accounts_engaged,
//               total_interactions, likes, comments, saves, shares,
//               avg_engagement_rate},
//     daily: [{date, reach, views}],
//     demographics: {countries:[{name,value}], gender:[{name,value}], age:[{name,value}]},
//     media: [{id, caption, type, permalink, timestamp, likes, comments, saves,
//              shares, reach, views, engagement_rate, thumbnail}] }
//
// Uses the shared Kpi/Panel atoms so it matches the X and YouTube panels.
// Because Meta deprecates/renames metrics often, any summary field may be
// null — cards for null metrics are simply hidden rather than shown blank.

const COUNTRY_NAMES = {
  US: "United States", IN: "India", GB: "United Kingdom", DE: "Germany",
  CA: "Canada", AE: "UAE", SG: "Singapore", AU: "Australia", FR: "France",
  BR: "Brazil", NL: "Netherlands", JP: "Japan", NG: "Nigeria", ES: "Spain",
};
const GENDER_NAMES = { M: "Men", F: "Women", U: "Unknown" };

const BarList = ({ rows, accent = C.teal, labelMap }) => {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 120, fontSize: 12.5, color: C.sub, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(labelMap && labelMap[r.name]) || r.name}
          </div>
          <div style={{ flex: 1, background: C.bg, borderRadius: 6, height: 16, overflow: "hidden" }}>
            <div style={{ width: `${(r.value / max) * 100}%`, background: accent, height: "100%", borderRadius: 6 }} />
          </div>
          <div style={{ width: 60, textAlign: "right", fontSize: 12.5, ...num }}>{fmt(r.value)}</div>
        </div>
      ))}
    </div>
  );
};

export default function InstagramPanel({ data }) {
  if (!data) {
    return (
      <Panel title="Instagram Analytics" icon={Instagram}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No Instagram data yet. Run pipeline/fetch_instagram_data.py (see README).
        </div>
      </Panel>
    );
  }

  const account = data.account || {};
  const summary = data.summary || {};
  const daily = data.daily || [];
  const demo = data.demographics || {};
  const media = data.media || [];
  const windowDays = data.window_days || 30;

  const topMedia = useMemo(
    () => [...media].sort((a, b) => (b.reach || b.views || 0) - (a.reach || a.views || 0)).slice(0, 10),
    [media]
  );
  const hasTrend = daily.some((d) => (d.reach || 0) + (d.views || 0) > 0);
  const [period, setPeriod] = useState("30D");
  const pv = useMemo(() => periodView(daily, period, ["reach", "views"]), [daily, period]);
  const gr = pv.growth.reach;
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {account.profile_picture && (
            <img src={account.profile_picture} alt="" width={40} height={40}
                 style={{ borderRadius: "50%", border: `1px solid ${C.line}` }} />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
              <a href={LINKS.instagram} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {account.name || "Instagram"} · Instagram Analytics
                <span style={{ fontSize: 12, color: C.faint }}>↗</span>
              </a>
            </h2>
          </div>
        </div>
      </div>

      {/* KPI row 1 — audience + headline reach */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Users} label="Followers" value={fmt(account.followers)} sub={`${fmt(account.follows)} following`} accent={C.gold} />
        <Kpi icon={Eye} label={`Reach · ${windowDays}d`} value={fmt(summary.reach)} accent={C.gold} />
        {summary.views != null && <Kpi icon={Play} label={`Views · ${windowDays}d`} value={fmt(summary.views)} accent={C.gold} />}
        <Kpi icon={Activity} label="Avg engagement rate" value={pct(summary.avg_engagement_rate, 1)} sub={`${fmt(summary.total_interactions)} interactions`} />
      </div>

      {/* KPI row 2 — engagement + profile actions (hide nulls) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Heart} label="Likes" value={fmt(summary.likes)} />
        <Kpi icon={MessageCircle} label="Comments" value={fmt(summary.comments)} />
        {summary.saves != null && <Kpi icon={Bookmark} label="Saves" value={fmt(summary.saves)} />}
        {summary.shares != null && <Kpi icon={Share2} label="Shares" value={fmt(summary.shares)} />}
      </div>
      {(summary.accounts_engaged != null || summary.profile_views != null || summary.website_clicks != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          {summary.accounts_engaged != null && <Kpi icon={UserCheck} label="Accounts engaged" value={fmt(summary.accounts_engaged)} />}
          {summary.profile_views != null && <Kpi icon={Eye} label="Profile views" value={fmt(summary.profile_views)} />}
          {summary.website_clicks != null && <Kpi icon={MousePointerClick} label="Website clicks" value={fmt(summary.website_clicks)} />}
        </div>
      )}

      {/* trend — with period tabs */}
      {hasTrend && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Reach & views" icon={TrendingUp}
                 right={<PeriodTabs value={period} onChange={setPeriod} accent={CHANNELS.instagram} />}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <Kpi label={`Reach · ${period}`} value={fmt(pv.totals.reach)} accent={CHANNELS.instagram} />
              <Kpi label={`Views · ${period}`} value={fmt(pv.totals.views)} accent={C.teal} />
              <Kpi label={`Growth · ${period}`} value={gr == null ? "—" : `${gr >= 0 ? "+" : ""}${gr.toFixed(1)}%`}
                   sub={gr == null ? "need prior period" : `vs prior ${period}`}
                   accent={gr == null ? C.sub : gr >= 0 ? C.teal : C.coral} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pv.rows} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gIgReach" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.gold} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.gold} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
                <Area type="monotone" dataKey="reach" stroke={C.gold} strokeWidth={2} fill="url(#gIgReach)" />
                <Area type="monotone" dataKey="views" stroke={C.teal} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* demographics */}
      {(demo.countries?.length || demo.gender?.length || demo.age?.length) ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
          {demo.countries?.length > 0 && (
            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
              <Panel title="Top follower countries" icon={Globe}>
                <BarList rows={demo.countries} accent={C.teal} labelMap={COUNTRY_NAMES} />
              </Panel>
            </div>
          )}
          {demo.age?.length > 0 && (
            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
              <Panel title="Followers by age" icon={PieChart}>
                <BarList rows={demo.age} accent={C.gold} />
              </Panel>
            </div>
          )}
          {demo.gender?.length > 0 && (
            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
              <Panel title="Followers by gender" icon={Users}>
                <BarList rows={demo.gender} accent={C.sky} labelMap={GENDER_NAMES} />
              </Panel>
            </div>
          )}
        </div>
      ) : null}

      {/* recent media table */}
      <Panel title="Recent posts" icon={Database}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.sub, textAlign: "left" }}>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Post</th>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Reach</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>ER</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Likes</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Saves</th>
              </tr>
            </thead>
            <tbody>
              {topMedia.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 4px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.permalink ? (
                      <a href={m.permalink} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>
                        {m.caption || "—"}
                      </a>
                    ) : (m.caption || "—")}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap", fontSize: 12 }}>{m.type || "—"}</td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>{m.timestamp ? m.timestamp.slice(0, 10) : "—"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(m.reach ?? m.views)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>{pct(m.engagement_rate)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(m.likes)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{m.saves == null ? "—" : fmt(m.saves)}</td>
                </tr>
              ))}
              {topMedia.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "16px 4px", color: C.faint }}>
                    No posts in the current data file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
