import { CoffeeOutlined, ToolOutlined } from "@ant-design/icons";
import { Chip } from "../theme/Chip";

// Work or Event, shown the same way everywhere: one icon each, the same
// shape and weight, so the two read as a pair of choices.

export const KIND_ICON = { task: <ToolOutlined />, event: <CoffeeOutlined /> } as const;

/** The options for a segmented Work / Event switch. */
export const KIND_OPTIONS = [
  { value: "task", label: "Work", icon: KIND_ICON.task },
  { value: "event", label: "Event (not work)", icon: KIND_ICON.event },
];

/** A session's kind in a table cell. */
export function KindChip({ kind }: { kind: "task" | "event" }) {
  return (
    <Chip icon={KIND_ICON[kind]} tip={kind === "event" ? "Event, not work" : "Work"}>
      {kind === "event" ? "Event" : "Work"}
    </Chip>
  );
}
