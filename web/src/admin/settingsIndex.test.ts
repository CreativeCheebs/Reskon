import { describe, expect, it } from "vitest";
import { groupsFor } from "./Settings";
import { SETTINGS_INDEX, searchSettings } from "./settingsIndex";
import { makeTerms, termWords } from "../terms";

const sections = groupsFor(makeTerms(termWords({}))).flatMap((g) => g.sections);

describe("settings index", () => {
  it("has an entry for every section, and only for real sections", () => {
    const keys = new Set(sections.map((s) => s.key));
    for (const s of sections) expect(SETTINGS_INDEX.some((e) => e.section === s.key), `no entry for section ${s.key}`).toBe(true);
    for (const e of SETTINGS_INDEX) expect(keys.has(e.section), `${e.title} names unknown section ${e.section}`).toBe(true);
  });
  it("gives every entry a title and a one-line description", () => {
    for (const e of SETTINGS_INDEX) {
      expect(e.title.trim()).not.toBe("");
      expect(e.description.trim().length).toBeGreaterThan(10);
      expect(e.description).not.toContain("\n");
    }
  });
  it("finds a setting by a word in its description, not only its name", () => {
    const hits = searchSettings("password", sections);
    expect(hits.map((h) => h.section)).toContain("account");
  });
  it("needs every word to match, in any order, ignoring case", () => {
    expect(searchSettings("DAYS longest", sections).map((h) => h.entry.title)).toEqual(["Longest snooze"]);
    expect(searchSettings("longest zebra", sections)).toEqual([]);
  });
  it("matches nothing for a blank query and skips sections the person cannot see", () => {
    expect(searchSettings("  ", sections)).toEqual([]);
    expect(searchSettings("people", sections.filter((s) => s.key !== "users"))).toEqual([]);
  });
});
