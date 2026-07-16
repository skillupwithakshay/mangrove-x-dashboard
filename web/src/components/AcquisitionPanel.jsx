import { BarChart3, Filter, CreditCard, Globe } from "lucide-react";
import Panel from "./Panel.jsx";
import Kpi from "./Kpi.jsx";
import FunnelChart, { buildRevenueStages, buildCheckoutStages } from "./FunnelChart.jsx";
import { C, fmt, num } from "../lib/theme.js";

// PHASE 2 scaffold — Acquisition & cross-source funnel.
// Reads (when present) data/ga4.json and data/funnel.json; until those files
// exist, renders honest "pending instrumentation" states rather than fake data.
// The funnel is data-driven (see FunnelChart): each stage lights up the moment
// its owning source starts writing its file — no rebuild required.
//
// Expected (draft) contracts:
//   data/ga4.json   { updatedAt, activeUsers, newUsers, sessions,
//                     trafficBySource:[{source,users}], topPages:[{path,views}],
//                     keyEvents:[{name,count}] }
//   data/funnel.json { updatedAt, stages:[{key,label,source,value,status,reason}] }

function GA4Metrics({ ga4 }) {
  if (!ga4) {
    return (
      <div style={{ padding: "6px 0" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.goldSoft, border: `1px solid ${C.goldSoftBorder}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, padding: "10px 13px", color: C.goldInk, fontSize: 12.5 }}>
          GA4 integration pending — add a GA4 fetcher writing <code>data/ga4.json</code> to light this up.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, opacity: 0.55 }}>
          {["Active users", "New users", "Sessions", "Top traffic source", "Key events"].map((l) => (
            <div key={l} style={{ flex: "1 1 150px", minWidth: 150, background: C.bg2, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{l}</div>
              <div style={{ fontSize: 23, fontWeight: 800, color: C.faint, marginTop: 6, ...num }}>—</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const topSource = (ga4.trafficBySource || [])[0];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Kpi label="Active users" value={fmt(ga4.activeUsers)} accent={C.teal} />
        <Kpi label="New users" value={fmt(ga4.newUsers)} accent={C.sky} />
        <Kpi label="Sessions" value={fmt(ga4.sessions)} accent={C.gold} />
        {topSource && <Kpi label="Top source" value={topSource.source} sub={`${fmt(topSource.users)} users`} accent={C.pink} />}
      </div>
      {(ga4.topPages || []).length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>Top pages</div>
          {ga4.topPages.slice(0, 6).map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: `1px solid ${C.line}` }}>
              <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</span>
              <span style={{ color: C.sub, ...num }}>{fmt(p.views)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AcquisitionPanel({ discord, ga4, funnel }) {
  // Fully data-driven: data/funnel.json wins if present, else assembled from
  // whichever sources exist (shared with the Overview portal).
  const revenueStages = buildRevenueStages({ discord, ga4, funnel });
  const checkoutStages = buildCheckoutStages({ funnel });
  const liveCount = revenueStages.filter((x) => x.status === "live").length;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Acquisition &amp; funnel</h2>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
          Website traffic and the full community-to-revenue journey. {liveCount} of {revenueStages.length} funnel stages live;
          the rest light up as instrumentation connects.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Panel title="Website (GA4)" icon={Globe}>
          <GA4Metrics ga4={ga4} />
        </Panel>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Panel title="Community → Revenue funnel" icon={Filter}>
          <FunnelChart
            stages={revenueStages}
            note="Live stages come from connected sources; pending stages are greyed with the specific instrumentation they need. Each lights up automatically once its source starts writing data — no rebuild."
          />
        </Panel>
      </div>

      <div>
        <Panel title="Checkout funnel" icon={CreditCard}>
          <FunnelChart
            stages={checkoutStages}
            note="Ready for Stripe + front-end subscribe events. Populates once those sources are wired."
          />
        </Panel>
      </div>
    </div>
  );
}
