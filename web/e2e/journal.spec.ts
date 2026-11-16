import { test, expect, type Page } from "@playwright/test";

// The journal: a session with a two-line note, "Copy as Markdown" on the
// Sessions screen, and a Journal widget on a dashboard. Makes a task, a
// session and a dashboard, and removes them again, so run it only against a
// disposable server.
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

interface Day {
  day: string;
  hours: number;
  points: number;
  markdown: string;
}

test("a day's sessions copy as Markdown and show in a Journal widget", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await signIn(page);
  const api = ctx.request;
  const boot = (await (await api.get("/api/bootstrap")).json()) as { areas: { id: number }[]; energy_types: { id: number }[]; settings?: { time_zone?: string } };

  const stamp = Date.now();
  const title = `Journal task ${stamp}`;
  const noteLine1 = `Found the cron path was wrong ${stamp}`;
  const noteLine2 = "Fixed and tested.";
  // "Today" is the account's own (its time zone setting, which the browser
  // sent when it opened), not this machine's, so the test cannot disagree
  // with the server around midnight or across zones.
  const zone = boot.settings?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = today.split("-").map(Number);
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  // The Sessions button is named by the day ("Mon 16 Nov"); the widget's heading by the long form.
  const shortDay = `${weekday.slice(0, 3)} ${d} ${MONTHS[mo - 1].slice(0, 3)}`;
  const longDay = new RegExp(`^${weekday} ${d} ${MONTHS[mo - 1]}`);
  let taskId = 0;
  let sessionId = 0;
  let dashId = 0;

  // Left over from an earlier run that stopped half way.
  const dashboards = (await (await api.get("/api/dashboards")).json()) as { id: number; name: string }[];
  for (const d of dashboards.filter((d) => d.name.startsWith("E2E journal "))) await api.delete(`/api/dashboards/${d.id}`);
  const old = (await (await api.get("/api/tasks")).json()) as { id: number; title: string }[];
  const stale = old.filter((t) => /^Journal task \d+$/.test(t.title)).map((t) => t.id);
  const staleSessions = (await (await api.get("/api/sessions?q=Journal%20task")).json()) as { id: number; task_id: number | null }[];
  for (const s of staleSessions.filter((s) => s.task_id && stale.includes(s.task_id))) await api.delete(`/api/sessions/${s.id}`);
  if (stale.length) await api.post("/api/tasks/delete", { data: { task_ids: stale } });

  // Reads the clipboard by pasting it into a box. (The test server is plain
  // http, where the browser has no clipboard API, so Reskon copies with the
  // older copy command; pasting reads whatever way it got there.)
  const copied = async () => {
    await page.evaluate(() => {
      const box = document.createElement("textarea");
      box.id = "e2e-paste";
      document.body.appendChild(box);
      box.focus();
    });
    await page.keyboard.press("ControlOrMeta+V");
    const text = await page.locator("#e2e-paste").inputValue();
    await page.evaluate(() => document.getElementById("e2e-paste")?.remove());
    return text;
  };

  // Puts known text on the clipboard with a real copy, so a later copy
  // proves it replaced it.
  const putOnClipboard = async (text: string) => {
    await page.evaluate((t) => {
      const box = document.createElement("textarea");
      box.id = "e2e-filler";
      box.value = t;
      document.body.appendChild(box);
      box.focus();
      box.select();
    }, text);
    await page.keyboard.press("ControlOrMeta+C");
    await page.evaluate(() => document.getElementById("e2e-filler")?.remove());
  };

  try {
    const task = (await (await api.post("/api/tasks", { data: { title, area_id: boot.areas[0].id } })).json()) as { id: number; key: string };
    taskId = task.id;
    const s = await api.post("/api/sessions", {
      data: { task_id: task.id, energy_type_id: boot.energy_types[0].id, hours: 1.5, logged_for: today, started_at: now.toISOString(), note: `${noteLine1}\n${noteLine2}` },
    });
    expect(s.status()).toBe(200);
    sessionId = ((await s.json()) as { id: number }).id;
    const journal = (await (await api.get(`/api/journal?from=${today}&to=${today}`)).json()) as { days: Day[] };
    const served = journal.days[0];
    expect(served.day).toBe(today);
    // The times the server gives are the account's own clock: the start is
    // now in its zone, and the end is 90 minutes later.
    const mine = (served as Day & { sessions: { id: number; start: string; end: string }[] }).sessions.find((x) => x.id === sessionId)!;
    const clock = (t: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(t);
    expect(mine.start).toBe(clock(now));
    expect(mine.end).toBe(clock(new Date(now.getTime() + 90 * 60_000)));
    const times = `${mine.start}–${mine.end}`;

    // Sessions screen: Copy as Markdown copies the server's text.
    await page.goto("/#/sessions");
    const copy = page.getByRole("button", { name: `Copy as Markdown, ${shortDay}` });
    await expect(copy).toBeEnabled();
    await putOnClipboard("filler one");
    expect(await copied()).toBe("filler one");
    await copy.click();
    await expect(page.getByText("Copied")).toBeVisible();
    const text = await copied();
    expect(text).toBe(served.markdown);
    expect(text).toMatch(new RegExp(`^## ${weekday} ${d} ${MONTHS[mo - 1]} ${y} — .*\\d+ points?\\n`));
    expect(text).toContain(`- ${times} · ${title} (`);
    // A line that another follows ends with two spaces, so each stays its own line.
    expect(text).toContain(`\n  ${noteLine1}  \n  ${noteLine2}\n`);
    expect(text).not.toContain(task.key);
    // The first toast goes before the widget's copy is judged by its own.
    await expect(page.getByText("Copied")).toHaveCount(0, { timeout: 8000 });

    // A Journal widget on a throwaway dashboard.
    dashId = ((await (await api.post("/api/dashboards", { data: { name: `E2E journal ${stamp}` } })).json()) as { id: number }).id;
    await page.goto(`/#/dashboard/${dashId}`);
    await page.getByRole("button", { name: "Add widget" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Journal", { exact: true }).click();
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/widgets");
    await dialog.getByRole("button", { name: "Save" }).click();
    const res = await saved;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ source: "journal", viz: "journal", query: { range: "7d" } });
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: /^(check )?Done$/ }).click();

    const widget = page.locator(".react-grid-item").filter({ hasText: "Journal" });
    const day = widget.getByRole("region", { name: longDay });
    await expect(day).toContainText(title);
    await expect(day).toContainText(times);
    await expect(day).toContainText(noteLine1);
    await expect(day).toContainText(noteLine2);
    await expect(widget.getByText(task.key)).toHaveCount(0);

    // The widget's own Copy as Markdown copies the same text.
    await putOnClipboard("filler two");
    expect(await copied()).toBe("filler two");
    await day.getByRole("button", { name: /^Copy as Markdown/ }).click();
    await expect(page.getByText("Copied")).toBeVisible();
    expect(await copied()).toBe(served.markdown);

    // Clicking the task opens its panel.
    await day.getByRole("button", { name: title }).click();
    await expect(page.getByRole("dialog")).toContainText(task.key);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    if (dashId) await api.delete(`/api/dashboards/${dashId}`);
    if (sessionId) await api.delete(`/api/sessions/${sessionId}`);
    if (taskId) await api.post("/api/tasks/delete", { data: { task_ids: [taskId] } });
    await ctx.close();
  }
});
