import { useState } from "react";
import { Button, Checkbox } from "antd";
import dayjs from "dayjs";
import { api } from "../api";
import { message } from "../theme/feedback";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import { formatHM } from "../format";
import type { Run } from "./usePlanner";
import type { BringCandidate } from "./types";

/**
 * Bring forward: on request only, the unfinished tasks from earlier days.
 * Choosing some copies them onto this day; the earlier days keep their lines.
 * Nothing here ever happens by itself.
 */
export function BringForward({ day, run }: { day: string; run: Run }) {
  const { online, boot } = useApp();
  const [list, setList] = useState<BringCandidate[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      setList(await api.get<BringCandidate[]>(`/day/${day}/bring-forward`));
      setPicked([]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const bring = async () => {
    if (!picked.length) return;
    const ok = await run(() => api.post(`/day/${day}/bring-forward`, { task_ids: picked }));
    if (ok) setList(null);
  };

  return (
    <section aria-label="Bring forward" style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${palette.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ fontSize: 12, margin: 0, flex: 1, color: palette.subtle, textTransform: "uppercase", letterSpacing: 0.6 }}>Bring forward</h3>
        {list === null ? (
          <Button size="small" onClick={open} loading={busy} disabled={!online}>
            Unfinished from earlier days…
          </Button>
        ) : (
          <Button size="small" type="text" onClick={() => setList(null)}>
            Close
          </Button>
        )}
      </div>
      {list !== null &&
        (list.length === 0 ? (
          <div style={{ color: palette.muted, fontSize: 12, marginTop: 8 }}>Nothing unfinished from earlier days.</div>
        ) : (
          <>
            <ul aria-label="Unfinished tasks from earlier days" style={{ margin: "8px 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {list.map((c) => (
                <li key={c.task_id} style={{ listStyle: "none" }}>
                  <Checkbox checked={picked.includes(c.task_id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.task_id] : picked.filter((x) => x !== c.task_id))}>
                    <span>{c.title}</span>
                    <span style={{ display: "block", color: palette.muted, fontSize: 11 }}>
                      {boot.areas.find((a) => a.id === c.area_id)?.name ?? ""} · last planned {dayjs(c.from_day).format("D MMM")}
                      {c.days > 1 ? ` (${c.days} days)` : ""} · {formatHM(c.logged_h)} / {c.estimate_h === null ? "no estimate" : formatHM(c.estimate_h)}
                    </span>
                  </Checkbox>
                </li>
              ))}
            </ul>
            <Button size="small" type="primary" disabled={!picked.length || !online} onClick={bring}>
              Bring {picked.length || ""} to this day
            </Button>
          </>
        ))}
    </section>
  );
}
