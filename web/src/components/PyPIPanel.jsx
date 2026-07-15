import { Package, Download, Boxes } from "lucide-react";
import Kpi from "./Kpi.jsx";
import Panel from "./Panel.jsx";
import { C, fmt, num, LINKS } from "../lib/theme.js";

// Renders PyPI open-source download stats from the shape written by
// pipeline/fetch_pypi_data.py -> data/pypi_latest.json:
//   { last_updated, total, window, source, upstream_updated,
//     packages: [{name, downloads}, ...] }
//
// The number comes from the founder's WordPress endpoint (the same value shown
// on mangrove.ai). The title links to mangrove.ai; each package links to its
// real PyPI project page.
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
    data.source === "wordpress" ? "via mangrove.ai"
    : data.source === "pypistats" ? "via pypistats.org" : "";

  const title = (
    <a href={LINKS.pypi} target="_blank" rel="noreferrer"
       style={{ color: C.ink, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
      Open-source downloads (PyPI)
      <span style={{ fontSize: 12, color: C.faint }}>↗</span>
    </a>
  );

  return (
    <Panel
      title={title}
      icon={Package}
      right={<span style={{ fontSize: 12, color: C.faint, ...num }}>{sourceLabel}</span>}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <Kpi
          icon={Download}
          label={`Total downloads · ${windowLabel}`}
          value={fmt(data.total)}
          sub={`${packages.length} package${packages.length === 1 ? "" : "s"}`}
        />
        {packages.map((p) => (
          <a
            key={p.name}
            href={`https://pypi.org/project/${p.name}/`}
            target="_blank"
            rel="noreferrer"
            title={`View ${p.name} on PyPI`}
            style={{ textDecoration: "none", display: "flex", flex: "1 1 150px", minWidth: 150 }}
          >
            <Kpi icon={Boxes} label={p.name} value={fmt(p.downloads)} accent={C.gold} />
          </a>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
        Downloads over the last ~180 days (pypistats rolling window), summed across
        all packages, mirror traffic excluded — the same figure shown on mangrove.ai.
      </div>
    </Panel>
  );
}
