import { test, expect, type Page } from "@playwright/test";

// Settings › Apps against the pretend habit tracker (cmd/example-plugin)
// running beside the test server. Set JB_E2E_PLUGIN to its address as the
// test server sees it, such as http://127.0.0.1:8098. Connects and removes
// it again, so run it only against a disposable server.
const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;
// Without a trailing slash, so `${plugin}/` is the app's home page.
const plugin = process.env.JB_E2E_PLUGIN?.replace(/\/$/, "");
test.skip(!process.env.JB_E2E_URL || !user || !pass || !plugin, "set JB_E2E_URL, JB_E2E_USER, JB_E2E_PASS and JB_E2E_PLUGIN");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("connect an app, check it and remove it", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/settings/apps");
  const removeButtons = page.getByRole("button", { name: /^Remove / });
  // Left over from an earlier run: remove every one, once the list has loaded.
  await expect(page.getByText("No apps connected yet.").or(removeButtons.first())).toBeVisible();
  while ((await removeButtons.count()) > 0) {
    const before = await removeButtons.count();
    await removeButtons.first().click();
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await expect(removeButtons).toHaveCount(before - 1);
  }

  await page.getByLabel("App address").fill(plugin!);
  await page.getByLabel("App address").press("Enter");
  await expect(page.getByText("Today's habits")).toBeVisible();
  await expect(page.getByText("data: series")).toBeVisible();

  // A wrong password is said plainly.
  await page.getByLabel("Habits username").fill("aakash");
  await page.getByLabel("Habits password").fill("wrong");
  await page.getByRole("button", { name: "Connect Habits" }).click();
  await expect(page.getByText(/username or password is wrong/)).toBeVisible();

  await page.getByLabel("Habits password").fill("habits-123");
  await page.getByRole("button", { name: "Connect Habits" }).click();
  await expect(page.getByText("Reachable", { exact: true })).toBeVisible();
  // The password box is gone and nothing on the page shows the sign-in.
  await expect(page.getByLabel("Habits password")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("tok-123");

  // A wrong password when signing in again keeps the box open with what was typed.
  await page.getByRole("button", { name: "Sign in to Habits again" }).click();
  await page.getByLabel("Habits username").fill("aakash");
  await page.getByLabel("Habits password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/username or password is wrong/)).toBeVisible();
  await expect(page.getByLabel("Habits password")).toHaveValue("wrong");

  await page.getByRole("button", { name: "Check Habits again" }).click();
  await expect(page.getByText("Habits checked")).toBeVisible();

  await page.getByRole("button", { name: "Remove Habits" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(page.getByText("No apps connected yet.")).toBeVisible();
});

test("a connected app is listed under Apps in the sidebar and opens in a new tab", async ({ page, context }) => {
  await signIn(page);
  await page.goto("/#/settings/apps");
  const removeButtons = page.getByRole("button", { name: /^Remove / });
  await expect(page.getByText("No apps connected yet.").or(removeButtons.first())).toBeVisible();
  while ((await removeButtons.count()) > 0) {
    const before = await removeButtons.count();
    await removeButtons.first().click();
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await expect(removeButtons).toHaveCount(before - 1);
  }

  // No apps: no Apps heading. Look only after the sidebar's own list has
  // arrived, or the check would pass before it had asked.
  const listed = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/apps");
  await page.reload();
  await listed;
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const sider = page.locator(".jb-sider");
  await expect(sider.getByText("Apps", { exact: true })).toHaveCount(0);

  // A second tab, signed in the same way, to see the list update by itself.
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByLabel("App address").fill(plugin!);
  await page.getByLabel("App address").press("Enter");
  await page.getByLabel("Habits username").fill("aakash");
  await page.getByLabel("Habits password").fill("habits-123");
  await page.getByRole("button", { name: "Connect Habits" }).click();
  await expect(page.getByText("Reachable", { exact: true })).toBeVisible();

  // The heading and the app appear here, and in the other tab without a reload.
  for (const p of [page, other]) {
    await expect(p.locator(".jb-sider").getByText("Apps", { exact: true })).toBeVisible();
    const link = p.locator(".jb-sider").getByRole("link", { name: /Habits/ });
    await expect(link).toHaveAttribute("href", `${plugin}/`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }

  // Opening the app's page: each way (click, Enter on the link, Enter on the
  // row) opens exactly one new tab. The plugin address is as the test server
  // sees it, so this browser may not reach it: answer the tab with a
  // stand-in page; the address it was sent to is what counts.
  await context.route(`${plugin}/**`, (route) => route.fulfill({ contentType: "text/html", body: "<title>Habits</title>" }));
  const opened: Page[] = [];
  context.on("page", (p) => opened.push(p));
  const link = sider.getByRole("link", { name: /Habits/ });
  const openedOne = async () => {
    await expect.poll(() => opened.length).toBe(1);
    await page.waitForTimeout(500); // a second tab would show up by now
    expect(opened.length).toBe(1);
    await opened[0].waitForLoadState();
    expect(opened[0].url()).toBe(`${plugin}/`);
    await opened[0].close();
    opened.length = 0;
  };
  await link.click();
  await openedOne();
  await link.focus();
  await page.keyboard.press("Enter");
  await openedOne();
  await sider.getByRole("menuitem", { name: /Habits/ }).focus();
  await page.keyboard.press("Enter");
  await openedOne();
  await other.close();

  // Removing the app takes the heading away again.
  await page.getByRole("button", { name: "Remove Habits" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(page.getByText("No apps connected yet.")).toBeVisible();
  await expect(sider.getByText("Apps", { exact: true })).toHaveCount(0);
  await expect(sider.getByRole("link", { name: /Habits/ })).toHaveCount(0);
});
