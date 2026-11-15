import { defineConfig } from "@playwright/test";

// Browser journeys. They need a running Reskon that is safe to write to:
// a disposable server and account, never live data. Set
//   JB_E2E_URL   e.g. http://192.168.0.8:8097   (the test server)
//   JB_E2E_USER / JB_E2E_PASS   an account made for testing
// Run: npx playwright install chromium && npm run test:e2e
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // One at a time: every journey signs in to the same test account, and with
  // live updates each one sees the others' changes (a layout switched to
  // Table in one tab switches the board in another).
  workers: 1,
  use: { baseURL: process.env.JB_E2E_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
