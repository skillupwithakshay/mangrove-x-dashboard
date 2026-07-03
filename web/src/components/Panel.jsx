import { C } from "../lib/theme.js";

// Generic titled card wrapper. Shared across data-source panels.
export default function Panel({ title, icon: Icon, children, right }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={16} color={C.teal} strokeWidth={2.2} />}
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink }}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
