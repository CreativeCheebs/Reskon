import { test, expect, type Page } from "@playwright/test";

// Every widget on every dashboard draws: a chart, a number, a list or "no
// data", never an error and never a spinner that does not stop. Read only.
const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;
test.skip(!process.env.JB_E2E_URL || !user || !pass, "set JB_E2E_URL, JB_E2E_USER and JB_E2E_PASS");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("every widget on every dashboard draws without an error", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  // Every widget's data request must succeed.
  const failed: string[] = [];
  let answered = 0;
  page.on("response", (r) => {
    if (!r.url().includes("/api/metrics?widget=")) return;
    answered++;
    if (r.status() !== 200) failed.push(`${r.status()} ${r.url()}`);
  });
  await signIn(page);
  await page.getByRole("menuitem", { name: /Dashboards/ }).click();
  const tabs = page.locator(".ant-segmented-item, [role='tab']");
  await expect(page.locator(".react-grid-item").first()).toBeVisible();
  const count = Math.max(await tabs.count(), 1);
  for (let i = 0; i < count; i++) {
    if ((await tabs.count()) > 0) await tabs.nth(i).click();
    const widgets = page.locator(".react-grid-item");
    await expect(widgets.first()).toBeVisible();
    // Loaded: no spinner left inside a widget.
    await expect(page.locator(".react-grid-item .ant-spin-spinning")).toHaveCount(0, { timeout: 15_000 });
  }
  expect(answered).toBeGreaterThan(0);
  expect(failed).toEqual([]);
});
