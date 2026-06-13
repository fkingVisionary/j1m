import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Alias the workspace packages to their TS source so Vite/esbuild transpiles them as
// project source (HMR + no prebuild step). Browser-safe packages only — cachekey/proxy
// (node:crypto, node:sqlite) are never imported here.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@j1m/cv": r("../../packages/cv/src/index.ts"),
      "@j1m/relief": r("../../packages/relief/src/index.ts"),
      "@j1m/scoring": r("../../packages/scoring/src/index.ts"),
      "@j1m/prompts": r("../../packages/prompts/src/index.ts"),
      "@j1m/pipeline": r("../../packages/pipeline/src/index.ts"),
      "@j1m/imaging": r("../../packages/imaging/src/index.ts"),
    },
  },
});
