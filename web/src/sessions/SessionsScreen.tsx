import { useCallback, useEffect, useState } from "react";
import { DatePicker, Popconfirm, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatHours, today } from "../format";
import { palette } from "../theme/palette";
import type { Session } from "../types";
import { SessionModal } from "./SessionModal";

// Sessions by day. Day totals are shown per energy type, with spend and
// restore in separate groups. Nothing combines them.

interface DayTotals {
  day: string;
  spend: { energy_type_id: number; name: string; hours: number }[];
  restore: { energy_type_id: number; name: string; hours: number }[];
}

export function SessionsScreen() {
  const { boot, reloadKey } = useApp();
  const [range, setRange] = useState<[string, string]>([dayjs().subtract(6, "day").format("YYYY-MM-DD"), today()]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [days, setDays] = useState<Record<string, DayTotals>>({});
  const [modal, setModal] = useState<{ editing?: Session } | null>(null);
  const [taskTitles, setTaskTitles] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const s = await api.get<Session[]>(`/sessions?from=${range[0]}&to=${range[1]}`);
      setSessions(s);
      const uniqueDays = [...new Set(s.map((x) => x.logged_for))];
      const totals = await Promise.all(uniqueDays.map((d) => api.get<DayTotals>(`/day/${d}`)));
      setDays(Object.fromEntries(totals.map((t) => [t.day, t])));
      const tasks = await api.get<{ id: number; title: string }[]>("/tasks");
      setTaskTitles(Object.fromEntries(tasks.map((t) => [t.id, t.title])));
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const energy = (id: number) => boot.energy_types.find((e) => e.id === id);
  const subtype = (id: number) => boot.subtypes.find((s) => s.id === id)?.name ?? `#${id}`;
  const byDay = [...new Set(sessions.map((s) => s.logged_for))];

  const remove = async (id: number) => {
    try {
      await api.del(`/sessions/${id}`);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <Space style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Sessions</div>
        <DatePicker.RangePicker
          size="small"
          allowClear={false}
          value={[dayjs(range[0]), dayjs(range[1])]}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0].format("YYYY-MM-DD"), v[1].format("YYYY-MM-DD")])}
        />
        <WriteButton type="primary" size="small" onClick={() => setModal({})}>
          Log time
        </WriteButton>
      </Space>
      {byDay.length === 0 && <Typography.Paragraph type="secondary">No sessions in this range.</Typography.Paragraph>}
      {byDay.map((day) => {
        const t = days[day];
        return (
          <div key={day} style={{ marginBottom: 18 }}>
            <Space wrap style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{dayjs(day).format("ddd D MMM")}</span>
              {t && t.spend.length > 0 && (
                <span style={{ color: palette.muted }}>
                  Spend:{" "}
                  {t.spend.map((x) => (
                    <Tag key={x.energy_type_id} color={energy(x.energy_type_id)?.color ?? undefined}>
                      {x.name} {formatHours(x.hours)}
                    </Tag>
                  ))}
                </span>
              )}
              {t && t.restore.length > 0 && (
                <span style={{ color: palette.muted }}>
                  Restore:{" "}
                  {t.restore.map((x) => (
                    <Tag key={x.energy_type_id} color={energy(x.energy_type_id)?.color ?? undefined}>
                      {x.name} {formatHours(x.hours)}
                    </Tag>
                  ))}
                </span>
              )}
            </Space>
            <Table<Session>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={sessions.filter((s) => s.logged_for === day)}
              onRow={(s) => ({ onClick: () => setModal({ editing: s }), style: { cursor: "pointer" } })}
              columns={[
                {
                  title: "What",
                  render: (_, s) => (s.task_id ? taskTitles[s.task_id] ?? `task #${s.task_id}` : s.label ?? "–"),
                },
                { title: "Kind", width: 70, render: (_, s) => (s.kind === "event" ? <Tag>event</Tag> : "work") },
                { title: "Energy", width: 120, render: (_, s) => energy(s.energy_type_id)?.name },
                { title: "Hours", width: 70, render: (_, s) => formatHours(s.hours) },
                { title: "Diff", width: 50, dataIndex: "difficulty" },
                {
                  title: "Subtypes",
                  render: (_, s) =>
                    s.subtypes.map((st) => (
                      <Tag key={st.rank} bordered={false}>
                        {subtype(st.subtype_id)} {formatHours(st.weighted_h)}
                      </Tag>
                    )),
                },
                { title: "Note", dataIndex: "note", ellipsis: true },
                {
                  title: "",
                  width: 70,
                  render: (_, s) => (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Popconfirm title="Delete this session?" onConfirm={() => remove(s.id)}>
                        <WriteButton size="small" type="text" danger>
                          Delete
                        </WriteButton>
                      </Popconfirm>
                    </span>
                  ),
                },
              ]}
            />
          </div>
        );
      })}
      {modal && <SessionModal editing={modal.editing} onClose={() => setModal(null)} onSaved={() => load()} />}
    </div>
  );
}
