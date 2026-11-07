import { test, expect } from "@playwright/test";

const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;

test.skip(!process.env.JB_E2E_URL, "set JB_E2E_URL to a test server");

test("health answers without signing in", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});

test("a protected call is refused without the session cookie", async ({ request }) => {
  const res = await request.get("/api/tasks");
  expect(res.status()).toBe(401);
});

test("a wrong password shows an error and stays on the sign-in page", async ({ page }) => {
  test.skip(!user, "set JB_E2E_USER");
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill("definitely-not-the-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("the right password reaches the board", async ({ page }) => {
  test.skip(!user || !pass, "set JB_E2E_USER and JB_E2E_PASS");
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
