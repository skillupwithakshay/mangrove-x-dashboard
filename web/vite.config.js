import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite setup. Data is not imported statically — see
// scripts/copy-data.js and src/App.jsx for how ../data/x_latest.json gets
// served as /data/x_latest.json in both dev and the production build.
export default defineConfig({
  plugins: [react()],
});
