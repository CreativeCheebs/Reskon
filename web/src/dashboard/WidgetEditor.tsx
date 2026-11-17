import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Checkbox, DatePicker, Form, Input, Modal, Segmented, Select } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { palette } from "../theme/palette";
import type { TaskBrief } from "../types";
import type { MetricCatalog, MetricDef, Viz, Widget, WidgetOptions, WidgetQuery } from "./types";
import { TIME_GROUPS } from "./types";
import { useMetric, VizBody } from "./WidgetFrame";
import { useTerms } from "../terms";
import { useTags } from "../tags/tags";
import { AppPageEditor } from "./AppPageEditor";
import { AppDataEditor } from "./AppDataEditor";
import { ViewBoardEditor } from "./ViewBoardEditor";
import { JournalEditor } from "./JournalEditor";
import { ChartColors } from "./ChartColors";
import { RANGE_LABEL, VIZ_LABEL } from "./labels";
import { CUSTOM_RANGE, rangeChoice, withDates, withRangeChoice } from "./customRange";
import dayjs from "dayjs";

// Builds a widget from the metrics catalog: only metrics, groupings, splits
// and filters the server lists are offered, so nothing built here can be
// refused. A live preview runs the query as it is edited. A new widget can
// instead be a connected app's data (AppDataEditor.tsx) or page
// (AppPageEditor.tsx), a view's open tasks as a board (ViewBoardEditor.tsx), or
// a journal of the days' session notes (JournalEditor.tsx).

const GROUP_LABEL: Record<string, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  area: "Area",
  subtype: "Subtype",
  energy_type: "Energy type",
  session: "Session",
  status: "Status",
  task: "Task",
  kind: "Kind",
  name: "Name",
  now: "Now",
};

const CHART_VIZZES: Viz[] = ["bar", "line", "cumulative", "split_bar", "small_multiples", "share_bar"];

let catalogCache: Promise<MetricCatalog> | null = null;
function loadCatalog() {
  catalogCache ??= api.get<MetricCatalog>("/metrics/catalog").catch((e) => {
    catalogCache = null;
    throw e;
  });
  return catalogCache;
}

type Filters = Record<string, (string | number)[]>;

function asList(v: unknown): (string | number)[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v as string | number];
}

/** The query string for a preview: the same query a saved widget runs. */
export function metricPath(q: WidgetQuery, viz: Viz): string {
  const p = new URLSearchParams({ metric: q.metric });
  if (q.group) p.set("group", q.group);
  if (q.from && q.to) {
    p.set("from", q.from);
    p.set("to", q.to);
  } else if (q.range) p.set("range", q.range);
  if (q.split) p.set("split", q.split);
  if (q.reduce) p.set("reduce", q.reduce);
  if (viz === "cumulative" || (viz === "small_multiples" && q.cumulative)) p.set("cumulative", "1");
  if (viz === "pie" || viz === "share_bar") p.set("share", "1");
  for (const [k, v] of Object.entries(q.filters ?? {})) {
    const list = asList(v);
    if (list.length) p.set(`filters[${k}]`, list.join(","));
  }
  return `/metrics?${p}`;
}

interface EditorProps {
  dashboardId: number;
  editing?: Widget;
  onClose: () => void;
  onSaved: (w: Widget) => void;
}

type Kind = "metric" | "view" | "app_data" | "app_page" | "journal";

/** Adds or edits a widget. A new one can be a chart, a board, an app's data
 *  or an app's page; an existing one opens the editor for its own source. */
export function WidgetEditor(props: EditorProps) {
  const own = props.editing?.source;
  const [kind, setKind] = useState<Kind>(own === "app_page" || own === "app_data" || own === "view" || own === "journal" ? own : "metric");
  const [switched, setSwitched] = useState(false);
  const switcher = props.editing ? undefined : (
    <div role="group" aria-label="Kind of widget">
    <Segmented<Kind>
      value={kind}
      onChange={(k) => {
        setKind(k);
        setSwitched(true);
      }}
      options={[
        { value: "metric", label: "Chart" },
        { value: "view", label: "Board" },
        { value: "journal", label: "Journal" },
        { value: "app_data", label: "App data" },
        { value: "app_page", label: "App page" },
      ]}
      style={{ marginBottom: 14 }}
    />
    </div>
  );
  return kind === "view" ? (
    <ViewBoardEditor {...props} switcher={switcher} animate={!switched} />
  ) : kind === "journal" ? (
    <JournalEditor {...props} switcher={switcher} animate={!switched} />
  ) : kind === "app_page" ? (
    <AppPageEditor {...props} switcher={switcher} animate={!switched} />
  ) : kind === "app_data" ? (
    <AppDataEditor {...props} switcher={switcher} animate={!switched} />
  ) : (
    <MetricWidgetEditor {...props} switcher={switcher} animate={!switched} />
  );
}

function MetricWidgetEditor({
  dashboardId,
  editing,
  onClose,
  onSaved,
  switcher,
  animate,
}: EditorProps & { switcher?: ReactNode; animate: boolean }) {
  const { boot, online } = useApp();
  const T = useTerms();
  const { tags } = useTags();
  const groupLabel = (g: string) => (g === "task" ? T.Task : GROUP_LABEL[g] ?? g);
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null);
  const [tasks, setTasks] = useState<TaskBrief[]>([]);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [viz, setViz] = useState<Viz>(editing?.viz ?? "bar");
  const [query, setQuery] = useState<WidgetQuery>(editing?.query ?? { metric: "points", group: "day", range: "30d" });
  const [options, setOptions] = useState<WidgetOptions>(editing?.options ?? {});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch((e) => message.error((e as Error).message));
  }, []);
  const metric: MetricDef | undefined = catalog?.metrics.find((m) => m.name === query.metric);
  // Small multiples and share bars draw one series per split value, so
  // picking them splits by energy type when nothing else is chosen; a pie
  // groups by energy type unless it already groups by something not in time.
  // Running totals belong to small multiples only.
  const pickViz = (v: Viz) => {
    setViz(v);
    const next = { ...query, cumulative: v === "small_multiples" ? query.cumulative : undefined };
    if ((v === "small_multiples" || v === "share_bar") && !query.split && metric?.splits?.includes("energy_type") && TIME_GROUPS.includes(query.group ?? "")) {
      next.split = "energy_type";
    }
    if (v === "pie" && TIME_GROUPS.includes(query.group ?? "") && metric?.groups.includes("energy_type")) {
      next.group = "energy_type";
      next.split = null;
    }
    setQuery(next);
  };
  useEffect(() => {
    if (metric?.filters?.includes("task_id") && tasks.length === 0) {
      api.get<TaskBrief[]>("/tasks?brief=1").then(setTasks).catch(() => undefined);
    }
  }, [metric, tasks.length]);

  const filters: Filters = useMemo(() => {
    const out: Filters = {};
    for (const [k, v] of Object.entries(query.filters ?? {})) out[k] = asList(v);
    return out;
  }, [query.filters]);
  const setFilter = (k: string, v: (string | number)[]) => {
    const next = { ...filters, [k]: v };
    if (!v.length) delete next[k];
    setQuery({ ...query, filters: next });
  };

  // Changing metric keeps only what the new metric allows.
  const pickMetric = (name: string) => {
    const m = catalog?.metrics.find((x) => x.name === name);
    if (!m) return;
    const keep: Filters = {};
    for (const [k, v] of Object.entries(filters)) if (m.filters?.includes(k)) keep[k] = v;
    setQuery({
      metric: name,
      group: m.groups.includes(query.group ?? "") ? query.group : m.groups[0],
      range: query.range,
      from: query.from,
      to: query.to,
      split: m.splits?.includes(query.split ?? "") ? query.split : null,
      filters: keep,
      cumulative: query.cumulative,
    });
  };

  const kindValues =
    query.metric === "state_days" ? ["buff", "debuff", "modifier"] : ["task", "event"];

  const previewPath = metric ? metricPath(query, viz) : null;
  const [debounced, setDebounced] = useState(previewPath);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(previewPath), 250);
    return () => window.clearTimeout(t);
  }, [previewPath]);
  const preview = useMetric(debounced);

  const save = async () => {
    setBusy(true);
    try {
      const body = { title: title.trim() || null, viz, query: { ...query, filters }, options };
      const w = editing
        ? await api.patch<Widget>(`/widgets/${editing.id}`, body)
        : await api.post<Widget>("/widgets", { ...body, dashboard_id: dashboardId, x: 0, w: viz === "number" ? 3 : 6, h: viz === "number" ? 3 : 6 });
      onSaved(w);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const item = { style: { marginBottom: 10 } };
  return (
    <Modal
      open
      width={920}
      title={editing ? "Edit widget" : "Add widget"}
      okText="Save"
      onOk={save}
      onCancel={onClose}
      okButtonProps={{ loading: busy, disabled: !online || !metric || !!preview.error }}
      {...(animate ? {} : { transitionName: "", maskTransitionName: "" })}
    >
      {switcher}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
        <Form layout="vertical" size="small">
          <Form.Item label="Title" htmlFor="metric-title" {...item}>
            <Input id="metric-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={metric?.label} />
          </Form.Item>
          <Form.Item label="Measure" htmlFor="metric-measure" {...item} extra={metric?.description}>
            <Select
              id="metric-measure"
              value={query.metric}
              onChange={pickMetric}
              options={catalog?.metrics.map((m) => ({ value: m.name, label: m.label }))}
              loading={!catalog}
            />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Form.Item label="Show as" htmlFor="metric-viz" {...item}>
              <Select id="metric-viz" value={viz} onChange={pickViz} options={(catalog?.vizzes ?? []).map((v) => ({ value: v, label: VIZ_LABEL[v] }))} />
            </Form.Item>
            <Form.Item label="Group by" htmlFor="metric-group" {...item}>
              <Select
                id="metric-group"
                value={query.group}
                onChange={(group) =>
                  setQuery({ ...query, group, split: TIME_GROUPS.concat("task").includes(group) && group !== query.split ? query.split : null })
                }
                options={metric?.groups.map((g) => ({ value: g, label: groupLabel(g) }))}
              />
            </Form.Item>
            {metric?.ranged && (
              <Form.Item label="Range" htmlFor="metric-range" {...item}>
                <Select
                  id="metric-range"
                  value={rangeChoice(query)}
                  onChange={(choice) => setQuery(withRangeChoice(query, choice, dayjs().format("YYYY-MM-DD")))}
                  options={[
                    ...(catalog?.ranges.map((r) => ({ value: r, label: RANGE_LABEL[r] ?? r })) ?? []),
                    { value: CUSTOM_RANGE, label: "Custom dates…" },
                  ]}
                />
              </Form.Item>
            )}
            {metric?.ranged && rangeChoice(query) === CUSTOM_RANGE && (
              <Form.Item label="Dates" htmlFor="metric-dates" {...item}>
                <DatePicker.RangePicker
                  id={{ start: "metric-dates", end: "metric-dates-end" }}
                  allowClear={false}
                  value={[dayjs(query.from), dayjs(query.to)]}
                  onChange={(v) => v?.[0] && v[1] && setQuery(withDates(query, v[0].format("YYYY-MM-DD"), v[1].format("YYYY-MM-DD")))}
                />
              </Form.Item>
            )}
            {CHART_VIZZES.includes(viz) && (metric?.splits?.length ?? 0) > 0 && TIME_GROUPS.concat("task").includes(query.group ?? "") && (
              <Form.Item label="Split by" htmlFor="metric-split" {...item}>
                <Select
                  id="metric-split"
                  allowClear
                  placeholder="No split"
                  value={query.split ?? undefined}
                  onChange={(split) => setQuery({ ...query, split: split ?? null })}
                  options={metric?.splits?.filter((s) => s !== query.group).map((s) => ({ value: s, label: groupLabel(s) }))}
                />
              </Form.Item>
            )}
            {viz === "small_multiples" && (
              <Form.Item label="Running total" {...item}>
                <Checkbox checked={!!query.cumulative} onChange={(e) => setQuery({ ...query, cumulative: e.target.checked || undefined })}>
                  Each chart only rises
                </Checkbox>
              </Form.Item>
            )}
            {viz === "number" && (
              <Form.Item label="Figure" htmlFor="metric-figure" {...item}>
                <Select
                  id="metric-figure"
                  value={query.reduce ?? ""}
                  onChange={(reduce) => setQuery({ ...query, reduce: reduce || undefined })}
                  options={[
                    { value: "", label: `Default (${metric?.reduce ?? "sum"})` },
                    { value: "sum", label: "Total" },
                    { value: "nonzero", label: "Days or rows with any" },
                    { value: "max", label: "Largest" },
                    { value: "last", label: "Latest" },
                    { value: "count", label: "Number of rows" },
                  ]}
                />
              </Form.Item>
            )}
          </div>
          {CHART_VIZZES.includes(viz) && (
            <ChartColors series={preview.res?.series ?? []} options={options} onChange={setOptions} />
          )}
          {metric?.filters?.includes("area") && (
            <Form.Item label="Areas" htmlFor="metric-areas" {...item}>
              <Select id="metric-areas" mode="multiple" allowClear placeholder="All" value={filters.area?.map(Number)} onChange={(v) => setFilter("area", v)}
                options={boot.areas.map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
          )}
          {metric?.filters?.includes("energy_type") && (
            <Form.Item label="Energy types" htmlFor="metric-energy" {...item}>
              <Select id="metric-energy" mode="multiple" allowClear placeholder="All" value={filters.energy_type?.map(Number)} onChange={(v) => setFilter("energy_type", v)}
                options={boot.energy_types.map((e) => ({ value: e.id, label: e.name }))} />
            </Form.Item>
          )}
          {metric?.filters?.includes("subtype") && boot.subtypes.length > 0 && (
            <Form.Item label="Subtypes" htmlFor="metric-subtypes" {...item}>
              <Select id="metric-subtypes" mode="multiple" allowClear placeholder="All" value={filters.subtype?.map(Number)} onChange={(v) => setFilter("subtype", v)}
                options={boot.subtypes.map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          )}
          {metric?.filters?.includes("tag") && (
            <Form.Item label="Tags" htmlFor="metric-tags" {...item}>
              <Select id="metric-tags" mode="multiple" allowClear placeholder="All" value={filters.tag?.map(Number)} onChange={(v) => setFilter("tag", v)}
                options={[{ value: 0, label: "No tags" }, ...tags.map((g) => ({ value: g.id, label: g.name }))]} />
            </Form.Item>
          )}
          {metric?.filters?.includes("status") && (
            <Form.Item label="Statuses" htmlFor="metric-statuses" {...item}>
              <Select id="metric-statuses" mode="multiple" allowClear placeholder="All" value={filters.status?.map(Number)} onChange={(v) => setFilter("status", v)}
                options={boot.statuses.map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          )}
          {metric?.filters?.includes("kind") && (
            <Form.Item label="Kind" htmlFor="metric-kind" {...item}>
              <Select id="metric-kind" mode="multiple" allowClear placeholder="All" value={filters.kind as string[] | undefined} onChange={(v) => setFilter("kind", v)}
                options={kindValues.map((k) => ({ value: k, label: k === "task" ? T.task : k }))} />
            </Form.Item>
          )}
          {metric?.filters?.includes("task_id") && (
            <Form.Item label={T.Tasks} htmlFor="metric-tasks" {...item}>
              <Select id="metric-tasks" mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="All" value={filters.task_id?.map(Number)}
                onChange={(v) => setFilter("task_id", v)} options={tasks.map((t) => ({ value: t.id, label: t.title }))} />
            </Form.Item>
          )}
        </Form>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ color: palette.subtle, fontSize: 12, marginBottom: 6 }}>Preview</div>
          <div
            style={{
              height: 300,
              display: "flex",
              flexDirection: "column",
              background: palette.panel,
              border: `1px solid ${palette.border}`,
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{title || metric?.label}</div>
            {preview.error ? (
              <Alert type="warning" showIcon message={preview.error} />
            ) : preview.res ? (
              <VizBody widget={{ viz, options }} res={preview.res} />
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
