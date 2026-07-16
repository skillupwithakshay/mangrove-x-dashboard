// Copies each data source's JSON from ../data into public/data so Vite serves
// them as static assets at /data/<name>.json — in dev (from public/) and in
// the production build (Vite copies public/ contents into dist/ on build).
//
// Why not a static `import`? A static import gets inlined into the JS bundle
// at build time, which would freeze the dashboard's data as of the last
// build. Runtime `fetch('/data/<name>.json')` (see src/App.jsx) means a fresh
// data file just needs this copy step (or a redeploy) to show up.
//
// It also writes public/data/_manifest.json recording, per source, whether the
// copied file was the LIVE pipeline output or a fabricated SAMPLE fallback, so
// the UI can label sample data honestly (never render mock data as real).
//
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "..", "data");
const destDir = path.resolve(__dirname, "..", "public", "data");

mkdirSync(destDir, { recursive: true });

const sources = [
  { name: "x_latest.json", required: true },
  { name: "youtube_latest.json", required: false },
  { name: "instagram_latest.json", required: false },
  { name: "tiktok_latest.json", required: false },
  { name: "linkedin_latest.json", required: false },
  { name: "pypi_latest.json", required: false },
  { name: "hubspot.json", required: false, noSample: true }, // real committed CRM data (fetch-hubspot.mjs)
  { name: "discord.json", required: false }, // falls back to discord.sample.json until fetch-discord.mjs runs
  { name: "snapshots.json", required: false, noSample: true }, // history store
];

const manifest = {}; // key (without _latest/.json) -> "live" | "sample" | "missing"

for (const { name, required, noSample } of sources) {
  const key = name.replace(/_latest\.json$/, "").replace(/\.json$/, "");
  const live = path.join(dataDir, name);
  const sample = path.join(dataDir, name.replace(/\.json$/, ".sample.json"));

  if (existsSync(live)) {
    copyFileSync(live, path.join(destDir, name));
    manifest[key] = "live";
    console.log(`Copied (live)   data/${name}`);
  } else if (!noSample && existsSync(sample)) {
    copyFileSync(sample, path.join(destDir, name));
    manifest[key] = "sample"; // fabricated placeholder — UI must label it
    console.warn(`Copied (SAMPLE) data/${name} — no live file; UI will flag as sample`);
  } else {
    manifest[key] = "missing";
    if (required) {
      console.error(`No data file found at data/${name} or its .sample.json.`);
      process.exit(1);
    }
    console.warn(`No data/${name} — skipping (optional).`);
  }
}

writeFileSync(path.join(destDir, "_manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Wrote public/data/_manifest.json:", manifest);
