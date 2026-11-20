import { palette, readable } from "../theme/palette";
import type { RoundKind } from "../types";

// A round's number after a task's title (SPEC 4.17): "Clean home #3", or
// "Board layout v3" for versions. It is kept apart from the title on the
// server, and shown in a small code font in the accent colour so it reads as
// a label, not as part of the name.

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** "#3", "v3", or null when the task has no round number. */
export function roundLabel(no: number | null | undefined, kind: RoundKind | null | undefined): string | null {
  if (no == null) return null;
  return kind === "version" ? `v${no}` : `#${no}`;
}

/** The title with its round as plain text, for tooltips and screen readers. */
export function titleText(t: { title: string; round_no?: number | null; round_kind?: RoundKind | null }): string {
  const label = roundLabel(t.round_no, t.round_kind);
  return label ? `${t.title} ${label}` : t.title;
}

/** Just the number, styled; nothing when there is none. `bg` is the surface
 *  it sits on (the panel colour unless given), so the accent stays readable. */
export function RoundTag({ no, kind, bg }: { no: number | null | undefined; kind: RoundKind | null | undefined; bg?: string }) {
  const label = roundLabel(no, kind);
  if (!label) return null;
  return (
    <span
      className="jb-round-tag"
      style={{
        fontFamily: MONO,
        fontSize: "0.85em",
        fontWeight: 500,
        marginLeft: "0.4em",
        whiteSpace: "nowrap",
        color: readable(palette.accent, bg ?? palette.panel),
      }}
    >
      {label}
    </span>
  );
}

/** A task's title followed by its round number. The round fields are
 *  optional: a linked task (Chain, dependencies) carries only its title. */
export function TaskTitle({ task, bg }: { task: { title: string; round_no?: number | null; round_kind?: RoundKind | null }; bg?: string }) {
  return (
    <>
      {task.title}
      <RoundTag no={task.round_no} kind={task.round_kind} bg={bg} />
    </>
  );
}
