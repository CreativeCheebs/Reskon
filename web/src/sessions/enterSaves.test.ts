import { describe, expect, it } from "vitest";
import { enterSaves, type EnterKey } from "./enterSaves";

const input = (attrs: Record<string, string> = {}, type = "text") => ({
  tagName: "INPUT",
  type,
  getAttribute: (n: string) => attrs[n] ?? null,
});

const press = (over: Partial<EnterKey> = {}): EnterKey => ({
  key: "Enter",
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  target: input(),
  ...over,
});

describe("enterSaves", () => {
  it("saves on a plain Enter in a text box", () => {
    expect(enterSaves(press())).toBe(true);
  });
  it("ignores other keys", () => {
    expect(enterSaves(press({ key: "a" }))).toBe(false);
    expect(enterSaves(press({ key: "Tab" }))).toBe(false);
  });
  it("leaves Enter in the note (a text area) to start a new line", () => {
    expect(enterSaves(press({ target: { tagName: "TEXTAREA", getAttribute: () => null } }))).toBe(false);
  });
  it("leaves Enter on a button or link to press it", () => {
    expect(enterSaves(press({ target: { tagName: "BUTTON", getAttribute: () => null } }))).toBe(false);
    expect(enterSaves(press({ target: { tagName: "A", getAttribute: () => null } }))).toBe(false);
  });
  it("leaves Enter on a radio or checkbox alone", () => {
    expect(enterSaves(press({ target: input({}, "radio") }))).toBe(false);
    expect(enterSaves(press({ target: input({}, "checkbox") }))).toBe(false);
  });
  it("leaves Enter in a drop-down alone, open or closed (it opens or picks)", () => {
    expect(enterSaves(press({ target: input({ role: "combobox", "aria-expanded": "false" }) }))).toBe(false);
    expect(enterSaves(press({ target: input({ role: "combobox", "aria-expanded": "true" }) }))).toBe(false);
    expect(enterSaves(press({ target: input({ "aria-expanded": "false" }) }))).toBe(false);
  });
  it("leaves Enter in a date or time picker alone", () => {
    const picker = { ...input(), closest: (s: string) => (s === ".ant-picker" ? ({} as Element) : null) };
    expect(enterSaves(press({ target: picker }))).toBe(false);
  });
  it("does not save when another handler already used the Enter", () => {
    expect(enterSaves(press({ defaultPrevented: true }))).toBe(false);
  });
  it("does not save while a word is being composed", () => {
    expect(enterSaves(press({ isComposing: true }))).toBe(false);
  });
  it("ignores Enter with a modifier key", () => {
    expect(enterSaves(press({ shiftKey: true }))).toBe(false);
    expect(enterSaves(press({ ctrlKey: true }))).toBe(false);
  });
});
