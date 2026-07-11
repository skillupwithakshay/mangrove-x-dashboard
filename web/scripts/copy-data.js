// Copies each data source's JSON from ../data into public/data so Vite serves
// them as static assets at /data/<name>.json — in dev (from public/) and in
// the production build (Vite copies public/ contents into dist/ on build).
//
// Why not a static `import`? A static import gets inlined into the JS bundle
// at build time, which would freeze the dashboard's data as of the last
// build. Runtime `fetch('/data/<name>.json')` (see src/App.jsx) means a fresh
// data file just needs this copy step (or a redeploy) to show up, without
// touching the app's source code.
//
// Runs automatically before `npm run dev` and `npm run build` (see
// package.json "predev"/"prebuild").
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "..", "..", "data");
const destDir = path.resolve(__dirname, "..", "public", "data");

mkdirSync(destDir, { recursive: true });

// Each source: `name` is the file served at /data/<name>.json. If the live
// file is missing it falls back to <name>.sample.json. `required` sources
// abort the build when neither exists; optional ones are skipped with a note.
const sources = [
  { name: "x_latest.json", required: true },
  { name: "youtube_latest.json", required: false },
  { name: "instagram_latest.json", required: false },
  { name: "tiktok_latest.json", required: false },
  { name: "linkedin_latest.json", required: false },
  { name: "pypi_latest.json", required: false },
];

for (const { name, required } of sources) {
  const live = path.join(dataDir, name);
  const sample = path.join(dataDir, name.replace(/\.json$/, ".sample.json"));
  const from = existsSync(live) ? live : existsSync(sample) ? sample : null;

  if (!from) {
    const msg = `No data file found at data/${name} or its .sample.json`;
    if (required) {
      console.error(msg + ".");
      process.exit(1);
    }
    console.warn(msg + " — skipping (optional).");
    continue;
  }

  copyFileSync(from, path.join(destDir, name));
  console.log(`Copied ${path.relative(process.cwd(), from)} -> public/data/${name}`);
}
