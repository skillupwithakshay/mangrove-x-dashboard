import { C, fmt, num } from "../lib/theme.js";

// Data-driven funnel. Each stage is owned by a source; a stage renders "live"
// (filled, with a value) or "pending" (greyed + dashed, with a labeled reason).
// Adding a source later just means passing a live stage — no rebuild needed.
//
// stages: [{ key, label, source, value:number|null, status:"live"|"pending", reason? }]
// SOURCES defines each source's brand color + display label.

export const SOURCES = {
  discord: { label: "Discord", color: "#5865F2" },
  links:   { label: "Links / UTM", color: C.gold },
  ga4:     { label: "GA4", color: "#E8552F" },
  product: { label: "Product", color: C.teal },
  stripe:  { label: "Stripe", color: "#635BFF" },
};

const stage = (key, label, source, value, reason) => {
  const live = typeof value === "number" && isFinite(value);
  return { key, label, source, value: live ? value : null, status: live ? "live" : "pending", reason };
};

// Community -> Revenue funnel stages, assembled from whichever sources exist.
// If data/funnel.json is present its stages win (fully data-driven). Shared by
// AcquisitionPanel and the Overview portal so the two never drift.
export function buildRevenueStages({ discord, ga4, funnel } = {}) {
  // Prefer data/funnel.json only once it actually carries a live stage; an
  // all-pending funnel.json (written by CI before any real source connects)
  // shouldn't override the sample-derived preview and contradict the cards.
  if (funnel?.stages?.some((s) => s.status === "live")) return funnel.stages;
  return [
    stage("joined", "Discord joined", "discord", discord?.server?.memberTotal, "awaiting Discord data"),
    stage("active", "Active in community", "discord", discord?.engagement?.activeMembers30d, "awaiting Discord data"),
    stage("clicked", "Clicked through", "links", null, "awaiting UTM tagging"),
    stage("visited", "Website visit", "ga4", ga4?.activeUsers, "awaiting GA4 integration"),
    stage("signup", "Signed up", "product", null, "awaiting product event tracking"),
    stage("activated", "Activated", "product", null, "awaiting product event tracking"),
    stage("paid", "Paid", "stripe", null, "awaiting Stripe integration"),
  ];
}

export function buildCheckoutStages({ funnel } = {}) {
  if (funnel?.checkoutStages) return funnel.checkoutStages;
  return [
    stage("clicked_sub", "Clicked subscribe", "product", null, "awaiting front-end events"),
    stage("reached_pay", "Reached payment", "stripe", null, "awaiting Stripe integration"),
    stage("paid", "Paid", "stripe", null, "awaiting Stripe integration"),
  ];
}

export default function FunnelChart({ stages = [], note }) {
  const liveVals = stages.filter((s) => s.status === "live" && typeof s.value === "number").map((s) => s.value);
  const maxLive = Math.max(1, ...liveVals);
  const usedSources = [...new Set(stages.map((s) => s.source))].filter((k) => SOURCES[k]);
  let prevLive = null;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stages.map((s, i) => {
          const src = SOURCES[s.source] || { label: s.source, color: C.faint };
          const live = s.status === "live" && typeof s.value === "number";
          const w = live ? Math.max(14, (s.value / maxLive) * 100) : 100;
          const conv = live && prevLive != null && prevLive > 0 ? (s.value / prevLive) * 100 : null;
          if (live) prevLive = s.value;
          return (
            <div key={s.key || i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 150, flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, color: live ? C.ink : C.faint, fontWeight: 600 }}>{s.label}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: src.color, opacity: live ? 1 : 0.5 }} />
                  <span style={{ fontSize: 10.5, color: C.faint }}>{src.label}</span>
                </div>
              </div>
              <div style={{ flex: 1, height: 38, display: "flex", alignItems: "center" }}>
                <div style={{
                  width: `${w}%`, height: "100%", borderRadius: 8, display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "0 12px",
                  background: live ? src.color : "repeating-linear-gradient(45deg," + C.bg2 + "," + C.bg2 + " 8px," + C.line + " 8px," + C.line + " 16px)",
                  border: live ? "none" : `1px dashed ${C.line}`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: live ? "#fff" : C.faint, ...num }}>
                    {live ? fmt(s.value) : "—"}
                  </span>
                  {live
                    ? (conv != null && <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.85)", ...num }}>{conv.toFixed(0)}%</span>)
                    : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{s.reason || "pending"}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 12 }}>
        {usedSources.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.sub }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: SOURCES[k].color }} /> {SOURCES[k].label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.faint }}>
          <span style={{ width: 14, height: 9, borderRadius: 2, border: `1px dashed ${C.line}`, background: C.bg2 }} /> pending instrumentation
        </span>
      </div>

      {note && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10 }}>{note}</div>}
    </div>
  );
}
