import { useState } from "react";
import { Divider, Segmented } from "antd";
import { message } from "../theme/feedback";
import { pressable } from "../a11y";
import { formatHours } from "../format";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { Round, RoundKind, Task } from "../types";
import { setRoundKind } from "./nextTask";
import { RoundTag } from "./RoundTag";

// A task's rounds in the task panel (SPEC 4.17): whether the series counts
// rounds (#3) or versions (v3), switchable here, and every round of the
// series with when it was done, its hours and its points. They are only
// listed side by side: never added up or set against each other. The number
// itself is never edited.

export function Rounds({ task, onChanged, onOpenTask }: { task: Task; onChanged: () => void; onOpenTask: (id: number) => void }) {
  const { online } = useApp();
  const [busy, setBusy] = useState(false);
  if (task.round_no === null) return null;
  const kind: RoundKind = task.round_kind ?? "round";
  const rounds = task.rounds ?? [];

  const switchKind = async (k: RoundKind) => {
    setBusy(true);
    try {
      await setRoundKind(task.id, k);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const when = (r: Round) =>
    r.completed_at
      ? `done ${new Date(r.completed_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
      : r.behaviour === "cancelled"
        ? "cancelled"
        : r.behaviour === "in_progress"
          ? "in progress"
          : "to do";
  const cell = { padding: "3px 8px 3px 0", whiteSpace: "nowrap" as const };

  return (
    <div>
      <Divider plain orientation="left" style={{ margin: "4px 0 8px" }}>
        {kind === "version" ? "Versions" : "Rounds"}
      </Divider>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, fontSize: 13 }}>
        <span style={{ color: palette.muted, width: 90 }}>{kind === "version" ? "Version" : "Round"}</span>
        <RoundTag no={task.round_no} kind={kind} />
        <Segmented<RoundKind>
          size="small"
          disabled={!online || busy}
          value={kind}
          onChange={switchKind}
          options={[
            { value: "round", label: "Rounds #" },
            { value: "version", label: "Versions v" },
          ]}
        />
      </div>
      {rounds.length > 1 && (
        <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: palette.muted, textAlign: "left" }}>
              <th style={cell}>{kind === "version" ? "Version" : "Round"}</th>
              <th style={cell}>When</th>
              <th style={cell}>Hours</th>
              <th style={cell}>Points</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const self = r.id === task.id;
              return (
                <tr key={r.id} style={{ color: self ? palette.fg : undefined }}>
                  <td style={cell}>
                    {self ? (
                      <RoundTag no={r.no} kind={kind} />
                    ) : (
                      <span className="jb-clickable" {...pressable(() => onOpenTask(r.id), `Open ${r.title} ${r.no}`)} style={{ cursor: "pointer" }}>
                        <RoundTag no={r.no} kind={kind} />
                      </span>
                    )}
                  </td>
                  <td style={cell}>{self ? "this one" : when(r)}</td>
                  <td style={cell}>{formatHours(r.logged_h)}</td>
                  <td style={cell}>{Math.round(r.points * 10) / 10}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
