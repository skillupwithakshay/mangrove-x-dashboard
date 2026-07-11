import { C, num } from "../lib/theme.js";

// Generic KPI card. Shared across all data-source panels so every KPI looks
// identical. Dark surface with a subtle accent-tinted left edge for richness.
export default function Kpi({ icon: Icon, label, value, sub, accent }) {
  const a = accent || C.teal;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderLeft: `2px solid ${a}`,
        borderRadius: 12,
        padding: "12px 14px",
        flex: "1 1 130px",
        minWidth: 130,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: a }}>
        {Icon && <Icon size={14} strokeWidth={2.2} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {label}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 23, fontWeight: 800, color: C.ink, letterSpacing: -0.4, ...num }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 1, fontSize: 11.5, color: C.faint, ...num }}>{sub}</div>
      )}
    </div>
  );
}
