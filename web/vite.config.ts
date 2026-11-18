import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// emptyOutDir wipes dist/, including the tracked .gitkeep that lets the Go
// embed compile on a fresh clone; put it back after every build.
const keepGitkeep = {
  name: "keep-gitkeep",
  closeBundle() {
    writeFileSync(resolve(__dirname, "dist/.gitkeep"), "");
  },
};

// In dev, /api is proxied to the Go server (JITTERBUG_ADDR, default :8080).
export default defineConfig({
  plugins: [react(), keepGitkeep],
  server: {
    // ws: the live-update connection (/api/live) is a WebSocket.
    proxy: { "/api": { target: "http://localhost:8080", ws: true } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Libraries change far less often than Reskon's own code; in their
        // own file they stay cached across upgrades.
        // Chart and grid libraries only load with the screens that use them.
        manualChunks(id) {
          if (/node_modules\/(recharts|d3-|victory-vendor|react-grid-layout|react-resizable|react-draggable|lodash|recharts-scale|react-smooth|eventemitter3|decimal\.js|internmap|fast-equals|tiny-invariant)/.test(id)) return "charts";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
