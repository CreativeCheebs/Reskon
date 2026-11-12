import { describe, expect, it } from "vitest";
import { APP_NAME_VERSION, APP_VERSION } from "./version";

describe("version", () => {
  it("is major.minor.patch, and is what the screens show", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_NAME_VERSION).toBe(`Reskon ${APP_VERSION}`);
  });
});
