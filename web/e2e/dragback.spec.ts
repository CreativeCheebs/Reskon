import { test, expect, type Page } from "@playwright/test";

// A card just dropped in another column can be picked up again at once.
// (Fast drag-over events once put a card in a column twice, and the copy's
// removal left the card impossible to drag until a reload.) This journey
// moves one card across and back, so run it only on a disposable server.
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

interface Card {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

test("a card can be dragged across and straight back, many times", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await signIn(page);
  await page.getByRole("radiogroup", { name: "Layout" }).getByText("Board", { exact: true }).click();
  const cards = page.locator(".jb-sortable[role='button']");
  await expect(cards.first()).toBeVisible();

  // Columns are the boxes with the 3px coloured cap.
  const colXs: number[] = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("div")]
      .filter((d) => d.style.borderTopWidth === "3px" && d.getBoundingClientRect().width > 150)
      .map((d) => Math.round(d.getBoundingClientRect().x))
      .sort((a, b) => a - b),
  );
  test.skip(colXs.length < 2, "the first view's board needs two columns");
  const colOf = (x: number) => colXs.filter((cx) => cx <= x).pop();
  // Every card's place, read in one go: the board can redraw at any moment
  // (other tabs on this account change it, and live updates reload it).
  const all = (): Promise<Card[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".jb-sortable[role='button']")].map((c) => {
        const b = c.getBoundingClientRect();
        return { title: c.innerText.split(String.fromCharCode(10))[0], x: b.x, y: b.y, w: b.width, h: b.height };
      }),
    );
  const start = await all();
  const home = start.find((c) => colOf(c.x) === colXs[0]) ?? start.find((c) => colOf(c.x) === colXs[1]);
  test.skip(!home, "no card in the first two columns");
  const title = home!.title;
  const A = colOf(home!.x)!;
  const B = A === colXs[0] ? colXs[1] : colXs[0];

  // The column that holds the card: the nearest box with the coloured cap.
  const columnOf = (t: string) =>
    page.evaluate((t) => {
      const card = [...document.querySelectorAll<HTMLElement>(".jb-sortable")].find((c) => c.innerText.startsWith(t));
      let el: HTMLElement | null = card ?? null;
      while (el && el.style.borderTopWidth !== "3px") el = el.parentElement;
      return el ? Math.round(el.getBoundingClientRect().x) : null;
    }, t);
  const drag = async (toX: number) => {
    // A card dropped at the end of a long column can be below the window.
    await cards.filter({ hasText: title }).first().scrollIntoViewIfNeeded();
    const c = (await all()).find((x) => x.title === title)!;
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.w / 2 + 10, c.y + c.h / 2, { steps: 2 });
    // Few steps: drag-over events arrive faster than the board redraws.
    // Near the top of the other column, over its cards (never its footer).
    await page.mouse.move(toX + c.w / 2, 220, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => columnOf(title)).toBe(toX);
    await expect(page.locator(".ant-drawer-mask")).toHaveCount(0); // not taken as a click
  };
  // Where the card sits in its column: what the board shows must be what
  // was saved (a drop once saved the card at the top of a full column).
  const placeOf = (t: string) =>
    page.evaluate((t) => {
      const card = [...document.querySelectorAll<HTMLElement>(".jb-sortable")].find((c) => c.innerText.startsWith(t));
      let col: HTMLElement | null = card ?? null;
      while (col && col.style.borderTopWidth !== "3px") col = col.parentElement;
      const inCol = [...(col?.querySelectorAll<HTMLElement>(".jb-sortable") ?? [])].map((c) => c.innerText.split(String.fromCharCode(10))[0]);
      return `${Math.round(col?.getBoundingClientRect().x ?? -1)}:${inCol.indexOf(t)}`;
    }, t);
  for (let i = 0; i < 4; i++) {
    await drag(B);
    await drag(A);
  }
  // What is shown after the last quick drop (straight back, before the move
  // before it was saved) is what the server kept; then the same one way.
  const savedAsShown = async () => {
    await page.waitForTimeout(1000); // the moves are saved
    const shown = await placeOf(title);
    await page.reload();
    await expect(cards.first()).toBeVisible();
    expect(await placeOf(title)).toBe(shown);
  };
  await savedAsShown();
  await drag(B);
  await savedAsShown();
  await drag(A); // leave it where it started
});
