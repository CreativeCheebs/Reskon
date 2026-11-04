import { FileTextFilled, ThunderboltFilled } from "@ant-design/icons";
import { Tooltip } from "antd";
import { palette } from "../theme/palette";
import type { TaskType } from "../types";

// The one symbol for each task type, used on cards, tables, pickers and
// filters so an epic always looks like an epic. A task is a page, not a
// tick-box: a ticked box on an unfinished task reads as "done".


export function TypeIcon({ type, size = 13 }: { type: TaskType; size?: number }) {
  return (
    <Tooltip title={type === "epic" ? "Epic" : "Task"} mouseEnterDelay={0.6}>
      {type === "epic" ? (
        <ThunderboltFilled style={{ color: palette.epic, fontSize: size }} />
      ) : (
        <FileTextFilled style={{ color: palette.accent, fontSize: size }} />
      )}
    </Tooltip>
  );
}

export function TypeLabel({ type }: { type: TaskType }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <TypeIcon type={type} /> {type === "epic" ? "Epic" : "Task"}
    </span>
  );
}
