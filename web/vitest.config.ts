import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component tests run in jsdom (no browser, no server). Browser journeys
// live in e2e/ and run with Playwright against a test server instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
