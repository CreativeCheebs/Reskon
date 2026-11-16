import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { describeDates } from "./DatesNote";

const now = dayjs("2026-11-16");

describe("describeDates", () => {
  it("names one day, a span in one month, and a span over two months", () => {
    expect(describeDates("2026-11-14", "2026-11-14", now)).toBe("14 Nov");
    expect(describeDates("2026-11-01", "2026-11-07", now)).toBe("1–7 Nov");
    expect(describeDates("2026-10-28", "2026-11-03", now)).toBe("28 Oct – 3 Nov");
  });
  it("adds the year when it is not this year's", () => {
    expect(describeDates("2025-12-31", "2025-12-31", now)).toBe("31 Dec 2025");
    expect(describeDates("2025-12-28", "2026-01-03", now)).toBe("28 Dec 2025 – 3 Jan 2026");
  });
});
