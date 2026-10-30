import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox, DatePicker, Input, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { formatHours, today } from "../format";
import { palette } from "../theme/palette";
import { Lozenge } from "../theme/Lozenge";
import type { Session } from "../types";
import { SessionModal } from "./SessionModal";
import { BulkBar } from "./BulkBar";
import { useColumnWidths } from "../views/useColumnWidths";
import { DifficultyIcon } from "../task/LevelIcons";

// Sessions by day, with filters (applied on the server) and selection for
// bulk changes: tick rows, tick a day to take all of it, or select
// everything the filters show. Day totals are per energy type, in one list.

interface DayTotals {
  day: string;
  totals: { energy_type_id: number; name: string; hours: number }[];
}

interface Filters {
  energy: number[];
  areas: number[];
  kind: "" | "task" | "event";
  hasTask: "" | "true" | "false";
  hasDiff: "" | "true" | "false";
  hasSubtypes: "" | "true" | "false";
  q: string;
}

const NO_FILTERS: Filters = { energy: [], areas: [], kind: "", hasTask: "", hasDiff: "", hasSubtypes: "", q: "" };

export function SessionsScreen() {
  const { boot, reloadKey } = useApp();
  const [range, setRange] = useState<[string, string]>([dayjs().subtract(6, "day").format("YYYY-MM-DD"), today()]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [days, setDays] = useState<Record<string, DayTotals>>({});
  const [modal, setModal] = useState<{ editing?: Session } | null>(null);
  const [tasks, setTasks] = useState<{ id: number; title: string; key: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() })), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ from: range[0], to: range[1] });
    if (filters.energy.length) p.set("energy_type", filters.energy.join(","));
    if (filters.areas.length) p.set("area", filters.areas.join(","));
    if (filters.kind) p.set("kind", filters.kind);
    if (filters.hasTask) p.set("has_task", filters.hasTask);
    if (filters.hasDiff) p.set("has_difficulty", filters.hasDiff);
    if (filters.hasSubtypes) p.set("has_subtypes", filters.hasSubtypes);
    if (filters.q) p.set("q", filters.q);
    try {
      const s = await api.get<Session[]>(`/sessions?${p}`);
      setSessions(s);
      // Only act on what is visible: drop selected rows the filters now hide.
      const visible = new Set(s.map((x) => x.id));
      setSelected((sel) => new Set([...sel].filter((id) => visible.has(id))));
      const uniqueDays = [...new Set(s.map((x) => x.logged_for))];
      const totals = await Promise.all(uniqueDays.map((d) => api.get<DayTotals>(`/day/${d}`)));
      setDays(Object.fromEntries(totals.map((t) => [t.day, t])));
    } catch (e) {
      message.error((e as Error).message);
    }
  }, [range, filters]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);
  useEffect(() => {
    api
      .get<{ id: number; title: string; key: string }[]>("/tasks?brief=1")
      .then((t) => setTasks(t.map(({ id, title, key }) => ({ id, title, key }))))
      .catch(() => undefined);
  }, [reloadKey]);

  const titleOf = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const energy = (id: number) => boot.energy_types.find((e) => e.id === id);
  const subtype = (id: number) => boot.subtypes.find((s) => s.id === id)?.name ?? `#${id}`;
  const byDay = [...new Set(sessions.map((s) => s.logged_for))];
  const allIds = sessions.map((s) => s.id);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const totalH = sessions.reduce((sum, s) => sum + s.hours, 0);

  const remove = async (id: number) => {
    try {
      await api.del(`/sessions/${id}`);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  // One set of columns for every day's table; widths are kept in this browser.
  const sessionCols = useColumnWidths<Session>("sessions", [
    {
      key: "what",
      title: "What",
      render: (_, s) => (s.task_id ? titleOf.get(s.task_id) ?? `task #${s.task_id}` : s.label ?? "–"),
    },
    { key: "kind", title: "Kind", width: 70, render: (_, s) => (s.kind === "event" ? <Tag>event</Tag> : "work") },
    { key: "energy", title: "Energy", width: 120, render: (_, s) => energy(s.energy_type_id)?.name },
    { key: "area", title: "Area", width: 100, render: (_, s) => boot.areas.find((a) => a.id === s.area_id)?.name ?? "" },
    { key: "hours", title: "Hours", width: 70, render: (_, s) => formatHours(s.hours) },
    { key: "points", title: "Points", width: 64, render: (_, s) => (s.points === null ? "" : Number(s.points.toFixed(2))) },
    {
      key: "diff",
      title: "Diff",
      width: 50,
      render: (_, s) => s.difficulty && <DifficultyIcon level={s.difficulty} />,
    },
    {
      key: "subtypes",
      title: "Subtypes",
      render: (_, s) =>
        s.subtypes.map((st) => (
          <Tag key={st.rank} bordered={false}>
            {subtype(st.subtype_id)} {formatHours(st.weighted_h)}
          </Tag>
        )),
    },
    { key: "note", title: "Note", dataIndex: "note", ellipsis: true },
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
  ]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <Space style={{ marginBottom: 10 }} wrap>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Sessions</div>
        <DatePicker.RangePicker
          size="small"
          allowClear={false}
          value={[dayjs(range[0]), dayjs(range[1])]}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0].format("YYYY-MM-DD"), v[1].format("YYYY-MM-DD")])}
          presets={[
            { label: "Today", value: [dayjs(), dayjs()] },
            { label: "Last 7 days", value: [dayjs().subtract(6, "day"), dayjs()] },
            { label: "Last 30 days", value: [dayjs().subtract(29, "day"), dayjs()] },
            { label: "This month", value: [dayjs().startOf("month"), dayjs()] },
            { label: "Last 12 months", value: [dayjs().subtract(1, "year"), dayjs()] },
            // Includes future dates: imported or planned sessions can be dated ahead.
            { label: "Everything", value: [dayjs("2000-01-01"), dayjs("2099-12-31")] },
          ]}
        />
        <WriteButton type="primary" size="small" onClick={() => setModal({})}>
          Log time
        </WriteButton>
      </Space>

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search label, note, task"
          style={{ width: 220 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size="small"
          mode="multiple"
          allowClear
          placeholder="Energy type"
          style={{ minWidth: 160 }}
          value={filters.energy}
          onChange={(v) => setF("energy", v)}
          options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
          maxTagCount="responsive"
        />
        <Select
          size="small"
          mode="multiple"
          allowClear
          placeholder="Area"
          style={{ minWidth: 140 }}
          value={filters.areas}
          onChange={(v) => setF("areas", v)}
          options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          maxTagCount="responsive"
        />
        <Select
          size="small"
          style={{ width: 130 }}
          value={filters.kind}
          onChange={(v) => setF("kind", v)}
          options={[
            { value: "", label: "Work and events" },
            { value: "task", label: "Work only" },
            { value: "event", label: "Events only" },
          ]}
        />
        <Select
          size="small"
          style={{ width: 150 }}
          value={filters.hasTask}
          onChange={(v) => setF("hasTask", v)}
          options={[
            { value: "", label: "With or without task" },
            { value: "true", label: "Attached to a task" },
            { value: "false", label: "Not attached" },
          ]}
        />
        <Select
          size="small"
          style={{ width: 160 }}
          value={filters.hasDiff}
          onChange={(v) => setF("hasDiff", v)}
          options={[
            { value: "", label: "Any difficulty" },
            { value: "true", label: "Difficulty set" },
            { value: "false", label: "Difficulty not set" },
          ]}
        />
        <Select
          size="small"
          style={{ width: 160 }}
          value={filters.hasSubtypes}
          onChange={(v) => setF("hasSubtypes", v)}
          options={[
            { value: "", label: "Any subtypes" },
            { value: "true", label: "Subtypes set" },
            { value: "false", label: "No subtypes" },
          ]}
        />
        {filtered && (
          <a
            onClick={() => {
              setFilters(NO_FILTERS);
              setSearch("");
            }}
          >
            Clear filters
          </a>
        )}
      </Space>

      {sessions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Checkbox
            checked={selected.size > 0 && selected.size === allIds.length}
            indeterminate={selected.size > 0 && selected.size < allIds.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
          >
            Select all {allIds.length} shown
          </Checkbox>
          <span style={{ color: palette.muted, fontSize: 12 }}>· {formatHours(totalH)} in total</span>
        </div>
      )}

      {selected.size > 0 && (
        <BulkBar ids={[...selected]} tasks={tasks} onDone={load} onClear={() => setSelected(new Set())} />
      )}

      {byDay.length === 0 && (
        <Typography.Paragraph type="secondary">{filtered ? "No sessions match these filters." : "No sessions in this range."}</Typography.Paragraph>
      )}
      {byDay.map((day) => {
        const t = days[day];
        const rows = sessions.filter((s) => s.logged_for === day);
        return (
          <div key={day} style={{ marginBottom: 18 }}>
            <Space wrap style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{dayjs(day).format("ddd D MMM YYYY")}</span>
              {t && t.totals.length > 0 && (
                <span style={{ color: palette.muted }}>
                  {t.totals.map((x) => (
                    <Lozenge key={x.energy_type_id} color={energy(x.energy_type_id)?.color}>
                      {x.name} {formatHours(x.hours)}
                    </Lozenge>
                  ))}
                </span>
              )}
              {filtered && <span style={{ color: palette.subtle, fontSize: 11 }}>(day totals include all sessions)</span>}
            </Space>
            <Table<Session>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={rows}
              // The header checkbox selects this whole day.
              rowSelection={{
                selectedRowKeys: rows.filter((r) => selected.has(r.id)).map((r) => r.id),
                onChange: (keys) =>
                  setSelected((sel) => {
                    const next = new Set([...sel].filter((id) => !rows.some((r) => r.id === id)));
                    keys.forEach((k) => next.add(Number(k)));
                    return next;
                  }),
              }}
              onRow={(s) => ({ onClick: () => setModal({ editing: s }), style: { cursor: "pointer" } })}
              tableLayout="fixed"
              columns={sessionCols.columns}
              components={sessionCols.components}
            />
          </div>
        );
      })}
      {modal && <SessionModal editing={modal.editing} onClose={() => setModal(null)} onSaved={() => load()} />}
    </div>
  );
}
