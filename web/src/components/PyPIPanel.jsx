import { Package, Download, Boxes } from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import { C, fmt, num } from "../lib/theme.js";

// Renders PyPI open-source download stats from the shape written by
// pipeline/fetch_pypi_data.py -> data/pypi_latest.json:
//   { last_updated, total, window, source, upstream_updated,
//     packages: [{name, downloads}, ...] }
//
// The number comes from the founder's WordPress endpoint (the same value
// shown on mangrove.ai), so the dashboard total always matches the website.
// The `window` field ("rolling ~180 days") keeps the label honest, since
// pypistats' overall data isn't lifetime.
export default function PyPIPanel({ data }) {
  if (!data) {
    return (
      <Panel title="Open-source downloads (PyPI)" icon={Package}>
        <div style={{ color: C.faint, fontSize: 13, padding: "8px 0" }}>
          No PyPI data yet. Run pipeline/fetch_pypi_data.py (see README).
        </div>
      </Panel>
    );
  }

  const packages = data.packages || [];
  const windowLabel = data.window || "rolling ~180 days";
  const sourceLabel =
    data.source === "wordpress"
      ? "via mangrove.ai"
      : data.source === "pypistats"
      ? "via pypistats.org"
      : "";

  return (
    <Panel
      title="Open-source downloads (PyPI)"
      icon={Package}
      right={
        <span style={{ fontSize: 12, color: C.faint, ...num }}>
          {sourceLabel}
        </span>
      }
    >
      {/* KPI row: total + each package */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <Kpi
          icon={Download}
          label={`Total downloads · ${windowLabel}`}
          value={fmt(data.total)}
          sub={`${packages.length} package${packages.length === 1 ? "" : "s"}`}
        />
        {packages.map((p) => (
          <Kpi
            key={p.name}
            icon={Boxes}
            label={p.name}
            value={fmt(p.downloads)}
            accent={C.gold}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
        Downloads over the last ~180 days (pypistats rolling window), summed
        across all packages, mirror traffic excluded — the same figure shown on
        mangrove.ai.
      </div>
    </Panel>
  );
}
