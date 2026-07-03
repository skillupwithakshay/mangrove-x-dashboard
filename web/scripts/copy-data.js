// Copies ../data/x_latest.json into public/data/x_latest.json so Vite serves
// it as a static asset at /data/x_latest.json — in dev (from public/) and in
// the production build (Vite copies public/ contents into dist/ on build).
//
// Why not a static `import`? A static import gets inlined into the JS bundle
// at build time, which would freeze the dashboard's data as of the last
// build. Runtime `fetch('/data/x_latest.json')` (see src/App.jsx) means a
// fresh data/x_latest.json just needs this copy step (or a redeploy) to show
// up, without touching the app's source code.
//
// Runs automatically before `npm run dev` and `npm run build` (see
// package.json "predev"/"prebuild").
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "..", "..", "data", "x_latest.json");
const fallback = path.resolve(__dirname, "..", "..", "data", "x_latest.sample.json");
const destDir = path.resolve(__dirname, "..", "public", "data");
const dest = path.join(destDir, "x_latest.json");

mkdirSync(destDir, { recursive: true });

const from = existsSync(src) ? src : fallback;
if (!existsSync(from)) {
  console.error("No data file found at data/x_latest.json or data/x_latest.sample.json.");
  process.exit(1);
}
copyFileSync(from, dest);
console.log(`Copied ${path.relative(process.cwd(), from)} -> ${path.relative(process.cwd(), dest)}`);
