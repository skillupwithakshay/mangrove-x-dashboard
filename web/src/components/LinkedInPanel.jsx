import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Linkedin, Users, UserPlus, Eye, MousePointer, ThumbsUp, MessageCircle,
  Share2, Activity, TrendingUp, LineChart, Database,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import { C, fmt, pct, num, LINKS, CHANNELS } from "../lib/theme.js";
import { periodView } from "../lib/period.js";

// Renders LinkedIn Company Page analytics from the shape written by
// pipeline/fetch_linkedin_data.py -> data/linkedin_latest.json:
//   { last_updated, source, window_days,
//     organization: {name, url, followers, logo_url},
//     summary: {followers, follower_growth, unique_visitors, page_views,
//               post_impressions, post_reactions, post_comments, post_shares,
//               engagement_rate},
//     followers_history: [{date, followers}],
//     daily: [{date, impressions, engagements}],
//     posts: [{id, date, text, impressions, reactions, comments, shares,
//              engagement_rate, url}] }
//
// The data source may be the Selenium scraper (best-effort — many metrics can
// be null) or the official API later. Every card/section hides itself when its
// value is absent, so the panel looks clean regardless of how much came back.
export default function LinkedInPanel({ data }) {
  if (!data) {
    return (
      <Panel title="LinkedIn Analytics" icon={Linkedin}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No LinkedIn data yet. Run pipeline/fetch_linkedin_data.py (see README).
        </div>
      </Panel>
    );
  }

  const org = data.organization || {};
  const summary = data.summary || {};
  const history = data.followers_history || [];
  const daily = data.daily || [];
  const posts = data.posts || [];
  const windowDays = data.window_days || 30;
  const followers = summary.followers ?? org.followers;

  const topPosts = useMemo(
    () => [...posts].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10),
    [posts]
  );
  const hasTrend = daily.some((d) => (d.impressions || 0) > 0);
  const [period, setPeriod] = useState("30D");
  const pv = useMemo(() => periodView(daily, period, ["impressions", "engagements"]), [daily, period]);
  const gr = pv.growth.impressions;
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {org.logo_url && (
            <img src={org.logo_url} alt="" width={40} height={40}
                 style={{ borderRadius: 8, border: `1px solid ${C.line}` }} />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
              <a href={LINKS.linkedin} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {org.name || "Company"} · LinkedIn Analytics
                <span style={{ fontSize: 12, color: C.faint }}>↗</span>
              </a>
            </h2>
          </div>
        </div>
      </div>

      {/* KPI row — audience + reach */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Users} label="Followers" value={fmt(followers)}
             sub={summary.follower_growth != null ? `${summary.follower_growth >= 0 ? "+" : ""}${fmt(summary.follower_growth)} tracked` : undefined}
             accent={C.sky} />
        {summary.post_impressions != null && <Kpi icon={Eye} label={`Impressions · ${windowDays}d`} value={fmt(summary.post_impressions)} accent={C.sky} />}
        {summary.engagement_rate != null && <Kpi icon={Activity} label="Engagement rate" value={pct(summary.engagement_rate)} />}
        {summary.unique_visitors != null && <Kpi icon={UserPlus} label="Unique visitors" value={fmt(summary.unique_visitors)} />}
      </div>

      {/* KPI row — engagement + visits (only shows cards that exist) */}
      {(summary.post_reactions != null || summary.post_comments != null ||
        summary.post_shares != null || summary.page_views != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          {summary.post_reactions != null && <Kpi icon={ThumbsUp} label="Reactions" value={fmt(summary.post_reactions)} />}
          {summary.post_comments != null && <Kpi icon={MessageCircle} label="Comments" value={fmt(summary.post_comments)} />}
          {summary.post_shares != null && <Kpi icon={Share2} label="Reposts" value={fmt(summary.post_shares)} />}
          {summary.page_views != null && <Kpi icon={MousePointer} label="Page views" value={fmt(summary.page_views)} />}
        </div>
      )}

      {/* follower growth */}
      {history.length >= 2 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Follower growth (tracked daily)" icon={LineChart}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gLiFollowers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.sky} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.sky} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), "followers"]} />
                <Area type="monotone" dataKey="followers" stroke={C.sky} strokeWidth={2} fill="url(#gLiFollowers)" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* impressions trend — with period tabs */}
      {hasTrend && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Impressions & engagement" icon={TrendingUp}
                 right={<PeriodTabs value={period} onChange={setPeriod} accent={CHANNELS.linkedin} />}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <Kpi label={`Impressions · ${period}`} value={fmt(pv.totals.impressions)} accent={CHANNELS.linkedin} />
              <Kpi label={`Engagements · ${period}`} value={fmt(pv.totals.engagements)} accent={C.gold} />
              <Kpi label={`Growth · ${period}`} value={gr == null ? "—" : `${gr >= 0 ? "+" : ""}${gr.toFixed(1)}%`}
                   sub={gr == null ? "need prior period" : `vs prior ${period}`}
                   accent={gr == null ? C.sub : gr >= 0 ? C.teal : C.coral} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pv.rows} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gLiImpr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.teal} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.teal} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
                <Area type="monotone" dataKey="impressions" stroke={C.teal} strokeWidth={2} fill="url(#gLiImpr)" />
                <Area type="monotone" dataKey="engagements" stroke={C.gold} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* recent posts table */}
      {posts.length > 0 && (
        <Panel title="Recent posts" icon={Database}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.sub, textAlign: "left" }}>
                  <th style={{ padding: "6px 4px", fontWeight: 600 }}>Post</th>
                  <th style={{ padding: "6px 4px", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Impr</th>
                  <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>ER</th>
                  <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Reactions</th>
                  <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "8px 4px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>
                          {p.text || "—"}
                        </a>
                      ) : (p.text || "—")}
                    </td>
                    <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>{p.date || "—"}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(p.impressions)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>{pct(p.engagement_rate)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(p.reactions)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(p.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
