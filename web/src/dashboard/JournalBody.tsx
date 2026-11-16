import { useId, useRef, useState } from "react";
import { Button, Empty } from "antd";
import dayjs from "dayjs";
import { palette } from "../theme/palette";
import { formatHM } from "../format";
import { TaskPanel } from "../task/TaskPanel";
import { CopyMarkdownButton } from "../journal/CopyMarkdown";
import type { Journal, JournalDay } from "../journal/types";

// A journal widget's body: each day with sessions, newest first, with what
// was done and its note (a day's notes read as a journal). Read-only. Hours
// and points are the server's; here they are only written out. Notes are
// shown as plain text, line breaks kept, never as Markdown or HTML. A
// session on a task opens the task panel. The task key is never shown.

export function JournalBody({ journal, title, editing, refetch }: { journal: Journal; title: string; editing: boolean; refetch: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  // The year is written on each day when any day is not in this year, so a
  // list that runs over New Year (or is old) never leaves its year to guess.
  const thisYear = dayjs().year();
  const withYear = journal.days.some((d) => dayjs(d.day).year() !== thisYear);
  const changed = useRef(false);
  // The list can be taller than the widget, so it takes the keyboard's focus
  // and the arrow keys can scroll it (as an app's list does).
  const focusable = { tabIndex: 0, role: "region", "aria-label": title };
  return (
    <>
      {journal.days.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sessions in these days." style={{ margin: "auto", padding: "24px 12px" }} />
      ) : (
        // no-drag: in edit mode the list's own scrollbar must work, not start a drag of the widget.
        <div className="no-drag" {...focusable} style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {journal.days.map((d) => (
            <Day key={d.day} day={d} withYear={withYear} editing={editing} onOpen={setOpen} />
          ))}
          {journal.more && (
            <div style={{ color: palette.muted, fontSize: 12, padding: "4px 0 8px" }}>
              Older days are not shown here (the newest {journal.days.length} days with sessions are). Move the dashboard's dates to earlier ones to see them.
            </div>
          )}
        </div>
      )}
      {open !== null && (
        <TaskPanel
          taskId={open}
          onClose={() => {
            setOpen(null);
            // An edit may have renamed the task.
            if (changed.current) {
              changed.current = false;
              refetch();
            }
          }}
          onChanged={() => (changed.current = true)}
          onDeleted={() => (changed.current = true)}
        />
      )}
    </>
  );
}

function Day({ day, withYear, editing, onOpen }: { day: JournalDay; withYear: boolean; editing: boolean; onOpen: (id: number) => void }) {
  const points = Number(day.points.toFixed(2));
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${palette.border}`, paddingBottom: 2, marginBottom: 6 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: "inherit", fontWeight: 600 }}>
          {dayjs(day.day).format(withYear ? "dddd D MMMM YYYY" : "dddd D MMMM")}
        </h3>
        <span style={{ flex: 1, color: palette.muted, fontSize: 12 }}>
          {formatHM(day.hours)}, {points} {points === 1 ? "point" : "points"}
        </span>
        <span className="no-drag">
          <CopyMarkdownButton day={day.day} markdown={day.markdown} />
        </span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {day.sessions.map((s) => (
          <li key={s.id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              {s.start && s.end && (
                <span style={{ color: palette.subtle, fontSize: 12, fontVariantNumeric: "tabular-nums", flex: "none" }}>
                  {s.start}–{s.end}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {s.task_id && !editing ? (
                  <Button type="link" size="small" style={{ padding: 0, height: "auto", whiteSpace: "normal", textAlign: "left" }} onClick={() => onOpen(s.task_id!)}>
                    {s.what}
                  </Button>
                ) : (
                  s.what
                )}
                {s.area && <span style={{ color: palette.muted }}> ({s.area})</span>}
              </span>
              <span style={{ color: palette.muted, fontSize: 12, flex: "none" }}>{formatHM(s.hours)}</span>
            </div>
            {s.note && (
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: palette.fg, fontSize: 12.5, margin: "2px 0 0 10px", paddingLeft: 8, borderLeft: `2px solid ${palette.border}` }}>
                {s.note}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
