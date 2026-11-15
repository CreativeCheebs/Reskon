import { test, expect, type Page } from "@playwright/test";

// Live updates: a change made in one tab shows in another with no refresh.
// This journey makes one task and deletes it again, so run it only against
// a disposable test server.
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

test("a task made in another tab appears on the board without a refresh", async ({ browser }) => {
  const ctx = await browser.newContext();
  const watching = await ctx.newPage();
  const other = await ctx.newPage();
  await signIn(watching);
  await other.goto("/");
  await expect(other.getByRole("button", { name: "Sign out" })).toBeVisible();

  const title = `Live check ${Date.now()}`;
  await expect(watching.getByText(title)).toHaveCount(0);
  // Give the watching tab a moment to open its live connection.
  await watching.waitForTimeout(1000);

  const id = await other.evaluate(async (title) => {
    const boot = await (await fetch("/api/bootstrap")).json();
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, area_id: boot.areas[0].id }),
    });
    return (await res.json()).id as number;
  }, title);
  expect(id).toBeGreaterThan(0);

  try {
    // The row may sit in a part of the list that is scrolled out of view.
    await expect(watching.getByText(title).first()).toBeAttached({ timeout: 5000 });
  } finally {
    await other.evaluate(async (id) => {
      await fetch("/api/tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: [id] }),
      });
    }, id);
  }
  // The delete reaches the watching tab too.
  await expect(watching.getByText(title)).toHaveCount(0, { timeout: 5000 });
  await ctx.close();
});
