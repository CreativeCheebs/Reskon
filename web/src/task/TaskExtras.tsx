import { useEffect, useState } from "react";
import { Divider, Form, List, Tag, Typography } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatAge, formatDateTime, formatHM, formatHours } from "../format";
import { palette } from "../theme/palette";
import { SessionModal } from "../sessions/SessionModal";
import { CustomFieldsEditor } from "../fields/CustomFieldsEditor";
import { CycleFlow } from "../chart/CycleFlow";
import type { Segment, Session, Task, Transition } from "../types";

// Task panel sections below the core fields: sessions logged against the
// task, custom fields and cycle time.

export function TaskExtras({
  task,
  patch,
  onTaskChanged,
}: {
  task: Task;
  patch: (changes: Record<string, unknown>) => Promise<void>;
  onTaskChanged: () => void;
}) {
  const { boot, online } = useApp();
  const hasFields = boot.custom_fields.some((f) => f.entity === "task");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logging, setLogging] = useState<{ editing?: Session } | null>(null);
  const [history, setHistory] = useState(false);
  const [cycle, setCycle] = useState<{ transitions: Transition[]; segments: Segment[] } | null>(null);
  const statusName = (id: number | null) => (id === null ? "created" : boot.statuses.find((s) => s.id === id)?.name ?? "deleted status");

  const load = () =>
    api
      .get<Session[]>(`/sessions?task_id=${task.id}`)
      .then(setSessions)
      .catch(() => undefined);
  useEffect(() => {
    api
      .get<{ transitions: Transition[]; segments: Segment[] }>(`/tasks/${task.id}/transitions`)
      .then(setCycle)
      .catch(() => undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.updated_at]);

  return (
    <>
      {hasFields && (
        <>
          <Divider plain orientation="left" style={{ margin: "4px 0" }}>
            Fields
          </Divider>
          <Form layout="vertical" size="small">
            <CustomFieldsEditor
              entity="task"
              value={task.custom}
              disabled={!online}
              onChange={(k, v) => patch({ custom: { [k]: v } })}
            />
          </Form>
        </>
      )}
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Sessions · {formatHours(task.logged_h)}
      </Divider>
      <List
        size="small"
        dataSource={sessions}
        locale={{ emptyText: "Nothing logged yet" }}
        renderItem={(s) => (
          <List.Item
            style={{ cursor: "pointer", padding: "4px 0", gap: 16, justifyContent: "flex-start" }}
            onClick={() => setLogging({ editing: s })}
          >
            <span>{s.logged_for}</span>
            <span>{boot.energy_types.find((e) => e.id === s.energy_type_id)?.name}</span>
            <span>
              {s.kind === "event" && <Tag>event</Tag>}
              {formatHM(s.hours)}
            </span>
            <span style={{ color: palette.muted, flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[s.label, s.note].filter(Boolean).join(" · ")}
            </span>
          </List.Item>
        )}
      />
      <WriteButton size="small" onClick={() => setLogging({})}>
        Log time
      </WriteButton>
      <Divider plain orientation="left" style={{ margin: "4px 0" }}>
        Cycle time
      </Divider>
      {cycle && (
        <>
          <CycleFlow segments={cycle.segments} />
          <Typography.Link style={{ fontSize: 12, display: "inline-block", marginTop: 8 }} onClick={() => setHistory((h) => !h)}>
            {history ? "Hide" : "Show"} every move ({cycle.transitions.length})
          </Typography.Link>
          {history && (
            <List
              size="small"
              style={{ marginTop: 6 }}
              dataSource={[...cycle.transitions].reverse()}
              renderItem={(t) => (
                <List.Item style={{ padding: "2px 0", fontSize: 12 }}>
                  <span style={{ color: palette.muted }}>{formatDateTime(t.at)}</span>
                  <span>
                    {statusName(t.from_status_id)} → {statusName(t.to_status_id)}
                    {t.reason === "status_deleted" && <Tag style={{ marginLeft: 6 }}>status deleted</Tag>}
                  </span>
                  <span style={{ color: palette.muted, width: 50, textAlign: "right" }}>
                    {formatAge(cycle.segments.find((s) => s.from === t.at && s.status_id === t.to_status_id)?.hours)}
                  </span>
                </List.Item>
              )}
            />
          )}
        </>
      )}
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
