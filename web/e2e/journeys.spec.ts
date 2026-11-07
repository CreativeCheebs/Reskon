import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Browser journeys against a disposable test server (see playwright.config.ts).
// They only read and open things; nothing here changes data.
const user = process.env.JB_E2E_USER;
const pass = process.env.JB_E2E_PASS;
test.skip(!process.env.JB_E2E_URL || !user || !pass, "set JB_E2E_URL, JB_E2E_USER and JB_E2E_PASS");

// Ant Design's segmented control hides its radio input; click what a person clicks.
const layout = (page: Page, name: "Board" | "Table" | "Timeline") =>
  page.getByRole("radiogroup", { name: "Layout" }).getByText(name, { exact: true }).click();

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel(/user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("signing out returns to the sign-in page", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("a table row opens from the keyboard with Enter", async ({ page }) => {
  await signIn(page);
  await layout(page, "Table");
  const row = page.locator("tbody tr[tabindex='0']").first();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("a board card opens from the keyboard with Enter", async ({ page }) => {
  await signIn(page);
  await layout(page, "Board");
  const card = page.locator(".jb-sortable[role='button']").first();
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the Sessions screen loads and its filters have names", async ({ page }) => {
  await signIn(page);
  await page.getByRole("menuitem", { name: /Sessions/ }).click();
  await expect(page.getByRole("heading", { name: /Sessions/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Filter by energy type" })).toBeAttached();
  await expect(page.getByRole("combobox", { name: "Filter by area" })).toBeAttached();
  await expect(page.getByRole("group", { name: "Date range" })).toBeVisible();
});

// The rules for things fixed in the review. Other findings (colour contrast of
// the dark theme's borders) are decisions recorded in docs/decisions.md.
const fixedRules = ["label-content-name-mismatch", "button-name", "label", "select-name", "link-name", "nested-interactive", "role-img-alt", "svg-img-alt", "aria-allowed-role", "aria-valid-attr-value"];

for (const [name, open] of [
  ["the table", async (p: Page) => layout(p, "Table")],
  ["the board", async (p: Page) => layout(p, "Board")],
  ["the Sessions screen", async (p: Page) => p.getByRole("menuitem", { name: /Sessions/ }).click()],
] as const) {
  test(`axe finds none of the fixed problems on ${name}`, async ({ page }) => {
    await signIn(page);
    await open(page);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withRules(fixedRules).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}
