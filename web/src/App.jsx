import { useEffect, useState } from "react";
import XPanel from "./components/XPanel.jsx";
import YouTubePanel from "./components/YouTubePanel.jsx";
import InstagramPanel from "./components/InstagramPanel.jsx";
import TikTokPanel from "./components/TikTokPanel.jsx";
import LinkedInPanel from "./components/LinkedInPanel.jsx";
import PyPIPanel from "./components/PyPIPanel.jsx";
import Logo from "./components/Logo.jsx";
import { C, FONT, CHANNELS, fmt, num } from "./lib/theme.js";

// Top-level layout. Fetches each source's JSON at runtime (copied to
// public/data/ by scripts/copy-data.js) and renders one panel per source in a
// dense, dark, Mangrove-branded layout: a cross-channel overview strip up top,
// then a two-column masonry of detail panels to keep scrolling short.
export default function App() {
  const [xData, setXData] = useState(null);
  const [error, setError] = useState(null);
  const [pypiData, setPypiData] = useState(null);
  const [ytData, setYtData] = useState(null);
  const [igData, setIgData] = useState(null);
  const [ttData, setTtData] = useState(null);
  const [liData, setLiData] = useState(null);

  useEffect(() => {
    fetch("/data/x_latest.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load data/x_latest.json (${res.status})`);
        return res.json();
      })
      .then(setXData)
      .catch((e) => setError(e.message));

    const soft = (url, set) =>
      fetch(url).then((r) => (r.ok ? r.json() : null)).then(set).catch(() => set(null));
    soft("/data/youtube_latest.json", setYtData);
    soft("/data/instagram_latest.json", setIgData);
    soft("/data/tiktok_latest.json", setTtData);
    soft("/data/linkedin_latest.json", setLiData);
    soft("/data/pypi_latest.json", setPypiData);
  }, []);

  const lastUpdated = xData?.last_updated || ytData?.last_updated || igData?.last_updated;

  // Compact cross-channel snapshot tiles.
  const delta = (h) => (h && h.length >= 2 ? h[h.length - 1].followers - h[0].followers : null);
  const tiles = [
    xData && { key: "x", label: "X", metric: fmt(xData.account?.followers_count), unit: "followers",
      sub: delta(xData.followers_history), accent: CHANNELS.x },
    ytData && { key: "youtube", label: "YouTube", metric: fmt(ytData.channel?.subscribers), unit: "subscribers",
      sub: ytData.summary?.net_subscribers, accent: CHANNELS.youtube },
    igData && { key: "instagram", label: "Instagram", metric: fmt(igData.account?.followers), unit: "followers",
      sub: null, accent: CHANNELS.instagram },
    ttData && { key: "tiktok", label: "TikTok", metric: fmt(ttData.account?.followers), unit: "followers",
      sub: null, accent: CHANNELS.tiktok },
    liData && { key: "linkedin", label: "LinkedIn", metric: fmt(liData.summary?.followers ?? liData.organization?.followers), unit: "followers",
      sub: liData.summary?.follower_growth, accent: CHANNELS.linkedin },
    pypiData && { key: "pypi", label: "PyPI", metric: fmt(pypiData.total), unit: "downloads",
      sub: null, accent: CHANNELS.pypi },
  ].filter(Boolean);

  // Two explicit, height-balanced columns (avoids CSS-column whitespace).
  // Left keeps the short PyPI card so the column bottoms line up.
  const wrap = (key, el) =>
    el ? (
      <div key={key} style={{ marginBottom: 16, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
        {el}
      </div>
    ) : null;
  const leftCol = [
    wrap("x", xData && <XPanel data={xData} />),
    wrap("ig", igData && <InstagramPanel data={igData} />),
    wrap("pypi", <PyPIPanel data={pypiData} />),
  ];
  const rightCol = [
    wrap("yt", ytData && <YouTubePanel data={ytData} />),
    wrap("tt", ttData && <TikTokPanel data={ttData} />),
    wrap("li", liData && <LinkedInPanel data={liData} />),
  ];

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", color: C.ink }}>
      {/* subtle brand gradient wash at the very top */}
      <div style={{ height: 3, background: "linear-gradient(90deg,#3FAAD8,#57C9C2,#F0A93B,#E8552F,#E8617E)" }} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 22px 40px" }}>
        {/* last updated — sits above the logo */}
        {lastUpdated && (
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 8, ...num }}>
            Last updated · {new Date(lastUpdated).toLocaleString()}
          </div>
        )}

        {/* header */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <Logo size={34} />
          <div style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 16 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3, color: C.ink }}>Social Intelligence</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>Cross-channel audience &amp; growth analytics</div>
          </div>
        </div>

        {/* cross-channel overview strip */}
        {tiles.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 10, marginBottom: 18 }}>
            {tiles.map((t) => (
              <div key={t.key} style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: `2px solid ${t.accent}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: t.accent, display: "inline-block" }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, letterSpacing: 0.3, textTransform: "uppercase" }}>{t.label}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: C.ink, ...num }}>{t.metric}</div>
                <div style={{ marginTop: 1, fontSize: 11, color: C.faint }}>
                  {t.unit}
                  {t.sub != null && (
                    <span style={{ color: t.sub >= 0 ? C.teal : C.coral, fontWeight: 700, marginLeft: 6, ...num }}>
                      {t.sub >= 0 ? "▲" : "▼"} {fmt(Math.abs(t.sub))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: "#FBEAE6", border: `1px solid ${C.coral}`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#8A3324" }}>
            Couldn't load X data: {error}. Run the pipeline (see README) or check that data/x_latest.json exists.
          </div>
        )}
        {!xData && !error && (
          <div style={{ color: C.sub, fontSize: 14, marginBottom: 20 }}>Loading analytics…</div>
        )}

        {/* two balanced columns of detail panels — cuts scroll roughly in half */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>{leftCol}</div>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>{rightCol}</div>
        </div>
      </div>
    </div>
  );
}
