import { useEffect, useRef, useState } from "react";
import { Input, type InputRef } from "antd";
import { formatHM } from "../format";

// A Jira-style duration box: "1h 30m", "90m", "1.5h", "1.5" or "1:30".
// Hours are reported only when the text parses; the text itself is kept as
// typed, so an edit never rounds a stored value it didn't touch.

const UNIT = /(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)/gi;

/** Hours for a duration, null for an empty box, undefined if unreadable. */
export function parseDuration(text: string): number | null | undefined {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  const num = (v: string) => Number(v.replace(",", "."));
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return num(s);
  const clock = s.match(/^(\d+):([0-5]\d)$/);
  if (clock) return num(clock[1]) + num(clock[2]) / 60;
  let hours = 0;
  const rest = s.replace(UNIT, (_, n: string, unit: string) => {
    hours += unit.startsWith("h") ? num(n) : num(n) / 60;
    return "";
  });
  return rest.trim() === "" && hours > 0 ? hours : undefined;
}

export const MAX_HOURS = 24;

/** Why a duration can't be saved, or null when it can (or is empty). */
export function durationError(text: string): string | null {
  const h = parseDuration(text);
  if (h === undefined) return "Use a duration like 1h 30m, 45m or 1.5";
  if (h !== null && (h <= 0 || h > MAX_HOURS)) return `Between 1m and ${MAX_HOURS}h`;
  return null;
}

export function DurationInput({
  hours,
  onChange,
  disabled,
  autoFocus,
  id,
}: {
  hours: number | null;
  /** Parsed hours, or null while the box is empty or unreadable; the
   *  error once the person has left the box (for the field's hint). */
  onChange: (hours: number | null, error: string | null) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(hours ? formatHM(hours) : "");
  const [touched, setTouched] = useState(false);
  const [edited, setEdited] = useState(false);
  const parsed = parseDuration(text);
  const error = durationError(text);
  // A modal moves focus to itself as it opens; take it back once it has.
  const ref = useRef<InputRef>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => ref.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  return (
    <Input
      id={id}
      ref={ref}
      size="large"
      value={text}
      disabled={disabled}
      placeholder="e.g. 1h 30m"
      status={touched && error ? "error" : undefined}
      aria-invalid={!!error}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        setEdited(true);
        const err = durationError(t);
        const h = parseDuration(t);
        onChange(err || h === undefined ? null : h, touched ? err : null);
      }}
      onBlur={() => {
        setTouched(true);
        if (!edited) return; // an untouched stored value is left exactly as it was
        onChange(error || parsed === undefined ? null : parsed, error);
        // Tidy a readable entry into the standard form: "90m" → "1h 30m".
        if (!error && parsed) setText(formatHM(parsed));
      }}
      suffix={
        <span style={{ fontSize: 12, opacity: 0.7 }} aria-hidden>
          {parsed && !error && text.trim() !== formatHM(parsed) ? `= ${formatHM(parsed)}` : ""}
        </span>
      }
    />
  );
}
