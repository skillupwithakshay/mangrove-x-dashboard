import { C } from "../lib/theme.js";

// Generic titled card wrapper. Shared across data-source panels. `accent`
// tints the icon so nested panels can echo their channel color.
export default function Panel({ title, icon: Icon, children, right, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={15} color={accent || C.teal} strokeWidth={2.2} />}
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: 0.1 }}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
