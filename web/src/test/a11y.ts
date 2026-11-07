import { expect } from "vitest";
import { axe } from "vitest-axe";

// Fails with the names of the accessibility problems axe finds in a rendered
// component. Colour contrast is skipped: jsdom cannot draw, so it cannot
// work out colours. (Palette contrast is checked from the colour values.)
export async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
