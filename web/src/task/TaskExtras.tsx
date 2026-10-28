import { useEffect, useState } from "react";
import { Divider, List, Tag } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatHours } from "../format";
import { palette } from "../theme/palette";
import { SessionModal } from "../sessions/SessionModal";
import type { Session, Task } from "../types";

// Task panel sections below the core fields: sessions logged against the
// task, custom fields and cycle time.

export function TaskExtras({
  task,
  onTaskChanged,
}: {
  task: Task;
  patch: (changes: Record<string, unknown>) => Promise<void>;
  onTaskChanged: () => void;
}) {
  const { boot } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logging, setLogging] = useState<{ editing?: Session } | null>(null);

  const load = () =>
    api
      .get<Session[]>(`/sessions?task_id=${task.id}`)
      .then(setSessions)
      .catch(() => undefined);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.updated_at]);

  return (
    <>
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Sessions · {formatHours(task.logged_h)}
      </Divider>
      <List
        size="small"
        dataSource={sessions}
        locale={{ emptyText: "Nothing logged yet" }}
        renderItem={(s) => (
          <List.Item style={{ cursor: "pointer", padding: "4px 0" }} onClick={() => setLogging({ editing: s })}>
            <span>{s.logged_for}</span>
            <span>{boot.energy_types.find((e) => e.id === s.energy_type_id)?.name}</span>
            <span>
              {s.kind === "event" && <Tag>event</Tag>}
              {formatHours(s.hours)}
            </span>
            <span style={{ color: palette.muted, flex: 1, textAlign: "right" }}>{s.note}</span>
          </List.Item>
        )}
      />
      <WriteButton size="small" onClick={() => setLogging({})}>
        Log time
      </WriteButton>
      {logging && (
        <SessionModal
          initial={{ task_id: task.id, area_id: task.area_id }}
          editing={logging.editing}
          onClose={() => setLogging(null)}
          onSaved={() => {
            load();
            onTaskChanged();
          }}
        />
      )}
    </>
  );
}
