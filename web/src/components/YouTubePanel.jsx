import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Youtube, Users, Eye, Clock, Activity, Timer, Gauge, MousePointerClick,
  UserPlus, ThumbsUp, MessageCircle, Share2, TrendingUp, Database, Radio,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import { C, fmt, pct, num, LINKS, CHANNELS } from "../lib/theme.js";
import { periodView } from "../lib/period.js";

// Renders YouTube analytics from the shape written by
// pipeline/fetch_youtube_data.py -> data/youtube_latest.json:
//   { last_updated, analytics_available, window_days,
//     channel: {id, title, handle, subscribers, total_views, video_count, thumbnail},
//     summary: {views, watch_time_hours, avg_view_duration_sec, avg_view_percentage,
//               impressions, impressions_ctr, subscribers_gained, subscribers_lost,
//               net_subscribers, likes, comments, shares, avg_engagement_rate, video_count},
//     daily: [{date, views, watch_time_hours, engagements}],
//     traffic_sources: [{source, views}],
//     videos: [{id, title, date, views, likes, comments, engagement_rate, thumbnail, url}] }
//
// Follows the same contract/visual language as XPanel using the shared
// Kpi/Panel atoms, so both panels look consistent. `analytics_available`
// is false when the OAuth token only had public/Data-API scope — in that
// case the owner-only cards (watch time, impressions, etc.) are hidden
// rather than shown as blanks.

// Human labels for YouTube's traffic-source enum values.
const TRAFFIC_LABELS = {
  YT_SEARCH: "YouTube search",
  SUGGESTED_VIDEO: "Suggested videos",
  BROWSE_FEATURES: "Browse / home",
  EXTERNAL: "External sites",
  PLAYLIST: "Playlists",
  DIRECT_OR_UNKNOWN: "Direct / unknown",
  CHANNEL: "Channel page",
  NOTIFICATION: "Notifications",
  SHORTS: "Shorts feed",
  ADVERTISING: "Advertising",
  END_SCREEN: "End screens",
  ANNOTATION: "Cards / annotations",
  SUBSCRIBER: "Subscriber feed",
  HASHTAGS: "Hashtags",
};

const fmtDuration = (sec) => {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function YouTubePanel({ data }) {
  if (!data) {
    return (
      <Panel title="YouTube Analytics" icon={Youtube}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No YouTube data yet. Run pipeline/fetch_youtube_data.py (see README).
        </div>
      </Panel>
    );
  }

  const channel = data.channel || {};
  const summary = data.summary || {};
  const daily = data.daily || [];
  const traffic = data.traffic_sources || [];
  const videos = data.videos || [];
  const hasAnalytics = data.analytics_available;
  const windowDays = data.window_days || 90;

  const topVideos = useMemo(
    () => [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [videos]
  );
  const maxTraffic = useMemo(
    () => Math.max(1, ...traffic.map((t) => t.views || 0)),
    [traffic]
  );

  const [period, setPeriod] = useState("30D");
  const pv = useMemo(() => periodView(daily, period, ["views", "watch_time_hours"]), [daily, period]);
  const gr = pv.growth.views;

  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {channel.thumbnail && (
            <img
              src={channel.thumbnail}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: "50%", border: `1px solid ${C.line}` }}
            />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
              <a href={LINKS.youtube} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {channel.title || "YouTube"} · YouTube Analytics
                <span style={{ fontSize: 12, color: C.faint }}>↗</span>
              </a>
            </h2>
          </div>
        </div>
      </div>

      {/* Lifetime channel KPIs (always available via Data API) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Users} label="Subscribers" value={fmt(channel.subscribers)}
             sub={hasAnalytics && summary.net_subscribers != null
                    ? `${summary.net_subscribers >= 0 ? "+" : ""}${fmt(summary.net_subscribers)} in ${windowDays}d`
                    : undefined}
             accent={C.coral} />
        <Kpi icon={Eye} label="Total views (lifetime)" value={fmt(channel.total_views)} accent={C.coral} />
        <Kpi icon={Activity} label="Avg engagement rate"
             value={pct(summary.avg_engagement_rate)}
             sub={`${fmt(summary.likes)} likes · ${fmt(summary.comments)} comments`} />
      </div>

      {/* Window analytics KPIs (owner-only — hidden if no analytics scope) */}
      {hasAnalytics && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <Kpi icon={Eye} label={`Views · ${windowDays}d`} value={fmt(summary.views)} />
            <Kpi icon={Clock} label="Watch time (hours)" value={fmt(summary.watch_time_hours)} />
            <Kpi icon={Timer} label="Avg view duration" value={fmtDuration(summary.avg_view_duration_sec)} />
            <Kpi icon={Gauge} label="Avg % viewed" value={pct(summary.avg_view_percentage, 1)} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            {summary.impressions != null && (
              <Kpi icon={Eye} label="Impressions" value={fmt(summary.impressions)} accent={C.gold} />
            )}
            {summary.impressions_ctr != null && (
              <Kpi icon={MousePointerClick} label="Impressions CTR" value={pct(summary.impressions_ctr, 1)} accent={C.gold} />
            )}
            <Kpi icon={UserPlus} label="Subscribers gained" value={fmt(summary.subscribers_gained)} sub={`${fmt(summary.subscribers_lost)} lost`} />
            <Kpi icon={Share2} label="Shares" value={fmt(summary.shares)} />
          </div>
        </>
      )}

      {!hasAnalytics && (
        <div style={{ background: C.goldSoft, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12.5, color: C.sub }}>
          Showing public video stats only. Connect the YouTube Analytics scope
          (see README) to unlock watch time, impressions, average view duration,
          traffic sources and subscriber gains.
        </div>
      )}

      {/* trend (analytics only) — with period tabs */}
      {hasAnalytics && daily.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Views & watch time" icon={TrendingUp}
                 right={<PeriodTabs value={period} onChange={setPeriod} accent={CHANNELS.youtube} />}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <Kpi label={`Views · ${period}`} value={fmt(pv.totals.views)} accent={CHANNELS.youtube} />
              <Kpi label={`Watch hrs · ${period}`} value={fmt(Math.round(pv.totals.watch_time_hours))} accent={C.teal} />
              <Kpi label={`Growth · ${period}`} value={gr == null ? "—" : `${gr >= 0 ? "+" : ""}${gr.toFixed(1)}%`}
                   sub={gr == null ? "need prior period" : `vs prior ${period}`}
                   accent={gr == null ? C.sub : gr >= 0 ? C.teal : C.coral} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pv.rows} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gYtViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.coral} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.coral} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n === "watch_time_hours" ? "watch hrs" : n]} />
                <Area type="monotone" dataKey="views" stroke={C.coral} strokeWidth={2} fill="url(#gYtViews)" />
                <Area type="monotone" dataKey="watch_time_hours" stroke={C.teal} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* traffic sources (analytics only) */}
      {hasAnalytics && traffic.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title={`Where views come from · last ${windowDays} days`} icon={Radio}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {traffic.map((t) => (
                <div key={t.source} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 130, fontSize: 12.5, color: C.sub, flexShrink: 0 }}>
                    {TRAFFIC_LABELS[t.source] || t.source}
                  </div>
                  <div style={{ flex: 1, background: C.bg, borderRadius: 6, height: 16, overflow: "hidden" }}>
                    <div style={{ width: `${(t.views / maxTraffic) * 100}%`, background: C.teal, height: "100%", borderRadius: 6 }} />
                  </div>
                  <div style={{ width: 64, textAlign: "right", fontSize: 12.5, ...num }}>{fmt(t.views)}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* recent videos table */}
      <Panel title="Recent videos" icon={Database}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.sub, textAlign: "left" }}>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Video</th>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Views</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>ER</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Likes</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Comments</th>
              </tr>
            </thead>
            <tbody>
              {topVideos.map((v) => (
                <tr key={v.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 4px", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>
                        {v.title || "—"}
                      </a>
                    ) : (v.title || "—")}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>
                    {v.date ? v.date.slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.views)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>
                    {pct(v.engagement_rate)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.likes)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.comments)}</td>
                </tr>
              ))}
              {topVideos.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "16px 4px", color: C.faint }}>
                    No videos in the current data file.
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
