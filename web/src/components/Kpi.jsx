import { C, num } from "../lib/theme.js";

// Generic KPI card. Shared across data-source panels (X today, Instagram
// later) so every panel's KPI row looks identical.
export default function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        flex: "1 1 150px",
        minWidth: 150,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent || C.teal }}>
        {Icon && <Icon size={16} strokeWidth={2.2} />}
        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, letterSpacing: 0.2 }}>
          {label}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 700, color: C.ink, ...num }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 2, fontSize: 12, color: C.faint, ...num }}>{sub}</div>
      )}
    </div>
  );
}
