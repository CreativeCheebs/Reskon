import { describe, expect, it } from "vitest";
import { DELETE_WORD, typedDelete } from "./BulkDelete";

describe("typedDelete", () => {
  it("accepts the word, ignoring case and stray spaces", () => {
    expect(DELETE_WORD).toBe("delete");
    expect(typedDelete("delete")).toBe(true);
    expect(typedDelete(" Delete ")).toBe(true);
    expect(typedDelete("DELETE")).toBe(true);
  });
  it("refuses anything else", () => {
    for (const t of ["", "del", "deleted", "delete it", "dlete", "remove"]) expect(typedDelete(t)).toBe(false);
  });
});
