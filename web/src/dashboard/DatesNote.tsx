import dayjs from "dayjs";
import { palette } from "../theme/palette";
import type { DateOverride } from "./types";

// Under a widget while the dashboard's Day or Dates choice is on: the dates
// it is really showing, so a title such as "Hours yesterday" never says
// something the dates do not. Shown by widgets that use the choice only.

/** "14 Nov", "1–7 Nov", "28 Oct – 3 Nov"; the year is added when it is not this year's. */
export function describeDates(from: string, to: string, now = dayjs()): string {
  const a = dayjs(from);
  const b = dayjs(to);
  const withYear = a.year() !== now.year() || b.year() !== now.year();
  const full = withYear ? "D MMM YYYY" : "D MMM";
  if (a.isSame(b, "day")) return a.format(full);
  if (a.isSame(b, "month")) return `${a.format("D")}–${b.format(full)}`;
  return `${a.format(full)} – ${b.format(full)}`;
}

export function DatesNote({ dates }: { dates: DateOverride }) {
  return <div style={{ marginTop: 6, fontSize: 11, color: palette.muted }}>showing {describeDates(dates.from, dates.to)}</div>;
}
