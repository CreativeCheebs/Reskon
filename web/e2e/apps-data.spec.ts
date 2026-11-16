import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// App data widgets against the pretend habit tracker (cmd/example-plugin)
// beside the test server: its checklist and its series drawn by Reskon, a
// tick made in the app showing after Refresh, and with the app's feeds
// switched off, Reskon's kept copy with when it was fetched. Connects and
// removes the app, so run it only against a disposable server.
const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;
const plugin = process.env.JB_E2E_PLUGIN?.replace(/\/$/, "");
test.skip(!process.env.JB_E2E_URL || !user || !pass || !plugin, "set JB_E2E_URL, JB_E2E_USER, JB_E2E_PASS and JB_E2E_PLUGIN");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** The pretend app's own test calls, with its token (as a person would tick
 *  a habit in the app itself, and as the app going down). */
async function pluginCalls(request: APIRequestContext) {
  const login = await request.post(`${plugin}/api/reskon/login`, { data: { username: "aakash", password: "habits-123" } });
  expect(login.status()).toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  return {
    tick: async (key: string, done: boolean) => expect((await request.post(`${plugin}/api/test/tick/${key}`, { headers, data: { done } })).status()).toBe(200),
    feeds: async (on: boolean) => expect((await request.post(`${plugin}/api/test/feeds`, { headers, data: { on } })).status()).toBe(200),
  };
}

/** Picks an option in an open Ant Design select. */
async function choose(page: Page, label: string, option: string) {
  // The whole select, not its input: a chosen value lies over the input.
  await page.getByRole("dialog").locator(".ant-select", { has: page.getByLabel(label, { exact: true }) }).click({ timeout: 10_000 });
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: new RegExp(`^${option}$`) }).click({ timeout: 10_000 });
}

test("an app's data shows in Reskon's charts, and its kept copy when the app is down", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const app = await pluginCalls(page.request);
  await app.feeds(true);
  await app.tick("walk", false);
  await signIn(page);
  // Left over from an earlier run that stopped half way.
  const old = (await (await page.request.get("/api/dashboards")).json()) as { id: number; name: string }[];
  for (const d of old.filter((d) => d.name === "E2E app data")) await page.request.delete(`/api/dashboards/${d.id}`);
  // Only Habits is removed (from an earlier run); other apps are left alone.
  const removeHabits = async () => {
    const connected = (await (await page.request.get("/api/apps")).json()) as { id: number; app_id: string }[];
    for (const a of connected.filter((a) => a.app_id === "habits")) await page.request.delete(`/api/apps/${a.id}`);
  };
  await removeHabits();

  try {
    await page.goto("/#/settings/apps");
    await page.getByLabel("App address").fill(plugin!);
    await page.getByLabel("App address").press("Enter");
    await page.getByLabel("Habits username").fill("aakash");
    await page.getByLabel("Habits password").fill("habits-123");
    await page.getByRole("button", { name: "Connect Habits" }).click();
    await expect(page.getByText("Reachable", { exact: true })).toBeVisible();

    await page.getByRole("menuitem", { name: /Dashboards/ }).click();
    await page.getByRole("button", { name: /^(edit )?Edit$/ }).click();
    await page.getByRole("button", { name: "New dashboard" }).click();
    const name = page.locator("input:focus");
    await name.fill("E2E app data");
    await name.press("Enter");
    await expect(page.locator(".ant-segmented-item-selected", { hasText: "E2E app data" })).toBeVisible();

    // Add widget › App data › Today: a checklist, previewed before saving.
    const dialog = page.getByRole("dialog");
    const addData = async (data: string, viz: string) => {
      await page.getByRole("button", { name: "Add widget" }).first().click();
      await dialog.getByText("App data", { exact: true }).click();
      await expect(dialog.getByText("Habits", { exact: true })).toBeVisible();
      await choose(page, "Data", data);
      await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(data);
      await expect(dialog.getByRole("combobox", { name: "Show as" })).toBeVisible();
      if (viz) await expect(dialog.locator(".ant-select-selection-item", { hasText: viz })).toBeVisible();
      await expect(dialog.getByText(/^fetched /)).toBeVisible();
      const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/widgets");
      await dialog.getByRole("button", { name: "Save" }).click();
      expect((await saved).status()).toBe(200);
      await expect(dialog).toHaveCount(0);
    };
    await addData("Today", "Checklist");
    // Done per day as bars over 7 days (the defaults for a series).
    await addData("Done per day", "Bars");
    // A table and a number, each in the app's own units.
    await addData("Streaks", "Table");
    await addData("Longest streak", "Number");

    // Editing a saved one: Done per day becomes a line over 30 days.
    const bars = page.locator(".react-grid-item").filter({ hasText: "Done per day" });
    await bars.getByRole("button", { name: "Edit widget" }).click();
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Done per day");
    await choose(page, "Show as", "Line");
    // Yesterday is offered for an app's data too, and the live preview asks the app for exactly that day; then the 30 days this journey wants.
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    const previewed = page.waitForResponse(async (r) => {
      if (new URL(r.url()).pathname !== "/api/apps/data/preview") return false;
      const b = await r.json().catch(() => ({}));
      return b.from === yesterday && b.to === yesterday;
    });
    await choose(page, "Range", "Yesterday");
    await previewed;
    await choose(page, "Range", "30 days");
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const redrawn = page.waitForResponse(async (r) => new URL(r.url()).pathname === "/api/apps/data" && (await r.json()).from === from);
    await dialog.getByRole("button", { name: "Save" }).click();
    await redrawn;
    await expect(bars.locator(".recharts-line-curve")).toBeVisible();
    await page.getByRole("button", { name: /^(check )?Done$/ }).click();

    const streaks = page.locator(".react-grid-item").filter({ hasText: "Streaks" });
    await expect(streaks.getByRole("columnheader", { name: "Longest (days)" })).toBeVisible();
    await expect(streaks.getByRole("cell", { name: "Meditate" })).toBeVisible();
    const longest = page.locator(".react-grid-item").filter({ hasText: "Longest streak" });
    await expect(longest.getByText(/^\d+ days$/)).toBeVisible();

    const today = page.locator(".react-grid-item").filter({ has: page.getByRole("list", { name: "Today" }) });
    const walk = today.getByRole("listitem").filter({ hasText: "Walk" });
    await expect(walk).toContainText("Walk: not done");
    await expect(today.getByRole("listitem")).toHaveCount(3);
    await expect(today.getByText(/^fetched /)).toBeVisible();
    // Nothing in Reskon's checklist can be ticked.
    await expect(today.getByRole("checkbox")).toHaveCount(0);

    // A tick made in the app shows after Refresh.
    await app.tick("walk", true);
    await today.getByRole("button", { name: "Refresh widget" }).click();
    await expect(walk).toContainText("Walk: done");

    // The app's feeds go down: Refresh shows the kept copy, with its time and why.
    await app.feeds(false);
    await app.tick("walk", false);
    await today.getByRole("button", { name: "Refresh widget" }).click();
    await expect(today.getByRole("status")).toContainText(/Showing the copy from .+: Habits answered HTTP 503/);
    await expect(walk).toContainText("Walk: done");
    await expect(page.locator("body")).not.toContainText("secret detail");

    // Back up: fresh again, the note gone.
    await app.feeds(true);
    await today.getByRole("button", { name: "Refresh widget" }).click();
    await expect(walk).toContainText("Walk: not done");
    await expect(today.getByRole("status")).toHaveCount(0);
  } finally {
    // However the journey ended: the app's feeds on, its dashboard and the app gone.
    await app.feeds(true);
    await app.tick("walk", false);
    const dashboards = (await (await page.request.get("/api/dashboards")).json()) as { id: number; name: string }[];
    for (const d of dashboards.filter((d) => d.name === "E2E app data")) await page.request.delete(`/api/dashboards/${d.id}`);
    await removeHabits();
  }
});
