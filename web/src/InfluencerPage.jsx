import { useState, useMemo } from "react";
import {
  Users, Radio, CheckCircle2, MessageCircle, Send, XCircle, ExternalLink, Search,
  ChevronDown, ChevronRight, Youtube, Instagram, Twitter, Linkedin, Hash,
} from "lucide-react";
import DATA from "./data/influencerSnapshot.json";

// Influencer Marketing Campaign page — ported from the design reference and
// adapted to the repo's inline-style convention (the app has no Tailwind).
// Reads the committed snapshot in ./data/influencerSnapshot.json (112 creators).
// Performance metrics stay "Pending live data" until a campaign is connected.

// TEMPORARY link — will be swapped/removed later; keep it a one-line change.
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/16CIuIMasDczoMRF74lKGYNR33Ndwd08HGPrDhG0TU5E/edit?gid=1744373386#gid=1744373386";

// NOTE: stages are heuristically parsed from the sheet's free-text Status column
// (flagged for cleanup in the brief — not "corrected" here).
const STAGE_META = {
  "Confirmed":     { c: "#1F7A54", bg: "#E6F2EC", icon: CheckCircle2 },
  "In convo":      { c: "#B7791F", bg: "#FBF1DD", icon: MessageCircle },
  "Outreach sent": { c: "#3B6EA5", bg: "#E7EEF6", icon: Send },
  "Hold/Pass":     { c: "#8A968E", bg: "#EEF1EF", icon: XCircle },
  "No status":     { c: "#8A968E", bg: "#EEF1EF", icon: XCircle },
  "Other":         { c: "#8A968E", bg: "#EEF1EF", icon: XCircle },
};
const STAGE_ORDER = ["Outreach sent", "In convo", "Confirmed", "Hold/Pass"];
const PLAT_ICON = { YouTube: Youtube, Instagram: Instagram, X: Twitter, LinkedIn: Linkedin, TikTok: Hash };

const PERF_GROUPS = [
  { title: "Attribution & Tracking", keys: ["Tracking Link (UTM)", "Promo Code"] },
  { title: "Performance Analytics", keys: ["Reach", "Impressions", "Views", "Engagement", "ER (%)", "Link Clicks", "Conversions"] },
  { title: "Investment & Efficiency", keys: ["CPM ($)", "CPE ($)", "EMV ($)", "Cost Per Conversion ($)"] },
];

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
  return String(n);
}
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(2) + "%");

const CO = { ink: "#15211B", sub: "#64756B", muted: "#8A968E", faint: "#98A69D", border: "#E4E9E5", track: "#EEF1EF", accent: "#1F7A54", accentSoft: "#E6F2EC", card: "#fff", hover: "#FAFBFA", head: "#FAFBFA" };
const num = { fontVariantNumeric: "tabular-nums" };
const GRID = "1.6fr 0.9fr 0.7fr 0.8fr 0.7fr 28px";

function MetricCard({ icon: Icon, label, value, tint }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${CO.border}`, background: CO.card, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: tint + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} style={{ color: tint }} />
        </div>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: CO.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.3, ...num }}>{value}</div>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${CO.border}`, background: CO.card, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: CO.ink }}>{title}</h3>
        {note && <span style={{ fontSize: 11, color: CO.faint }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <select className="imp-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      style={{ fontSize: 13, borderRadius: 8, border: `1px solid ${CO.border}`, background: "#fff", padding: "8px 10px", color: CO.ink, cursor: "pointer" }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function StageTag({ stage }) {
  const m = STAGE_META[stage] || STAGE_META["Other"];
  const Icon = m.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 9999, padding: "2px 8px", fontSize: 11, fontWeight: 500, background: m.bg, color: m.c }}>
      <Icon size={11} /> {stage}
    </span>
  );
}

function KV({ k, v, mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: CO.faint }}>{k}</span>
      <span style={{ fontSize: 12, color: CO.ink, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit" }}>{v}</span>
    </div>
  );
}

function RosterRow({ l, open, onToggle }) {
  const PIcon = PLAT_ICON[l.platform] || Hash;
  return (
    <div style={{ borderBottom: `1px solid ${CO.track}` }}>
      <button className="imp-rosterrow" onClick={onToggle} aria-expanded={open}
        style={{ width: "100%", minWidth: 620, display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "12px 16px", alignItems: "center", textAlign: "left", border: "none", background: "transparent", cursor: "pointer" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: CO.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
          <div style={{ fontSize: 11, color: CO.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.category || l.tags || "—"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: CO.sub }}><PIcon size={13} /> {l.platform || "—"}</div>
        <div style={{ fontSize: 12, color: CO.sub }}>{l.tier || "—"}</div>
        <div style={{ fontSize: 13, fontWeight: 500, ...num }}>{fmt(l.totalReach)}</div>
        <div><StageTag stage={l.stage} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", color: CO.faint }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {open && (
        <div style={{ padding: "4px 16px 20px", background: CO.hover }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, color: CO.muted }}>Audience &amp; fit (known now)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                <KV k="Engagement rate" v={pct(l.er)} />
                <KV k="Avg views" v={fmt(l.avgViews)} />
                <KV k="Phase" v={l.phase || "—"} />
                <KV k="Email" v={l.email || "—"} mono />
              </div>
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(l.followers || {}).filter(([, v]) => v).map(([p, v]) => (
                  <span key={p} style={{ borderRadius: 6, padding: "2px 8px", fontSize: 11, background: CO.accentSoft, color: CO.accent }}>
                    {p.toUpperCase()} {fmt(v)}
                  </span>
                ))}
              </div>
            </div>
            {l.notes && (
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, color: CO.muted }}>Notes</div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#4A5852" }}>{l.notes}</p>
              </div>
            )}
          </div>

          <div style={{ borderRadius: 8, border: `1px solid ${CO.border}`, background: "#fff", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: CO.ink }}>Campaign performance</div>
              <span style={{ borderRadius: 9999, padding: "2px 8px", fontSize: 10, fontWeight: 500, background: "#FBF1DD", color: "#B7791F" }}>Pending live data</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {PERF_GROUPS.map((g) => (
                <div key={g.title}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, color: CO.accent }}>{g.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {g.keys.map((k) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: CO.sub }}>{k}</span>
                        <span style={{ color: "#B8C2BB", ...num }}>—</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InfluencerPage() {
  const [tier, setTier] = useState("All");
  const [plat, setPlat] = useState("All");
  const [stage, setStage] = useState("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const leads = DATA.leads;

  const stats = useMemo(() => {
    const reach = leads.reduce((s, l) => s + (l.totalReach || 0), 0);
    const byStage = {}; STAGE_ORDER.forEach((s) => (byStage[s] = 0));
    leads.forEach((l) => { byStage[l.stage] = (byStage[l.stage] || 0) + 1; });
    const byTier = {}; leads.forEach((l) => { const t = l.tier || "Untiered"; byTier[t] = (byTier[t] || 0) + 1; });
    const byPlat = {}; leads.forEach((l) => { const p = l.platform || "Unassigned"; byPlat[p] = (byPlat[p] || 0) + 1; });
    return { reach, byStage, byTier, byPlat };
  }, [leads]);

  const tiers = ["All", ...Object.keys(stats.byTier)];
  const plats = ["All", ...Object.keys(stats.byPlat).filter((p) => p !== "Unassigned")];

  const rows = useMemo(() => leads.filter((l) => {
    if (tier !== "All" && (l.tier || "Untiered") !== tier) return false;
    if (plat !== "All" && l.platform !== plat) return false;
    if (stage !== "All" && l.stage !== stage) return false;
    if (q && !(`${l.name} ${l.category || ""} ${l.tags || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => (b.totalReach || 0) - (a.totalReach || 0)), [leads, tier, plat, stage, q]);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1180, color: CO.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        .imp-rosterrow:hover { background: ${CO.hover}; }
        .imp-link:hover { transform: translateY(-1px); }
        .imp-input:focus-visible, .imp-select:focus-visible, .imp-link:focus-visible { outline: 2px solid #57C9C2; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .imp-link { transition: none !important; } }
      `}</style>

      {/* header + link */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 4, color: CO.accent }}>Influencer Marketing Campaign</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: -0.4 }}>Creator pipeline &amp; performance</h1>
          <p style={{ fontSize: 13, marginTop: 4, color: CO.sub }}>
            {leads.length} creators sourced · {fmt(stats.reach)} combined addressable reach · performance fills in as campaigns go live.
          </p>
        </div>
        <a className="imp-link" href={SHEET_URL} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 500, color: "#fff", background: CO.accent, textDecoration: "none", boxShadow: "0 1px 2px rgba(0,0,0,0.06)", transition: "transform 0.12s ease" }}>
          <ExternalLink size={15} /> Open Kimberly's full list
        </a>
      </div>

      {/* metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard icon={Users} label="Creators sourced" value={leads.length} tint="#1F7A54" />
        <MetricCard icon={Radio} label="Addressable reach" value={fmt(stats.reach)} tint="#3B6EA5" />
        <MetricCard icon={CheckCircle2} label="Confirmed" value={stats.byStage["Confirmed"] || 0} tint="#1F7A54" />
        <MetricCard icon={Send} label="Outreach sent" value={stats.byStage["Outreach sent"] || 0} tint="#B7791F" />
      </div>

      {/* pipeline + tier mix */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 28 }}>
        <Panel title="Outreach pipeline" note="Parsed from the sheet's Status column">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            {STAGE_ORDER.map((s) => {
              const v = stats.byStage[s] || 0;
              const max = Math.max(...STAGE_ORDER.map((x) => stats.byStage[x] || 0), 1);
              const m = STAGE_META[s];
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 96, fontSize: 12, flexShrink: 0, color: CO.sub }}>{s}</div>
                  <div style={{ flex: 1, height: 24, borderRadius: 6, overflow: "hidden", background: CO.track }}>
                    <div style={{ height: "100%", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, fontSize: 11, fontWeight: 500, color: "#fff", width: `${Math.max((v / max) * 100, 8)}%`, background: m.c }}>{v}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Tier mix" note="Where the roster concentrates">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
            {Object.entries(stats.byTier).sort((a, b) => b[1] - a[1]).map(([t, v]) => {
              const max = Math.max(...Object.values(stats.byTier), 1);
              return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 80, fontSize: 12, flexShrink: 0, color: CO.sub }}>{t}</div>
                  <div style={{ flex: 1, height: 10, borderRadius: 9999, overflow: "hidden", background: CO.track }}>
                    <div style={{ height: "100%", borderRadius: 9999, width: `${(v / max) * 100}%`, background: CO.accent }} />
                  </div>
                  <div style={{ width: 28, textAlign: "right", fontSize: 12, ...num }}>{v}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* filters */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#98A69D" }} />
          <input className="imp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators…" aria-label="Search creators"
            style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 13, borderRadius: 8, border: `1px solid ${CO.border}`, background: "#fff", outline: "none", width: 200 }} />
        </div>
        <Select value={tier} onChange={setTier} options={tiers} label="Filter by tier" />
        <Select value={plat} onChange={setPlat} options={plats} label="Filter by platform" />
        <Select value={stage} onChange={setStage} options={["All", ...STAGE_ORDER]} label="Filter by stage" />
        <div style={{ marginLeft: "auto", fontSize: 12, color: CO.sub }}>{rows.length} shown</div>
      </div>

      {/* roster */}
      <div style={{ borderRadius: 12, border: `1px solid ${CO.border}`, background: "#fff", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 620, display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: CO.muted, borderBottom: `1px solid ${CO.border}`, background: CO.head }}>
            <div>Creator</div><div>Platform</div><div>Tier</div><div>Reach</div><div>Stage</div><div />
          </div>
          {rows.map((l) => (
            <RosterRow key={l.name} l={l} open={open === l.name} onToggle={() => setOpen(open === l.name ? null : l.name)} />
          ))}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 13, color: CO.muted }}>
            No creators match these filters. Clear one to widen the list.
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, marginTop: 16, color: CO.faint }}>
        Snapshot from Kimberly's workbook · performance metrics show as Pending until live campaign data is connected.
        EMV needs a defined formula from Kimberly before it can populate. Stage counts are parsed heuristically from a free-text Status column.
      </p>
    </div>
  );
}
