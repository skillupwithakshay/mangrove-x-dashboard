import { useEffect, useState } from "react";
import XPanel from "./components/XPanel.jsx";
import InstagramPanel from "./components/InstagramPanel.jsx";
import { C, FONT } from "./lib/theme.js";

// Top-level layout. Fetches data/x_latest.json at runtime (copied to
// public/data/ by scripts/copy-data.js — see that file for why fetch
// instead of a static import) and renders one panel per data source.
//
// Adding Instagram later (Phase 2): swap the InstagramPanel import for the
// real implementation once it reads data/instagram_latest.json, add a
// second fetch below, and pass it down the same way. Nothing else in this
// file or in Panel/Kpi needs to change.
export default function App() {
  const [xData, setXData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/data/x_latest.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load data/x_latest.json (${res.status})`);
        return res.json();
      })
      .then(setXData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", color: C.ink, padding: "24px 20px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>
            Mangrove AI · Analytics Dashboard
          </h1>
          {xData?.last_updated && (
            <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
              Last updated: {new Date(xData.last_updated).toLocaleString()}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: "#FBEAEA", border: "1px solid #E9C7C7", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#7A2E2E" }}>
            Couldn't load X data: {error}. Run the pipeline (see README) or check
            that data/x_latest.json exists.
          </div>
        )}

        {!xData && !error && (
          <div style={{ color: C.sub, fontSize: 14 }}>Loading…</div>
        )}

        {xData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <XPanel data={xData} />
            {/* Phase 2 extension point — see InstagramPanel.jsx */}
            <InstagramPanel />
          </div>
        )}
      </div>
    </div>
  );
}
