import { Divider } from "antd";
import { pressable } from "../a11y";
import { palette } from "../theme/palette";
import type { LinkedTask, Task } from "../types";
import { TaskTitle } from "./RoundTag";

// The task panel's Chain (SPEC 4.17): the task this one continues ("Comes
// after") and the tasks that continue it ("Next"), each opening that task.
// Shown only when there is a link. The key may show here: this is the panel.

export function Chain({ task, onOpenTask }: { task: Task; onOpenTask: (id: number) => void }) {
  const next = task.followed_by ?? [];
  if (!task.follows && next.length === 0) return null;
  const row = (label: string, links: LinkedTask[]) => (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span style={{ color: palette.muted, width: 90, flex: "none" }}>{label}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {links.length === 0 ? (
          <span style={{ color: palette.muted }}>Nothing</span>
        ) : (
          links.map((l) => {
            const finished = l.behaviour === "done" || l.behaviour === "cancelled";
            return (
              <span key={l.id} className="jb-clickable" {...pressable(() => onOpenTask(l.id), `Open ${l.title}`)} style={{ cursor: "pointer", borderRadius: 4 }}>
                <span style={{ color: palette.muted, fontSize: 12, marginRight: 6 }}>{l.key}</span>
                <span style={{ color: finished ? palette.muted : palette.fg, textDecoration: finished ? "line-through" : undefined }}>
                  <TaskTitle task={l} />
                </span>
              </span>
            );
          })
        )}
      </span>
    </div>
  );
  return (
    <div>
      <Divider plain orientation="left" style={{ margin: "4px 0 8px" }}>
        Chain
      </Divider>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        {row("Comes after", task.follows ? [task.follows] : [])}
        {row("Next", next)}
      </div>
    </div>
  );
}
