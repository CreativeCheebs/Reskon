import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// "My data changed" from the pretend habit tracker (cmd/example-plugin):
// a habit ticked inside the app's page widget updates the app's checklist
// data widget beside it, and in a second tab, with no Refresh; a tick made
// elsewhere (the app's own test call, which then calls Reskon's hook with
// the key it was given at connect time) updates both tabs too. The app's
// page is never reloaded by any of it. Connects and removes the app, so run
// it only against a disposable server.
const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;
const plugin = process.env.JB_E2E_PLUGIN?.replace(/\/$/, "");
test.skip(!process.env.JB_E2E_URL || !user || !pass || !plugin, "set JB_E2E_URL, JB_E2E_USER, JB_E2E_PASS and JB_E2E_PLUGIN");

const BOARD = "E2E live apps";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** A tick made in the app itself, not in Reskon (with the app's token). */
async function tickElsewhere(request: APIRequestContext, key: string, done: boolean) {
  const login = await request.post(`${plugin}/api/reskon/login`, { data: { username: "aakash", password: "habits-123" } });
  expect(login.status()).toBe(200);
  const { token } = (await login.json()) as { token: string };
  const res = await request.post(`${plugin}/api/test/tick/${key}`, { headers: { Authorization: `Bearer ${token}` }, data: { done } });
  expect(res.status()).toBe(200);
}

async function openBoard(page: Page) {
  await page.getByRole("menuitem", { name: /Dashboards/ }).click();
  await page.locator(".ant-segmented-item", { hasText: BOARD }).click();
  await expect(page.locator(".ant-segmented-item-selected", { hasText: BOARD })).toBeVisible();
}

/** Counts requests that a live update from an app must not cause: a page
 *  launch (the app's page reloaded), or a full reload of the tab's data. */
function countReloads(page: Page) {
  const seen = { launch: 0, bootstrap: 0, dashboards: 0 };
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path === "/api/apps/launch") seen.launch++;
    if (path === "/api/bootstrap") seen.bootstrap++;
    if (path === "/api/dashboards") seen.dashboards++;
  });
  return seen;
}

test("a tick in the app's page, or made elsewhere, updates its data widgets live in every tab", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await signIn(page);
  const cleanUp = async () => {
    const dashboards = (await (await page.request.get("/api/dashboards")).json()) as { id: number; name: string }[];
    for (const d of dashboards.filter((d) => d.name === BOARD)) await page.request.delete(`/api/dashboards/${d.id}`);
    const connected = (await (await page.request.get("/api/apps")).json()) as { id: number; app_id: string }[];
    for (const a of connected.filter((a) => a.app_id === "habits")) await page.request.delete(`/api/apps/${a.id}`);
  };
  await cleanUp(); // left over from an earlier run that stopped half way
  let was: boolean | null = null;
  let second: Page | null = null;

  try {
    // Connected fresh, so the app gets a new key for Reskon's address as
    // this browser reaches it (the app forgets it when restarted).
    const connected = await page.request.post("/api/apps", { data: { address: plugin, username: "aakash", password: "habits-123" } });
    expect(connected.status()).toBe(200);
    const app = (await connected.json()) as { changes: string; changes_detail: string };
    expect(app.changes, app.changes_detail).toBe("ok");
    expect(JSON.stringify(app)).not.toMatch(/"key"/);

    // A dashboard with the app's page and its Today checklist side by side.
    const dash = (await (await page.request.post("/api/dashboards", { data: { name: BOARD } })).json()) as { id: number };
    for (const w of [
      { source: "app_page", viz: "page", title: "Today's habits", query: { app: "habits", widget: "today" }, x: 0, y: 0, w: 4, h: 5 },
      { source: "app_data", viz: "checklist", title: "Today", query: { app: "habits", widget: "today_list" }, x: 4, y: 0, w: 4, h: 5 },
    ]) {
      const res = await page.request.post("/api/widgets", { data: { dashboard_id: dash.id, ...w } });
      expect(res.status(), await res.text()).toBe(200);
    }

    await page.reload();
    await openBoard(page);
    const other = await context.newPage();
    second = other;
    await other.setViewportSize({ width: 1600, height: 1000 });
    await other.goto("/");
    await openBoard(other);

    const checklist = (p: Page) => p.locator(".react-grid-item").filter({ has: p.getByRole("list", { name: "Today" }) }).getByRole("listitem").filter({ hasText: "Walk" });
    const frame = page.frameLocator('iframe[title="Today\'s habits"]');
    const walkBox = frame.getByRole("checkbox", { name: "Walk" });
    await expect(walkBox).toBeVisible();
    await expect(walkBox).toBeEnabled();
    // The other tab's page widget has finished launching too, so the counts
    // below see only what the live updates cause.
    await expect(other.frameLocator('iframe[title="Today\'s habits"]').getByRole("checkbox", { name: "Walk" })).toBeVisible();
    await expect(checklist(other)).toContainText(/Walk: (not )?done/);
    // Ticks stay in the pretend app between runs: flip, check, flip back.
    was = await walkBox.isChecked();
    const state = (done: boolean) => (done ? "Walk: done" : "Walk: not done");
    await expect(checklist(page)).toContainText(state(was));
    await expect(checklist(other)).toContainText(state(was));
    const reloads = [countReloads(page), countReloads(other)];

    // Ticked inside the app's page: the checklist beside it, and the one in
    // the other tab, update with no Refresh.
    await walkBox.click();
    await expect(walkBox).toBeChecked({ checked: !was });
    await expect(checklist(page)).toContainText(state(!was), { timeout: 10_000 });
    await expect(checklist(other)).toContainText(state(!was), { timeout: 10_000 });

    // Ticked elsewhere (the app calls Reskon's hook): both tabs update.
    await tickElsewhere(page.request, "walk", was);
    await expect(checklist(page)).toContainText(state(was), { timeout: 10_000 });
    await expect(checklist(other)).toContainText(state(was), { timeout: 10_000 });

    // The app's page was never reloaded: it still shows its own last tick
    // (it does not poll), and no new sign-in ticket was asked for. Neither
    // tab reloaded its other data.
    await expect(walkBox).toBeChecked({ checked: !was });
    const none = { launch: 0, bootstrap: 0, dashboards: 0 };
    expect(reloads).toEqual([none, none]);
  } finally {
    // However the journey ended: the tick as it was, the tab, the dashboard and the app gone.
    try {
      if (was !== null) await tickElsewhere(page.request, "walk", was);
    } catch (e) {
      console.warn("could not restore the Walk tick:", e);
    }
    await second?.close();
    await cleanUp();
  }
});
