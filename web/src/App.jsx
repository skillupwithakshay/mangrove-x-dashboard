import { useState } from "react";
import { Grid3x3, Megaphone } from "lucide-react";
import SocialsPage from "./SocialsPage.jsx";
import InfluencerPage from "./InfluencerPage.jsx";
import snapshot from "./data/influencerSnapshot.json";

// Top-level page shell: a left vertical rail switches between two pages —
//   1. Socials    → the existing horizontal-tab dashboard, rendered unchanged.
//   2. Influencer Marketing Campaign → the new page.
// The rail owns page state; each page renders in the main workspace. No
// internal changes to any Socials panel.

const RAIL = "#0E2A20", ACCENT = "#1F7A54", MUTED = "#7FA893", DIM = "#5E8571", TXT = "#CFE3D8";

function RailItem({ label, sub, icon: Icon, active, onClick }) {
  return (
    <button onClick={onClick} className="imp-railbtn" role="tab" aria-selected={active}
      aria-current={active ? "page" : undefined}
      style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer",
        borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10,
        background: active ? ACCENT : "transparent", color: active ? "#fff" : TXT }}>
      <Icon size={16} style={{ marginTop: 1, flexShrink: 0, color: active ? "#fff" : MUTED }} />
      <span style={{ lineHeight: 1.25 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: active ? "rgba(255,255,255,0.75)" : DIM }}>{sub}</span>
      </span>
    </button>
  );
}

export default function App() {
  const [page, setPage] = useState("socials");
  const leadCount = snapshot?.leads?.length ?? 0;

  return (
    <div className="imp-shell" style={{ display: "flex", minHeight: "100vh", width: "100%", background: "#F5F7F5" }}>
      <style>{`
        @media (max-width: 760px) {
          .imp-shell { flex-direction: column; }
          .imp-rail { width: 100% !important; flex-direction: row !important; align-items: center; overflow-x: auto; }
          .imp-rail .imp-railfoot, .imp-rail .imp-raillabel { display: none; }
          .imp-rail nav { flex-direction: row !important; }
        }
        .imp-railbtn:focus-visible { outline: 2px solid #57C9C2; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
      `}</style>

      <aside className="imp-rail" style={{ width: 232, flexShrink: 0, background: RAIL, color: TXT, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>M</span>
            </div>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontWeight: 600, color: "#fff", fontSize: 15 }}>Mangrove</div>
              <div style={{ fontSize: 11, color: MUTED }}>Growth Dashboard</div>
            </div>
          </div>
        </div>
        <nav role="tablist" aria-label="Pages" style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="imp-raillabel" style={{ padding: "0 6px 6px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: DIM }}>Pages</div>
          <RailItem label="Socials" sub="X · IG · TikTok · YouTube · more" icon={Grid3x3} active={page === "socials"} onClick={() => setPage("socials")} />
          <RailItem label="Influencer Marketing Campaign" sub="Pipeline & performance" icon={Megaphone} active={page === "influencer"} onClick={() => setPage("influencer")} />
        </nav>
        <div className="imp-railfoot" style={{ marginTop: "auto", padding: "16px", fontSize: 11, color: DIM, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          Snapshot · {leadCount} leads<br />Live data pending campaign launch
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {page === "socials" ? <SocialsPage /> : <InfluencerPage />}
      </main>
    </div>
  );
}
