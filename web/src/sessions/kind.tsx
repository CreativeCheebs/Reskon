import { CoffeeOutlined, ToolOutlined } from "@ant-design/icons";
import { Chip } from "../theme/Chip";
import { useTerms, type Terms } from "../terms";

// Task or Event, shown the same way everywhere: one icon each, the same
// shape and weight, so the two read as a pair of choices.

export const KIND_ICON = { task: <ToolOutlined />, event: <CoffeeOutlined /> } as const;

/** The options for a segmented Task / Event switch. */
export const kindOptions = (T: Terms) => [
  { value: "task", label: T.Task, icon: KIND_ICON.task },
  { value: "event", label: "Event", icon: KIND_ICON.event },
];

/** A session's kind in a table cell. */
export function KindChip({ kind }: { kind: "task" | "event" }) {
  const T = useTerms();
  return (
    <Chip icon={KIND_ICON[kind]} tip={kind === "event" ? "Event" : T.Task}>
      {kind === "event" ? "Event" : T.Task}
    </Chip>
  );
}
