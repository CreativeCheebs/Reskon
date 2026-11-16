import { test, expect, type Page } from "@playwright/test";

// The Home dashboard is listed first and its widgets draw, the dashboard's
// Day choice is said on each widget it changes, and a metric widget can be
// switched to the "Yesterday" range in the editor. The last journey makes a
// dashboard and removes it again, so run it only against a disposable server.
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

// The browser tells Reskon its time zone when it opens, and Reskon works out
// "yesterday" in that zone. The context is given one zone explicitly, and the
// expected day is worked out in that same zone before anything loads, so it
// cannot disagree with the server or flip across midnight halfway through.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayAgo(back: number) {
  const part = (t: string, d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, [t]: "numeric" }).format(d));
  const now = new Date();
  const [y, m, d] = [part("year", now), part("month", now), part("day", now)];
  const day = new Date(Date.UTC(y, m - 1, d - back));
  const iso = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
  return { iso, short: `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}` };
}

interface Answer {
  status: number;
  from?: string;
  to?: string;
}

test("Home is the first dashboard, its widgets draw, and a picked day is said on them", async ({ browser }) => {
  test.setTimeout(60_000);
  const yesterday = dayAgo(1);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: zone });
  const page = await ctx.newPage();
  const answers: Answer[] = [];
  page.on("response", async (r) => {
    if (!r.url().includes("/api/metrics?widget=")) return;
    const body = r.status() === 200 ? await r.json().catch(() => ({})) : {};
    answers.push({ status: r.status(), from: body.from, to: body.to });
  });
  try {
    await signIn(page);
    await page.getByRole("menuitem", { name: /Dashboards/ }).click();

    // Listed first, and the one shown when you open Dashboards.
    const switcher = page.locator(".jb-dashboard-toolbar .ant-segmented").first();
    await expect(switcher.locator(".ant-segmented-item").first()).toHaveText("Home");
    await expect(switcher.locator(".ant-segmented-item-selected")).toHaveText("Home");

    const widget = (title: string) => page.locator(".react-grid-item").filter({ hasText: title }).first();
    for (const title of ["Open tasks", "Hours yesterday", "Points yesterday", "Points, last 7 days", "Hours, last 7 days"]) {
      await expect(widget(title)).toBeVisible();
    }
    // Every metric widget (four on Home) has asked and been answered, then none is still loading.
    await expect.poll(() => answers.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(4);
    await expect(page.locator(".react-grid-item .ant-spin-spinning")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('.react-grid-item [role="alert"]')).toHaveCount(0);
    // The two "yesterday" numbers asked for the day before the browser's today, and every metric answered.
    await expect.poll(() => answers.filter((a) => a.from === yesterday.iso && a.to === yesterday.iso).length).toBeGreaterThanOrEqual(2);
    expect(answers.filter((a) => a.status !== 200)).toEqual([]);
    // Own ranges: nothing says "showing", the titles speak for themselves.
    await expect(page.getByText(/^showing /)).toHaveCount(0);

    // A picked day changes the four charts, and each says which day it now shows,
    // so "Hours yesterday" never claims a day it is not on. The board ignores it.
    const before = answers.length;
    await page.locator(".jb-dashboard-toolbar").getByText("Day", { exact: true }).click();
    await page.locator(".jb-dashboard-toolbar").getByRole("button", { name: "Yesterday" }).click();
    await expect.poll(() => answers.length).toBeGreaterThanOrEqual(before + 4);
    await expect(page.locator(".react-grid-item .ant-spin-spinning")).toHaveCount(0, { timeout: 15_000 });
    for (const title of ["Hours yesterday", "Points yesterday", "Points, last 7 days", "Hours, last 7 days"]) {
      await expect(widget(title).getByText(`showing ${yesterday.short}`)).toBeVisible();
    }
    await expect(widget("Open tasks").getByText(/^showing /)).toHaveCount(0);
    // Back to own ranges: the notes go.
    await page.locator(".jb-dashboard-toolbar").getByText("Own ranges", { exact: true }).click();
    await expect(page.getByText(/^showing /)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("a widget can be switched to Yesterday in the editor", async ({ browser }) => {
  test.setTimeout(90_000);
  const yesterday = dayAgo(1);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: zone });
  const page = await ctx.newPage();
  await signIn(page);
  const api = ctx.request;
  const name = `E2E yesterday ${Date.now()}`;
  // Left over from an earlier run that stopped half way.
  const old = (await (await api.get("/api/dashboards")).json()) as { id: number; name: string }[];
  for (const d of old.filter((d) => d.name.startsWith("E2E yesterday "))) await api.delete(`/api/dashboards/${d.id}`);
  let dashId = 0;
  try {
    dashId = ((await (await api.post("/api/dashboards", { data: { name } })).json()) as { id: number }).id;
    const made = await api.post("/api/widgets", {
      data: { dashboard_id: dashId, title: "Points range", viz: "number", query: { metric: "points", group: "day", range: "7d" } },
    });
    expect(made.status()).toBe(200);

    await page.goto(`/#/dashboard/${dashId}`);
    const widget = page.locator(".react-grid-item").filter({ hasText: "Points range" });
    await expect(widget).toBeVisible();
    await page.getByRole("button", { name: /^(edit )?Edit$/ }).click();
    await widget.getByRole("button", { name: "Edit widget" }).click();
    const dialog = page.getByRole("dialog");
    // Every label is joined to its control, so the control is found by its name.
    for (const label of ["Title", "Measure", "Show as", "Group by", "Range"]) {
      await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
    }
    await dialog.locator(".ant-select", { has: page.getByLabel("Range", { exact: true }) }).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: /^Yesterday$/ }).click();
    const redrawn = page.waitForResponse(async (r) => {
      if (!r.url().includes("/api/metrics?widget=")) return false;
      const b = await r.json().catch(() => ({}));
      return r.status() === 200 && b.from === yesterday.iso && b.to === yesterday.iso;
    });
    await dialog.getByRole("button", { name: "Save" }).click();
    await redrawn;
    await expect(dialog).toHaveCount(0);
    await expect(widget.locator(".ant-spin-spinning")).toHaveCount(0);

    // It was saved: the widget on the server says yesterday.
    const all = (await (await api.get("/api/dashboards")).json()) as { id: number; widgets: { query: { range?: string } }[] }[];
    expect(all.find((d) => d.id === dashId)!.widgets[0].query.range).toBe("yesterday");
  } finally {
    if (dashId) await api.delete(`/api/dashboards/${dashId}`);
    await ctx.close();
  }
});
