import { Instagram } from "lucide-react";
import Panel from "./Panel.jsx";
import { C } from "../lib/theme.js";

// Phase 2 placeholder. When Instagram analytics are added, this component
// should follow the same contract as XPanel: accept a `data` prop shaped
// like data/instagram_latest.json (written by a future
// pipeline/fetch_instagram_data.py), and render its own KPI row + charts
// using the shared <Kpi> / <Panel> atoms so it visually matches XPanel
// without either component needing to change.
//
// App.jsx already renders this alongside <XPanel> — swap this stub for the
// real implementation and nothing else in the app needs to change.
export default function InstagramPanel() {
  return (
    <Panel title="Instagram Analytics" icon={Instagram}>
      <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
        Coming in Phase 2. This panel will read data/instagram_latest.json
        once the Instagram pipeline is built, using the same Kpi/Panel
        components as the X panel.
      </div>
    </Panel>
  );
}
