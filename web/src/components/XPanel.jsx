import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Eye, Activity, UserPlus, Users, MessageSquare, ListChecks, Heart, Repeat2,
  MessageCircle, Quote, Bookmark, MousePointerClick, User, TrendingUp,
  LineChart, Hash, Database, BadgeCheck,
} from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import PeriodTabs from "./PeriodTabs.jsx";
import { C, fmt, pct, num, LINKS, CHANNELS } from "../lib/theme.js";
import { periodView } from "../lib/period.js";

// Renders X (Twitter) analytics from the shape written by
// pipeline/fetch_x_data.py -> data/x_latest.json:
//   { last_updated,
//     account: {handle, name, followers_count, following_count, tweet_count,
//               listed_count, verified, description, profile_image_url, ...},
//     summary: {total_impressions, total_engagements, avg_engagement_rate,
//               post_count, total_likes, total_reposts, total_replies,
//               total_quotes, total_bookmarks, total_url_link_clicks,
//               total_profile_clicks},
//     daily: [{date, impressions, engagements}],
//     followers_history: [{date, followers}],
//     top_hashtags: [{tag, count}],
//     tweets: [{id, date, text, url, impressions, likes, reposts, replies,
//               quotes, bookmarks, url_link_clicks, user_profile_clicks,
//               engagement_rate}] }
//
// New analytics fields degrade gracefully: any card/section is hidden when its
// data is absent, so the panel keeps working with older data files too.
export default function XPanel({ data }) {
  const account = data.account || {};
  const summary = data.summary || {};
  const daily = data.daily || [];
  const tweets = data.tweets || [];
  const followersHistory = data.followers_history || [];
  const topHashtags = data.top_hashtags || [];

  // Prefer pipeline-computed totals; fall back to summing tweets for old files.
  // Sums are computed unconditionally (hooks must not be called conditionally),
  // then only used when the summary total is absent.
  const sums = useMemo(() => {
    const acc = { likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0 };
    for (const t of tweets) {
      acc.likes += t.likes || 0;
      acc.reposts += t.reposts || 0;
      acc.replies += t.replies || 0;
      acc.quotes += t.quotes || 0;
      acc.bookmarks += t.bookmarks || 0;
    }
    return acc;
  }, [tweets]);
  const likes = summary.total_likes ?? sums.likes;
  const reposts = summary.total_reposts ?? sums.reposts;
  const replies = summary.total_replies ?? sums.replies;
  const quotes = summary.total_quotes ?? sums.quotes;
  const bookmarks = summary.total_bookmarks ?? sums.bookmarks;
  const linkClicks = summary.total_url_link_clicks;
  const profileClicks = summary.total_profile_clicks;

  const topTweets = useMemo(
    () => [...tweets].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10),
    [tweets]
  );

  const followerGain = useMemo(() => {
    if (followersHistory.length < 2) return null;
    return followersHistory[followersHistory.length - 1].followers - followersHistory[0].followers;
  }, [followersHistory]);
  const maxHashtag = useMemo(() => Math.max(1, ...topHashtags.map((h) => h.count || 0)), [topHashtags]);

  const [period, setPeriod] = useState("30D");
  const pv = useMemo(() => periodView(daily, period, ["impressions", "engagements"]), [daily, period]);
  const gr = pv.growth.impressions;

  const tip = { background: C.cardHi, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", color: C.ink };

  return (
    <div>
      {/* header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {account.profile_image_url && (
            <img src={account.profile_image_url} alt="" width={40} height={40}
                 style={{ borderRadius: "50%", border: `1px solid ${C.line}` }} />
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
              <a href={LINKS.x} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {account.name || "X"} · X Analytics
                {account.verified && <BadgeCheck size={16} color={C.sky} />}
                <span style={{ fontSize: 12, color: C.faint }}>↗</span>
              </a>
            </h2>
          </div>
        </div>
      </div>

      {/* KPI row — audience */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={UserPlus} label="Followers" value={fmt(account.followers_count)}
             sub={followerGain != null ? `${followerGain >= 0 ? "+" : ""}${fmt(followerGain)} tracked` : undefined} />
        {account.following_count != null && <Kpi icon={Users} label="Following" value={fmt(account.following_count)} />}
        {account.tweet_count != null && <Kpi icon={MessageSquare} label="Total posts" value={fmt(account.tweet_count)} />}
        {account.listed_count != null && <Kpi icon={ListChecks} label="Listed" value={fmt(account.listed_count)} />}
      </div>

      {/* KPI row — reach + engagement headline */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Eye} label="Total impressions" value={fmt(summary.total_impressions)} sub={`${summary.post_count ?? tweets.length} posts`} />
        <Kpi icon={Activity} label="Avg engagement rate" value={pct(summary.avg_engagement_rate)} sub={`${fmt(summary.total_engagements)} engagements`} />
        {linkClicks != null && <Kpi icon={MousePointerClick} label="Link clicks" value={fmt(linkClicks)} accent={C.gold} />}
        {profileClicks != null && <Kpi icon={User} label="Profile clicks" value={fmt(profileClicks)} accent={C.gold} />}
      </div>

      {/* KPI row — engagement breakdown */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Kpi icon={Heart} label="Likes" value={fmt(likes)} />
        <Kpi icon={Repeat2} label="Reposts" value={fmt(reposts)} />
        <Kpi icon={MessageCircle} label="Replies" value={fmt(replies)} />
        <Kpi icon={Quote} label="Quotes" value={fmt(quotes)} />
        <Kpi icon={Bookmark} label="Bookmarks" value={fmt(bookmarks)} />
      </div>

      {/* follower growth (true time series from snapshots) */}
      {followersHistory.length >= 2 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Follower growth (tracked daily)" icon={LineChart}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={followersHistory} margin={{ left: -10, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gFollowers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.sky} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.sky} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), "followers"]} />
                <Area type="monotone" dataKey="followers" stroke={C.sky} strokeWidth={2} fill="url(#gFollowers)" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* impressions & engagement — with period tabs */}
      <div style={{ marginBottom: 14 }}>
        <Panel title="Impressions & engagement" icon={TrendingUp}
               right={<PeriodTabs value={period} onChange={setPeriod} accent={CHANNELS.x} />}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <Kpi label={`Impressions · ${period}`} value={fmt(pv.totals.impressions)} accent={CHANNELS.x} />
            <Kpi label={`Engagements · ${period}`} value={fmt(pv.totals.engagements)} accent={C.gold} />
            <Kpi label={`Growth · ${period}`} value={gr == null ? "—" : `${gr >= 0 ? "+" : ""}${gr.toFixed(1)}%`}
                 sub={gr == null ? "need prior period" : `vs prior ${period}`}
                 accent={gr == null ? C.sub : gr >= 0 ? C.teal : C.coral} />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={pv.rows} margin={{ left: -10, right: 8, top: 6 }}>
              <defs>
                <linearGradient id="gImpr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickFormatter={(d) => (d || "").slice(5)} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} tickFormatter={fmt} width={48} />
              <Tooltip contentStyle={tip} formatter={(v, n) => [fmt(v), n]} />
              <Area type="monotone" dataKey="impressions" stroke={C.teal} strokeWidth={2} fill="url(#gImpr)" />
              <Area type="monotone" dataKey="engagements" stroke={C.gold} strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* top hashtags */}
      {topHashtags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Top hashtags" icon={Hash}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topHashtags.map((h) => (
                <div key={h.tag} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 150, fontSize: 12.5, color: C.sub, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    #{h.tag}
                  </div>
                  <div style={{ flex: 1, background: C.bg, borderRadius: 6, height: 16, overflow: "hidden" }}>
                    <div style={{ width: `${(h.count / maxHashtag) * 100}%`, background: C.teal, height: "100%", borderRadius: 6 }} />
                  </div>
                  <div style={{ width: 40, textAlign: "right", fontSize: 12.5, ...num }}>{fmt(h.count)}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

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
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Reposts</th>
                <th style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>Quotes</th>
              </tr>
            </thead>
            <tbody>
              {topTweets.map((t) => {
                // Prefer the pipeline-provided permalink; fall back to building
                // it from handle + id so links work even on older data files.
                const handle = (account.handle || "").replace("@", "");
                const url = t.url || (handle && t.id ? `https://x.com/${handle}/status/${t.id}` : null);
                return (
                <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "8px 4px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>
                        {t.text || "—"}
                      </a>
                    ) : (t.text || "—")}
                  </td>
                  <td style={{ padding: "8px 4px", color: C.sub, whiteSpace: "nowrap" }}>
                    {t.date ? t.date.slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.impressions)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: C.teal, ...num }}>
                    {pct(t.engagement_rate)}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.likes)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.reposts)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", ...num }}>{fmt(t.quotes)}</td>
                </tr>
                );
              })}
              {topTweets.length === 0 && (
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
