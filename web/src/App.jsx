import { useEffect, useMemo, useState } from "react";
import XPanel from "./components/XPanel.jsx";
import YouTubePanel from "./components/YouTubePanel.jsx";
import InstagramPanel from "./components/InstagramPanel.jsx";
import TikTokPanel from "./components/TikTokPanel.jsx";
import LinkedInPanel from "./components/LinkedInPanel.jsx";
import PyPIPanel from "./components/PyPIPanel.jsx";
import HubSpotPanel from "./components/HubSpotPanel.jsx";
import OverviewTab from "./components/OverviewTab.jsx";
import Logo from "./components/Logo.jsx";
import { C, FONT, num } from "./lib/theme.js";
import {
  indexSnapshots, growthMatrix, blendedAudience, blendedGrowth, indexedSeries,
  AUDIENCE_PLATFORMS,
} from "./lib/growth.js";
import { buildInsight } from "./lib/insight.js";

const DAYS = { "7D": 7, "30D": 30, "6M": 182, "1Y": 365 };

export default function App() {
  const [xData, setXData] = useState(null);
  const [ytData, setYtData] = useState(null);
  const [igData, setIgData] = useState(null);
  const [ttData, setTtData] = useState(null);
  const [liData, setLiData] = useState(null);
  const [pypiData, setPypiData] = useState(null);
  const [hsData, setHsData] = useState(null);
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

  const lastUpdated = xData?.last_updated || igData?.last_updated || ttData?.last_updated;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "x", label: "X", data: xData },
    { id: "youtube", label: "YouTube", data: ytData },
    { id: "instagram", label: "Instagram", data: igData },
    { id: "tiktok", label: "TikTok", data: ttData },
    { id: "linkedin", label: "LinkedIn", data: liData },
    { id: "pypi", label: "PyPI", data: pypiData },
    { id: "hubspot", label: "Revenue engine", data: hsData },
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
      default: return null;
    }
  };

  const isSample = tab !== "overview" && manifest[tab] === "sample";

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } }`}</style>
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

        {/* tab strip */}
        <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 18 }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            const sample = t.id !== "overview" && manifest[t.id] === "sample";
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "9px 13px",
                  fontSize: 13, fontWeight: 700, color: active ? C.ink : C.sub,
                  borderBottom: `2px solid ${active ? C.teal : "transparent"}`, marginBottom: -1 }}>
                {t.label}
                {sample && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "1px 4px", verticalAlign: "middle" }}>SAMPLE</span>}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ background: "#FBEAE6", border: `1px solid ${C.coral}`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#8A3324" }}>
            Couldn't load core data: {error}.
          </div>
        )}

        {tab === "overview" ? (
          <OverviewTab
            period={period} setPeriod={setPeriod}
            blended={blended} trackedCount={trackedCount} blendedG={blendedG}
            pypiTotal={pypiData?.total} pypiWindow={pypiData?.window}
            insight={insight} matrix={matrix} manifest={manifest} indexed={indexed} idx={idx}
          />
        ) : (
          <div>
            {isSample && (
              <div style={{ background: C.goldSoft, border: `1px solid #EADFC2`, borderLeft: `3px solid ${C.gold}`, borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: "#7A5B2E" }}>
                Sample data — {tabs.find((t) => t.id === tab)?.label} isn't connected to a live source yet. These numbers are placeholders, not real.
              </div>
            )}
            {tab === "tiktok" && manifest.tiktok === "live" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: C.sub }}>
                TikTok app is in Sandbox — figures reflect sandbox / target-user data, not the public account's full reach.
              </div>
            )}
            <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
              {detail() || <div style={{ color: C.faint, fontSize: 13, padding: 8 }}>Not available yet.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
