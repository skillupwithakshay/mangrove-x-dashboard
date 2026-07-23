import { useEffect, useMemo, useState } from "react";
import XPanel from "./components/XPanel.jsx";
import YouTubePanel from "./components/YouTubePanel.jsx";
import InstagramPanel from "./components/InstagramPanel.jsx";
import TikTokPanel from "./components/TikTokPanel.jsx";
import LinkedInPanel from "./components/LinkedInPanel.jsx";
import PyPIPanel from "./components/PyPIPanel.jsx";
import HubSpotPanel from "./components/HubSpotPanel.jsx";
import DiscordPanel from "./components/DiscordPanel.jsx";
import AcquisitionPanel from "./components/AcquisitionPanel.jsx";
import OverviewTab from "./components/OverviewTab.jsx";
import Logo from "./components/Logo.jsx";
import { C, FONT, num, R } from "./lib/theme.js";
import {
  indexSnapshots, growthMatrix, blendedAudience, blendedGrowth, indexedSeries,
  AUDIENCE_PLATFORMS,
} from "./lib/growth.js";
import { buildInsight } from "./lib/insight.js";

const DAYS = { "7D": 7, "30D": 30, "6M": 182, "1Y": 365 };

export default function SocialsPage() {
  const [xData, setXData] = useState(null);
  const [ytData, setYtData] = useState(null);
  const [igData, setIgData] = useState(null);
  const [ttData, setTtData] = useState(null);
  const [liData, setLiData] = useState(null);
  const [pypiData, setPypiData] = useState(null);
  const [hsData, setHsData] = useState(null);
  const [dcData, setDcData] = useState(null);
  const [ga4Data, setGa4Data] = useState(null);
  const [funnelData, setFunnelData] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [manifest, setManifest] = useState({});
  const [error, setError] = useState(null);

  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("30D");

  useEffect(() => {
    fetch("/data/x_latest.json")
      .then((r) => { if (!r.ok) throw new Error(`x_latest.json (${r.status})`); return r.json(); })
      .then(setXData).catch((e) => setError(e.message));
    const soft = (u, set, d = null) => fetch(u).then((r) => (r.ok ? r.json() : d)).then(set).catch(() => set(d));
    soft("/data/youtube_latest.json", setYtData);
    soft("/data/instagram_latest.json", setIgData);
    soft("/data/tiktok_latest.json", setTtData);
    soft("/data/linkedin_latest.json", setLiData);
    soft("/data/pypi_latest.json", setPypiData);
    soft("/data/hubspot.json", setHsData);
    soft("/data/discord.json", setDcData);
    soft("/data/ga4.json", setGa4Data);       // Phase 2 — absent until GA4 fetcher lands
    soft("/data/funnel.json", setFunnelData);  // Phase 2 — absent until funnel sources land
    soft("/data/snapshots.json", setSnapshots, []);
    soft("/data/_manifest.json", setManifest, {});
  }, []);

  // Closed-loop trend: HubSpot monthly contacts acquired overlaid with monthly
  // social engagement (from the social panels' daily series that carry it).
  const revenueTrend = useMemo(() => {
    const months = (hsData?.contacts?.monthlyTrend || []);
    if (!months.length) return [];
    const social = {};
    const add = (d) => (d || []).forEach((row) => {
      const mk = (row.date || "").slice(0, 7);
      if (mk && typeof row.engagements === "number") social[mk] = (social[mk] || 0) + row.engagements;
    });
    [xData, ttData, liData, ytData].forEach((s) => add(s?.daily));
    return months.map((m) => ({ month: m.month, contacts: m.count, social: social[m.month] || 0 }));
  }, [hsData, xData, ttData, liData, ytData]);

  const idx = useMemo(() => indexSnapshots(snapshots), [snapshots]);
  const matrix = useMemo(() => growthMatrix(idx), [idx]);
  const days = DAYS[period];
  const blended = useMemo(() => blendedAudience(idx, {}), [idx]);
  const blendedG = useMemo(() => blendedGrowth(idx, days), [idx, days]);
  const indexed = useMemo(() => indexedSeries(idx, days), [idx, days]);
  const insight = useMemo(() => buildInsight(matrix), [matrix]);
  const trackedCount = useMemo(
    () => AUDIENCE_PLATFORMS.filter((p) => idx[p] && Object.keys(idx[p]).length).length,
    [idx]
  );

  // Most-recent refresh across every source (was X-first, which made the whole
  // header look stale whenever X alone lagged).
  const lastUpdated = useMemo(() => {
    const ts = [
      xData?.last_updated, ytData?.last_updated, igData?.last_updated, ttData?.last_updated,
      liData?.last_updated, pypiData?.last_updated, hsData?.updatedAt, dcData?.updatedAt,
    ].map((t) => (t ? Date.parse(t) : NaN)).filter((n) => !isNaN(n));
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  }, [xData, ytData, igData, ttData, liData, pypiData, hsData, dcData]);
  const loading = xData === null && !error;
  const sampleOf = (id) => id !== "overview" && manifest[id] === "sample";

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "x", label: "X", data: xData },
    { id: "youtube", label: "YouTube", data: ytData },
    { id: "instagram", label: "Instagram", data: igData },
    { id: "tiktok", label: "TikTok", data: ttData },
    { id: "linkedin", label: "LinkedIn", data: liData },
    { id: "pypi", label: "PyPI", data: pypiData },
    { id: "hubspot", label: "HubSpot", data: hsData },
    { id: "discord", label: "Discord", data: dcData },
    { id: "acquisition", label: "Acquisition", data: dcData },
  ];

  const detail = () => {
    switch (tab) {
      case "x": return xData && <XPanel data={xData} />;
      case "youtube": return ytData && <YouTubePanel data={ytData} />;
      case "instagram": return igData && <InstagramPanel data={igData} />;
      case "tiktok": return ttData && <TikTokPanel data={ttData} />;
      case "linkedin": return liData && <LinkedInPanel data={liData} />;
      case "pypi": return <PyPIPanel data={pypiData} />;
      case "hubspot": return <HubSpotPanel data={hsData} trend={revenueTrend} />;
      case "discord": return <DiscordPanel data={dcData} />;
      case "acquisition": return <AcquisitionPanel discord={dcData} ga4={ga4Data} funnel={funnelData} />;
      default: return null;
    }
  };

  const isSample = sampleOf(tab);

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @media print { .no-print { display:none !important; } body { background:#fff; } }
        .tabstrip { scrollbar-width: thin; }
        .tabstrip::-webkit-scrollbar { height: 0; }
        @keyframes shimmer { 0% { opacity:.55 } 50% { opacity:1 } 100% { opacity:.55 } }
        .skel { animation: shimmer 1.3s ease-in-out infinite; background:${C.bg2}; border:1px solid ${C.line}; border-radius:${R.md}px; }
      `}</style>
      <div style={{ height: 3, background: "linear-gradient(90deg,#3FAAD8,#57C9C2,#F0A93B,#E8552F,#E8617E)" }} />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 22px 44px" }}>
        {lastUpdated && (
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 8, ...num }}>
            Last updated · {new Date(lastUpdated).toLocaleString()}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo size={34} />
            <div style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 16 }}>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>Social intelligence</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>Cross-channel audience &amp; growth</div>
            </div>
          </div>
          <button className="no-print" onClick={() => window.print()}
            style={{ border: `1px solid ${C.line}`, background: C.card, color: C.sub, borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            Download / print
          </button>
        </div>

        {/* tab strip — horizontal scroll on narrow screens instead of wrapping,
            so the active underline never detaches from the bottom border */}
        {/* Tab strip wraps to as many rows as needed so no tab is ever hidden.
            Active tab is a filled pill (works cleanly whether or not it wraps). */}
        <div className="no-print tabstrip" role="tablist" aria-label="Data sources"
          style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 18, paddingBottom: 4 }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            const sample = sampleOf(t.id);
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                role="tab" aria-selected={active} aria-current={active ? "page" : undefined}
                style={{ border: "none", cursor: "pointer", padding: "8px 13px", borderRadius: 8,
                  fontSize: 13, fontWeight: active ? 800 : 700, whiteSpace: "nowrap",
                  color: active ? C.teal : C.sub, background: active ? C.tealSoft : "transparent" }}>
                {t.label}
                {sample && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "1px 4px", verticalAlign: "middle" }}>SAMPLE</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ background: C.coralSoft, border: `1px solid ${C.coral}`, borderRadius: R.sm, padding: 14, marginBottom: 16, fontSize: 13, color: C.coralInk }}>
            Couldn't load core data: {error}.
          </div>
        )}

        {loading ? (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ flex: "1 1 150px", height: 78 }} />)}
            </div>
            <div className="skel" style={{ height: 260, marginBottom: 14 }} />
            <div className="skel" style={{ height: 180 }} />
          </div>
        ) : tab === "overview" ? (
          <OverviewTab
            period={period} setPeriod={setPeriod}
            blended={blended} trackedCount={trackedCount} blendedG={blendedG}
            pypiTotal={pypiData?.total} pypiWindow={pypiData?.window}
            insight={insight} matrix={matrix} manifest={manifest} indexed={indexed} idx={idx}
            hs={hsData} discord={dcData} ga4={ga4Data} funnel={funnelData}
          />
        ) : (
          <div>
            {isSample && (
              <div style={{ background: C.goldSoft, border: `1px solid ${C.goldSoftBorder}`, borderLeft: `3px solid ${C.gold}`, borderRadius: R.sm, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: C.goldInk }}>
                Sample data — {tabs.find((t) => t.id === tab)?.label} isn't connected to a live source yet. These numbers are placeholders, not real.
              </div>
            )}
            {tab === "tiktok" && manifest.tiktok === "live" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: C.sub }}>
                TikTok app is in Sandbox — figures reflect sandbox / target-user data, not the public account's full reach.
              </div>
            )}
            <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: R.lg, padding: 16 }}>
              {detail() || <div style={{ color: C.faint, fontSize: 13, padding: 8 }}>Not available yet.</div>}
            </div>
          </div>
        )}

        <div style={{ marginTop: 34, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: C.faint }}>
          <span>Mangrove · Social Intelligence — cross-channel audience &amp; growth</span>
          <a href="https://mangrove.ai/" target="_blank" rel="noopener noreferrer" style={{ color: C.faint, textDecoration: "none" }}>mangrove.ai ↗</a>
        </div>
      </div>
    </div>
  );
}
