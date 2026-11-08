import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the Go server (JITTERBUG_ADDR, default :8080).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8080" },
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
