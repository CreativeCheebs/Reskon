import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, DatePicker, Input, Popconfirm, Segmented, Space, Spin, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, SearchOutlined } from "@ant-design/icons";
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
import { FilterSelect, PageHeader, Toolbar, ToolbarGroup } from "../theme/Toolbar";
import { KIND_ICON, KindChip } from "./kind";
import { LoadError } from "../views/LoadError";
import { checkboxLabel } from "../a11y";
import { useTerms } from "../terms";
import { useTags } from "../tags/tags";
import { CopyMarkdownButton } from "../journal/CopyMarkdown";
import type { Journal } from "../journal/types";

// Sessions by day, with filters (applied on the server) and selection for
// bulk changes: tick rows, tick a day to take all of it, or select
// everything the filters show. Day totals are per energy type, in one list.
// Each day has Copy as Markdown: the text is made by the server (GET
// /api/journal). It is fetched for the shown dates (not again for each
// filter or search keystroke) so a click can copy at once; while it is not
// there (loading, a failed fetch, a change just made) the click asks the
// server for that day first, so the text copied is never an old one.

interface DayTotals {
  day: string;
  totals: { energy_type_id: number; name: string; hours: number }[];
}

interface Filters {
  energy: number[];
  areas: number[];
  tags: number[];
  kind: "" | "task" | "event";
  hasTask: "" | "true" | "false";
  hasDiff: "" | "true" | "false";
  hasSubtypes: "" | "true" | "false";
  q: string;
}

const NO_FILTERS: Filters = { energy: [], areas: [], tags: [], kind: "", hasTask: "", hasDiff: "", hasSubtypes: "", q: "" };

export function SessionsScreen() {
  const { tags, byId: tagById } = useTags();
  const { boot, reloadKey } = useApp();
  const T = useTerms();
  const [range, setRange] = useState<[string, string]>([dayjs().subtract(6, "day").format("YYYY-MM-DD"), today()]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [days, setDays] = useState<Record<string, DayTotals>>({});
  // Each shown day's journal text. Always the whole day, whatever the filters.
  // Empty while a new answer is on its way.
  const [markdown, setMarkdown] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ editing?: Session } | null>(null);
  const [tasks, setTasks] = useState<{ id: number; title: string; key: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadState, setLoadState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
  // Only the newest load may change the screen; a slow older one (for a range or filter
  // already left behind) is dropped.
  const loadSeq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() })), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoadState((st) => ({ ...st, loading: true }));
    const p = new URLSearchParams({ from: range[0], to: range[1] });
    if (filters.energy.length) p.set("energy_type", filters.energy.join(","));
    if (filters.areas.length) p.set("area", filters.areas.join(","));
    if (filters.tags.length) p.set("tag", filters.tags.join(","));
    if (filters.kind) p.set("kind", filters.kind);
    if (filters.hasTask) p.set("has_task", filters.hasTask);
    if (filters.hasDiff) p.set("has_difficulty", filters.hasDiff);
    if (filters.hasSubtypes) p.set("has_subtypes", filters.hasSubtypes);
    if (filters.q) p.set("q", filters.q);
    try {
      const s = await api.get<Session[]>(`/sessions?${p}`);
      if (seq !== loadSeq.current) return;
      setSessions(s);
      // Only act on what is visible: drop selected rows the filters now hide.
      const visible = new Set(s.map((x) => x.id));
      setSelected((sel) => new Set([...sel].filter((id) => visible.has(id))));
      const uniqueDays = [...new Set(s.map((x) => x.logged_for))];
      const totals = await Promise.all(uniqueDays.map((d) => api.get<DayTotals>(`/day/${d}`)));
      if (seq !== loadSeq.current) return;
      setDays(Object.fromEntries(totals.map((t) => [t.day, t])));
      setLoadState({ loading: false, error: null });
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setLoadState({ loading: false, error: (e as Error).message });
      message.error((e as Error).message);
    }
  }, [range, filters]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const journalSeq = useRef(0);
  const loadJournal = useCallback(async () => {
    const seq = ++journalSeq.current;
    setMarkdown({});
    try {
      const j = await api.get<Journal>(`/journal?from=${range[0]}&to=${range[1]}`);
      if (seq === journalSeq.current) setMarkdown(Object.fromEntries(j.days.map((d) => [d.day, d.markdown])));
    } catch {
      // The buttons then ask for their day when clicked.
    }
  }, [range]);
  useEffect(() => {
    loadJournal();
  }, [loadJournal, reloadKey]);
  // One day, asked for on a click when its text is not in hand.
  const dayMarkdown = useCallback(async (day: string) => {
    try {
      return (await api.get<Journal>(`/journal?from=${day}&to=${day}`)).days[0]?.markdown ?? null;
    } catch {
      return null;
    }
  }, []);
  // After a change made here: the days, and their text for copying.
  const changed = () => {
    load();
    loadJournal();
  };
  const loadTitles = useCallback(() => {
    api
      .get<{ id: number; title: string; key: string }[]>("/tasks?brief=1")
      .then((t) => setTasks(t.map(({ id, title, key }) => ({ id, title, key }))))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadTitles();
  }, [loadTitles, reloadKey]);

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
      changed();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  // One set of columns for every day's table; widths are kept in this browser.
  // Subtypes and Note only take a column while some shown session has them.
  const showSubtypes = sessions.some((s) => s.subtypes.length > 0);
  const showNote = sessions.some((s) => s.note);
  const sessionCols = useColumnWidths<Session>("sessions", [
    {
      key: "what",
      title: "What",
      render: (_, s) => (
        <span>
          {s.task_id ? titleOf.get(s.task_id) ?? `${T.task} #${s.task_id}` : s.label ?? "–"}
          {s.started_at && (
            <span style={{ color: palette.subtle, fontSize: 11 }}> · {dayjs(s.started_at).format("HH:mm")}</span>
          )}
        </span>
      ),
    },
    { key: "kind", title: "Kind", width: 84, render: (_, s) => <KindChip kind={s.kind} /> },
    {
      key: "energy",
      title: "Energy",
      width: 120,
      render: (_, s) =>
        s.energies?.length > 1
          ? s.energies.map((e) => `${energy(e.energy_type_id)?.name ?? "?"} ${Math.round(e.share * 100)}%`).join(" · ")
          : energy(s.energy_type_id)?.name,
    },
    { key: "area", title: "Area", width: 100, render: (_, s) => boot.areas.find((a) => a.id === s.area_id)?.name ?? "" },
    {
      key: "tags",
      title: "Tags",
      width: 140,
      // A flex row with a gap keeps tags apart when they wrap onto a second line.
      render: (_, s) => (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(s.tags ?? []).map((g) => (
            <Tag
              key={g.tag_id}
              style={{ marginInlineEnd: 0, ...(g.from_task ? { borderStyle: "dashed" } : {}) }}
              title={g.from_task ? "From the task" : "On this session"}
            >
              {tagById.get(g.tag_id)?.name}
            </Tag>
          ))}
        </span>
      ),
    },
    { key: "hours", title: "Hours", width: 70, render: (_, s) => formatHours(s.hours) },
    { key: "points", title: "Points", width: 64, render: (_, s) => (s.points === null ? "" : Number(s.points.toFixed(2))) },
    {
      key: "diff",
      title: (
        <Tooltip title="Level, 1 to 5. The lines and the number say it too, not just the colour.">
          Level
        </Tooltip>
      ),
      width: 92,
      render: (_, s) =>
        s.difficulty && (
          <Tooltip title={`Level ${s.difficulty} of 5`}>
            <span
              role="img"
              aria-label={`Level ${s.difficulty} of 5`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}
            >
              <DifficultyIcon level={s.difficulty} tip={false} />
              {s.difficulty}
            </span>
          </Tooltip>
        ),
    },
    ...(showSubtypes
      ? [
          {
            key: "subtypes",
            title: "Subtypes",
            render: (_: unknown, s: Session) =>
              (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {s.subtypes.map((st) => (
                    <Tag key={st.rank} bordered={false} style={{ marginInlineEnd: 0 }}>
                      {subtype(st.subtype_id)} {formatHours(st.weighted_h)}
                    </Tag>
                  ))}
                </span>
              ),
          },
        ]
      : []),
    ...(showNote ? [{ key: "note", title: "Note", dataIndex: "note", ellipsis: true }] : []),
    {
      title: "",
      width: 44,
      render: (_, s) => (
        <span className="jb-rowdel" role="presentation" onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title="Delete this session?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(s.id)}
          >
            <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Delete session: ${s.task_id ? titleOf.get(s.task_id) ?? `${T.task} #${s.task_id}` : s.label ?? `no ${T.task}`} on ${s.logged_for}`} />
          </Popconfirm>
        </span>
      ),
    },
  ]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        title="Sessions"
        end={
          <WriteButton type="primary" size="small" onClick={() => setModal({})}>
            Log time
          </WriteButton>
        }
      >
        <span role="group" aria-label="Date range">
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
        </span>
      </PageHeader>

      {/* Grouped like the board's toolbar: what is searched, which types and
          areas, then the session's properties. A group wraps whole. */}
      <Toolbar style={{ marginBottom: 12 }}>
        <ToolbarGroup>
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined />}
            placeholder={`Search label, note, ${T.task}`}
            style={{ width: 200 }}
            className={search ? "jb-active" : undefined}
            aria-label="Search sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Segmented
            size="small"
            aria-label={`${T.Tasks} or events`}
            value={filters.kind}
            onChange={(v) => setF("kind", v as Filters["kind"])}
            options={[
              { value: "", label: "All" },
              { value: "task", label: T.Task, icon: KIND_ICON.task },
              { value: "event", label: "Events", icon: KIND_ICON.event },
            ]}
          />
          {filtered && (
            <Button
              size="small"
              type="text"
              onClick={() => {
                setFilters(NO_FILTERS);
                setSearch("");
              }}
            >
              Reset filters
            </Button>
          )}
        </ToolbarGroup>
        <ToolbarGroup>
          <FilterSelect
            mode="multiple"
            allowClear
            placeholder="Energy type"
            aria-label="Filter by energy type"
            style={{ width: 150 }}
            active={filters.energy.length > 0}
            value={filters.energy}
            onChange={(v) => setF("energy", v)}
            options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))}
            maxTagCount="responsive"
          />
          <FilterSelect
            mode="multiple"
            allowClear
            placeholder="Area"
            aria-label="Filter by area"
            style={{ width: 130 }}
            active={filters.areas.length > 0}
            value={filters.areas}
            onChange={(v) => setF("areas", v)}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
            maxTagCount="responsive"
          />
          <FilterSelect
            mode="multiple"
            allowClear
            placeholder="Tags"
            aria-label="Filter by tag"
            style={{ width: 130 }}
            active={filters.tags.length > 0}
            value={filters.tags}
            onChange={(v) => setF("tags", v)}
            options={[{ value: 0, label: "No tags" }, ...tags.map((t) => ({ value: t.id, label: t.name }))]}
            maxTagCount="responsive"
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <FilterSelect
            style={{ width: 150 }}
            aria-label={`Filter by whether sessions are attached to ${T.tasks}`}
            active={filters.hasTask !== ""}
            value={filters.hasTask}
            onChange={(v) => setF("hasTask", v)}
            options={[
              { value: "", label: `With or without ${T.task}` },
              { value: "true", label: `Attached to ${T.task}` },
              { value: "false", label: "Not attached" },
            ]}
          />
          <FilterSelect
            style={{ width: 130 }}
            aria-label="Filter by whether a level is set"
            active={filters.hasDiff !== ""}
            value={filters.hasDiff}
            onChange={(v) => setF("hasDiff", v)}
            options={[
              { value: "", label: "Any level" },
              { value: "true", label: "Level set" },
              { value: "false", label: "Level not set" },
            ]}
          />
          <FilterSelect
            style={{ width: 130 }}
            aria-label="Filter by whether subtypes are set"
            active={filters.hasSubtypes !== ""}
            value={filters.hasSubtypes}
            onChange={(v) => setF("hasSubtypes", v)}
            options={[
              { value: "", label: "Any subtypes" },
              { value: "true", label: "Subtypes set" },
              { value: "false", label: "No subtypes" },
            ]}
          />
        </ToolbarGroup>
      </Toolbar>

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
        <BulkBar ids={[...selected]} tasks={tasks} onDone={changed} onClear={() => setSelected(new Set())} />
      )}

      {loadState.error && <LoadError message={loadState.error} onRetry={load} stale={sessions.length > 0} />}
      {byDay.length === 0 && loadState.loading && !loadState.error && <Spin />}
      {byDay.length === 0 && !loadState.loading && !loadState.error && (
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
                <span style={{ color: palette.muted, display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                  {t.totals.map((x) => (
                    <Lozenge key={x.energy_type_id} color={energy(x.energy_type_id)?.color}>
                      {x.name} {formatHours(x.hours)}
                    </Lozenge>
                  ))}
                </span>
              )}
              {filtered && <span style={{ color: palette.subtle, fontSize: 11 }}>(day totals and Copy as Markdown include all sessions)</span>}
              <CopyMarkdownButton day={day} markdown={markdown[day]} fetchMarkdown={() => dayMarkdown(day)} />
            </Space>
            <Table<Session>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={rows}
              // The header checkbox selects this whole day.
              rowSelection={{
                getCheckboxProps: (r) => checkboxLabel(`Select session: ${r.task_id ? titleOf.get(r.task_id) ?? `${T.task} #${r.task_id}` : r.label ?? `no ${T.task}`}`),
              selectedRowKeys: rows.filter((r) => selected.has(r.id)).map((r) => r.id),
                onChange: (keys) =>
                  setSelected((sel) => {
                    const next = new Set([...sel].filter((id) => !rows.some((r) => r.id === id)));
                    keys.forEach((k) => next.add(Number(k)));
                    return next;
                  }),
              }}
              onRow={(s) => ({
                onClick: () => setModal({ editing: s }),
                style: { cursor: "pointer" },
                // The same from the keyboard: Tab to a row, Enter or Space opens it.
                tabIndex: 0,
                onKeyDown: (e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setModal({ editing: s });
                  }
                },
              })}
              tableLayout="fixed"
              columns={sessionCols.columns}
              components={sessionCols.components}
            />
          </div>
        );
      })}
      {modal && <SessionModal editing={modal.editing} onClose={() => setModal(null)} onSaved={() => {
          changed();
          loadTitles(); // a task made from the form
        }} />}
    </div>
  );
}
