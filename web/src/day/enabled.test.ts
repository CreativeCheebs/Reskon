import { describe, expect, it } from "vitest";
import { showDayScreen } from "./enabled";

describe("showDayScreen", () => {
  it("is off until someone turns it on", () => {
    expect(showDayScreen({})).toBe(false);
  });

  it("is on only for true", () => {
    expect(showDayScreen({ show_day_screen: true })).toBe(true);
    expect(showDayScreen({ show_day_screen: false })).toBe(false);
    expect(showDayScreen({ show_day_screen: "true" })).toBe(false);
    expect(showDayScreen({ show_day_screen: 1 })).toBe(false);
    expect(showDayScreen({ show_day_screen: null })).toBe(false);
  });
});
