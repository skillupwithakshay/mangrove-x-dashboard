import { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Eye, Activity, UserPlus, Heart, Repeat2, MessageCircle, Bookmark, TrendingUp, Database } from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import { C, fmt, pct, num } from "../lib/theme.js";

// Renders X (Twitter) analytics from the shape written by
// pipeline/fetch_x_data.py -> data/x_latest.json:
//   { last_updated, account: {handle, name, followers_count},
//     summary: {total_impressions, total_engagements, avg_engagement_rate, post_count},
//     daily: [{date, impressions, engagements}],
//     tweets: [{id, date, text, impressions, likes, reposts, replies, bookmarks, engagement_rate}] }
//
// This started from MangroveXDashboard.jsx (the CSV-upload prototype) — the
// visual language (Kpi/Panel atoms, chart styling) carries over, but data
// now comes from the pipeline's JSON instead of a client-side CSV upload.
export default function XPanel({ data }) {
  const account = data.account || {};
  const summary = data.summary || {};
  const daily = data.daily || [];
  const tweets = data.tweets || [];

  const likes = useMemo(() => tweets.reduce((a, t) => a + (t.likes || 0), 0), [tweets]);
  const reposts = useMemo(() => tweets.reduce((a, t) => a + (t.reposts || 0), 0), [tweets]);
  const replies = useMemo(() => tweets.reduce((a, t) => a + (t.replies || 0), 0), [tweets]);
  const bookmarks = useMemo(() => tweets.reduce((a, t) => a + (t.bookmarks || 0), 0), [tweets]);

  const topTweets = useMemo(
    () => [...tweets].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10),
    [tweets]
  );

  const tip = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px" };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
            {account.name || "X"} · X Analytics
          </h2>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
            {account.handle || ""} · {summary.post_count ?? tweets.length} posts
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={UserPlus} label="Followers" value={fmt(account.followers_count)} />
        <Kpi icon={Eye} label="Total impressions" value={fmt(summary.total_impressions)} sub={`${summary.post_count ?? tweets.length} posts`} />
        <Kpi icon={Activity} label="Avg engagement rate" value={pct(summary.avg_engagement_rate)} sub={`${fmt(summary.total_engagements)} engagements`} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Heart} label="Likes" value={fmt(likes)} />
        <Kpi icon={Repeat2} label="Reposts" value={fmt(reposts)} />
        <Kpi icon={MessageCircle} label="Replies" value={fmt(replies)} />
        <Kpi icon={Bookmark} label="Bookmarks" value={fmt(bookmarks)} />
      </div>

      {/* trend */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Impressions & engagement over time" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily} margin={{ left: -10, right: 8, top: 6 }}>
              <defs>
                <linearGradient id="gImpr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => d.slice(5)} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
              <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
              <Area type="monotone" dataKey="impressions" stroke={C.teal} strokeWidth={2} fill="url(#gImpr)" />
              <Area type="monotone" dataKey="engagements" stroke={C.gold} strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* recent tweets table */}
      <Panel title="Recent posts" icon={Database}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.sub, textAlign: "left" }}>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Post</th>
                <th style={{ padding: "6px 4px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Impr</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>ER</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Likes</th>
              </tr>
            </thead>
            <tbody>
              {topTweets.map((t) => (
                <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 4px", maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.text || "—"}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>
                    {t.date ? t.date.slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.impressions)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>
                    {pct(t.engagement_rate)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.likes)}</td>
                </tr>
              ))}
              {topTweets.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "16px 4px", color: C.faint }}>
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
