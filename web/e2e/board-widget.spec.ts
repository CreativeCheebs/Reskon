import { test, expect, type Page } from "@playwright/test";

// A Board widget: a saved view's open tasks (to do and in progress) as a
// small read-only board on a dashboard. Makes a view, a dashboard and three
// tasks, and removes them again, so run it only against a disposable server.
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

interface Boot {
  areas: { id: number }[];
  statuses: { id: number; name: string; category_id: number; on_board: boolean; position: number }[];
  status_categories: { id: number; behaviour: string }[];
}

test("a board of open tasks on a dashboard follows the real board live", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  // The live connection is made when the app starts; seen here so the move below is not sent before it exists.
  const sockets: unknown[] = [];
  page.on("websocket", (ws) => sockets.push(ws));
  const other = await ctx.newPage();
  await signIn(page);
  await other.goto("/");
  await expect(other.getByRole("button", { name: "Sign out" })).toBeVisible();

  const api = ctx.request;
  const boot = (await (await api.get("/api/bootstrap")).json()) as Boot;
  const behaviour = (s: Boot["statuses"][number]) => boot.status_categories.find((c) => c.behaviour && c.id === s.category_id)?.behaviour;
  const open = boot.statuses.filter((s) => s.on_board && ["todo", "in_progress"].includes(behaviour(s)!)).sort((a, b) => a.position - b.position);
  const first = open.find((s) => behaviour(s) === "todo")!;
  const next = open.find((s) => behaviour(s) === "in_progress")!;
  const finished = boot.statuses.find((s) => s.on_board && behaviour(s) === "done")!;
  expect(first, "a to-do status on the board").toBeTruthy();
  expect(next, "an in-progress status on the board").toBeTruthy();
  expect(finished, "a done status on the board").toBeTruthy();
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const column = (s: { name: string }) => new RegExp(`^${escaped(s.name)},`);

  const stamp = Date.now();
  const names = { a: `Board A ${stamp}`, b: `Board B ${stamp}`, c: `Board C ${stamp}` };
  const ids: number[] = [];
  const keys: string[] = [];
  const made = async (title: string) => {
    const t = (await (await api.post("/api/tasks", { data: { title, area_id: boot.areas[0].id } })).json()) as { id: number; key: string };
    ids.push(t.id);
    keys.push(t.key);
    return t.id;
  };
  const move = (id: number, status: number) => other.evaluate(async ([id, status]) => {
    const r = await fetch(`/api/tasks/${id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_id: status }) });
    return r.status;
  }, [id, status]);
  let viewId = 0;
  let dashId = 0;

  // Left over from an earlier run that stopped half way.
  const dashboards = (await (await api.get("/api/dashboards")).json()) as { id: number; name: string }[];
  for (const d of dashboards.filter((d) => d.name.startsWith("E2E board "))) await api.delete(`/api/dashboards/${d.id}`);
  const views = (await (await api.get("/api/views")).json()) as { id: number; name: string }[];
  for (const v of views.filter((v) => v.name.startsWith("E2E board view "))) await api.delete(`/api/views/${v.id}`);

  const old = (await (await api.get("/api/tasks")).json()) as { id: number; title: string }[];
  const stale = old.filter((t) => /^Board [ABC] \d+$/.test(t.title)).map((t) => t.id);
  if (stale.length) await api.post("/api/tasks/delete", { data: { task_ids: stale } });

  try {
    // Newest first, so these three lead their columns however many tasks the account holds.
    const view = (await (await api.post("/api/views", { data: { name: `E2E board view ${stamp}`, layout: "board", filter: {}, board_state: { sort: "newest" } } })).json()) as { id: number };
    viewId = view.id;
    const a = await made(names.a);
    const b = await made(names.b);
    const c = await made(names.c);
    expect(await move(b, next.id)).toBe(200);
    expect(await move(c, finished.id)).toBe(200);
    dashId = ((await (await api.post("/api/dashboards", { data: { name: `E2E board ${stamp}` } })).json()) as { id: number }).id;

    await page.goto(`/#/dashboard/${dashId}`);
    await page.getByRole("button", { name: "Add widget" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Board", { exact: true }).click();
    await dialog.locator(".ant-select", { has: page.getByLabel("View", { exact: true }) }).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: `E2E board view ${stamp}` }).click();
    // The title follows the view until you type your own.
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(`E2E board view ${stamp}`);
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/widgets");
    await dialog.getByRole("button", { name: "Save" }).click();
    const widgetRes = await saved;
    expect(widgetRes.status()).toBe(200);
    expect(await widgetRes.json()).toMatchObject({ source: "view", viz: "board", query: { view_id: viewId } });
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: /^(check )?Done$/ }).click();

    const widget = page.locator(".react-grid-item").filter({ hasText: `E2E board view ${stamp}` });
    const todoCol = widget.getByRole("group", { name: column(first) });
    const doingCol = widget.getByRole("group", { name: column(next) });
    await expect(todoCol.getByText(names.a)).toBeVisible();
    await expect(doingCol.getByText(names.b)).toBeVisible();
    // Done tasks have no column, and no card is shown by its key.
    await expect(widget.getByRole("group", { name: column(finished) })).toHaveCount(0);
    await expect(widget.getByText(names.c)).toHaveCount(0);
    for (const key of keys) await expect(widget.getByText(key)).toHaveCount(0);

    // A card opens the task panel (where the key is shown).
    await todoCol.getByText(names.a).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText(keys[0]);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    // A task moved on the real board (here, by another tab) follows live.
    expect(sockets.length).toBeGreaterThan(0);
    expect(await move(a, next.id)).toBe(200);
    await expect(doingCol.getByText(names.a)).toBeVisible({ timeout: 8000 });
    await expect(todoCol.getByText(names.a)).toHaveCount(0);

    // Reloading keeps the cards on screen: held in the air, the request has
    // not been answered yet, and the cards are still there with no spinner.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/tasks\?view=/, async (route) => {
      await held;
      await route.continue();
    });
    const asked = page.waitForRequest(/\/api\/tasks\?view=/);
    await widget.getByRole("button", { name: "Refresh widget" }).click();
    await asked;
    await expect(widget.getByRole("status", { name: "Loading widget" })).toHaveCount(0);
    await expect(doingCol.getByText(names.b)).toBeVisible();
    await expect(doingCol.getByText(names.a)).toBeVisible();
    const answered = page.waitForResponse(/\/api\/tasks\?view=/);
    release();
    await answered;
    await expect(doingCol.getByText(names.b)).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });

    // The widget links to the full view.
    await widget.getByRole("link", { name: /^Open view / }).click();
    await expect(page).toHaveURL(new RegExp(`#/view/${viewId}$`));
  } finally {
    if (ids.length) await api.post("/api/tasks/delete", { data: { task_ids: ids } });
    if (dashId) await api.delete(`/api/dashboards/${dashId}`);
    if (viewId) await api.delete(`/api/views/${viewId}`);
    await ctx.close();
  }
});
