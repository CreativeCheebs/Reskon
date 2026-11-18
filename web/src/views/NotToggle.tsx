import { Segmented } from "antd";
import type { NotField } from "../types";

/** Turn one list on or off in a filter's "is not" set. */
export function withNot(not: NotField[] | null | undefined, field: NotField, on: boolean): NotField[] | null {
  const rest = (not ?? []).filter((n) => n !== field);
  const next = on ? [...rest, field] : rest;
  return next.length ? next : null;
}

/** A small "is / is not" choice next to a filter list. "is not" leaves out tasks matching any chosen value. */
export function NotToggle({ field, not, label, onChange }: { field: NotField; not: NotField[] | null | undefined; label: string; onChange: (not: NotField[] | null) => void }) {
  const isNot = (not ?? []).includes(field);
  return (
    <Segmented
      size="small"
      aria-label={`${label}: is or is not`}
      value={isNot ? "is not" : "is"}
      options={["is", "is not"]}
      onChange={(v) => onChange(withNot(not, field, v === "is not"))}
    />
  );
}
