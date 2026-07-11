import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Music2, Users, UserPlus, Eye, Heart, MessageCircle, Share2, Activity,
  Film, TrendingUp, Database, BadgeCheck,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import { C, fmt, pct, num, LINKS, CHANNELS } from "../lib/theme.js";
import { periodView } from "../lib/period.js";

// Renders TikTok analytics from the shape written by
// pipeline/fetch_tiktok_data.py -> data/tiktok_latest.json:
//   { last_updated,
//     account: {display_name, bio, avatar_url, profile_url, is_verified,
//               followers, following, likes, video_count},
//     summary: {videos_analyzed, total_views, total_likes, total_comments,
//               total_shares, avg_engagement_rate},
//     daily: [{date, views, engagements}],
//     videos: [{id, title, date, views, likes, comments, shares,
//               engagement_rate, duration, cover, url}] }
//
// Uses the shared Kpi/Panel atoms so it matches the X / YouTube / Instagram
// panels. `likes` on the account is total lifetime likes received; the
// summary totals are over the recently analyzed videos.
export default function TikTokPanel({ data }) {
  if (!data) {
    return (
      <Panel title="TikTok Analytics" icon={Music2}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No TikTok data yet. Run pipeline/fetch_tiktok_data.py (see README).
        </div>
      </Panel>
    );
  }

  const account = data.account || {};
  const summary = data.summary || {};
  const daily = data.daily || [];
  const videos = data.videos || [];

  const topVideos = useMemo(
    () => [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10),
    [videos]
  );
  const analyzed = summary.videos_analyzed ?? videos.length;
  const [period, setPeriod] = useState("30D");
  const pv = useMemo(() => periodView(daily, period, ["views", "engagements"]), [daily, period]);
  const gr = pv.growth.views;
  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {account.avatar_url && (
            <img src={account.avatar_url} alt="" width={40} height={40}
                 style={{ borderRadius: "50%", border: `1px solid ${C.line}` }} />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
              <a href={LINKS.tiktok} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {account.display_name || "TikTok"} · TikTok Analytics
                {account.is_verified && <BadgeCheck size={16} color={C.sky} />}
                <span style={{ fontSize: 12, color: C.faint }}>↗</span>
              </a>
            </h2>
          </div>
        </div>
      </div>

      {/* KPI row — audience */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Users} label="Followers" value={fmt(account.followers)} accent={C.coral} />
        <Kpi icon={UserPlus} label="Following" value={fmt(account.following)} accent={C.coral} />
        <Kpi icon={Heart} label="Total likes" value={fmt(account.likes)} sub="lifetime, all videos" accent={C.coral} />
        <Kpi icon={Film} label="Videos" value={fmt(account.video_count)} />
      </div>

      {/* KPI row — recent performance */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Eye} label="Views" value={fmt(summary.total_views)} sub={`${analyzed} recent videos`} />
        <Kpi icon={Activity} label="Avg engagement rate" value={pct(summary.avg_engagement_rate)} />
        <Kpi icon={Heart} label="Likes" value={fmt(summary.total_likes)} />
        <Kpi icon={MessageCircle} label="Comments" value={fmt(summary.total_comments)} />
        <Kpi icon={Share2} label="Shares" value={fmt(summary.total_shares)} />
      </div>

      {/* trend — with period tabs */}
      {daily.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Views & engagement" icon={TrendingUp}
                 right={<PeriodTabs value={period} onChange={setPeriod} accent={CHANNELS.tiktok} />}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <Kpi label={`Views · ${period}`} value={fmt(pv.totals.views)} accent={CHANNELS.tiktok} />
              <Kpi label={`Engagements · ${period}`} value={fmt(pv.totals.engagements)} accent={C.teal} />
              <Kpi label={`Growth · ${period}`} value={gr == null ? "—" : `${gr >= 0 ? "+" : ""}${gr.toFixed(1)}%`}
                   sub={gr == null ? "need prior period" : `vs prior ${period}`}
                   accent={gr == null ? C.sub : gr >= 0 ? C.teal : C.coral} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pv.rows} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gTtViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.coral} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.coral} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
                <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
                <Area type="monotone" dataKey="views" stroke={C.coral} strokeWidth={2} fill="url(#gTtViews)" />
                <Area type="monotone" dataKey="engagements" stroke={C.teal} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* recent videos table */}
      <Panel title="Top videos" icon={Database}>
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
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Shares</th>
              </tr>
            </thead>
            <tbody>
              {topVideos.map((v) => (
                <tr key={v.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 4px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.url ? (
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>
                        {v.title || "—"}
                      </a>
                    ) : (v.title || "—")}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>{v.date || "—"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.views)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>{pct(v.engagement_rate)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.likes)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.comments)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(v.shares)}</td>
                </tr>
              ))}
              {topVideos.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "16px 4px", color: C.faint }}>
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
