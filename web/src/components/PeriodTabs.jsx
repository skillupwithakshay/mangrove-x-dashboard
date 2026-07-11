import { C } from "../lib/theme.js";
import { PERIODS } from "../lib/period.js";

// Segmented 7D / 30D / 6M / 1Y control. Controlled component: pass `value`,
// `onChange`, and the channel `accent` for the active-tab color.
export default function PeriodTabs({ value, onChange, accent }) {
  const on = accent || C.teal;
  return (
    <div style={{ display: "inline-flex", gap: 3, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9, padding: 3 }}>
      {PERIODS.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
              padding: "4px 11px", borderRadius: 6, fontVariantNumeric: "tabular-nums",
              background: active ? on : "transparent", color: active ? "#fff" : C.sub,
            }}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
