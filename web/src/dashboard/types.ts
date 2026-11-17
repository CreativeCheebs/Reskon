// Shapes of the dashboards and metrics API. Every number in a widget comes
// from GET /api/metrics; widgets only draw it.

export type Viz = "bar" | "line" | "cumulative" | "number" | "list" | "bands" | "split_bar" | "small_multiples" | "table" | "pie" | "share_bar" | "checklist";

export interface WidgetQuery {
  metric: string;
  group?: string;
  range?: string;
  from?: string;
  to?: string;
  filters?: Record<string, string | number | (string | number)[]>;
  split?: string | null;
  reduce?: string;
  /** Small multiples: running totals, one per series. */
  cumulative?: boolean;
  /** App page and app data widgets only (source "app_page" or "app_data"):
   *  the app's id and its widget's id, from the app's description file.
   *  Such a widget has no metric; an app data widget may have its feed's
   *  range and group (above). */
  app?: string;
  widget?: string;
  /** Board widgets only (source "view"): the saved view whose open tasks it shows. */
  view_id?: number;
}

export interface WidgetOptions {
  /** One colour for a chart with no split: a palette name or #rrggbb. */
  color?: string;
  /** Colours picked per series, by the series' key (#rrggbb). */
  series_colors?: Record<string, string>;
  /** Write each bar's and line point's value on the chart. */
  show_values?: boolean;
  /** Draw the average (from the server) as a dashed reference line. */
  show_average?: boolean;
  show_axis?: boolean;
  /** Narrower than this, the widget shows its number instead of a squashed chart. */
  min_width_px?: number;
}

/** Where a widget's content comes from: a metric, a connected app's data
 *  ("app_data", drawn by Reskon's charts), its own page ("app_page", whose
 *  viz is always "page"), or a saved view's open tasks ("view", a small
 *  board; its viz is always "board"), or the days' session notes ("journal",
 *  its viz is always "journal"; its query is only a range). */
export type WidgetSource = "metric" | "view" | "app_data" | "app_page" | "journal";

export interface Widget {
  id: number;
  dashboard_id: number;
  title: string | null;
  source: WidgetSource;
  viz: Viz;
  query: WidgetQuery;
  options: WidgetOptions;
  x: number;
  y: number;
  w: number;
  h: number;
  position: number;
}

export interface Dashboard {
  id: number;
  name: string;
  position: number;
  is_builtin: boolean;
  widgets: Widget[];
}

export interface MetricPoint {
  key: string;
  label: string;
  value: number;
  split?: string;
  detail?: string;
  /** Pies and share bars: this value's part of its whole (0..1), from the server. */
  share?: number;
}

export interface MetricSeries {
  key: string;
  label: string;
  color: string | null;
  /** This series alone, reduced by the server. */
  total: number;
  /** This series' mean per key, from the server (none for running totals). */
  average?: number;
}

export interface StateSpan {
  state_id: number;
  name: string;
  kind: "buff" | "debuff" | "modifier";
  from: string;
  to: string;
  started_on: string;
  cleared: boolean;
  severity: number;
  effective_severity: number;
}

export interface MetricResult {
  metric: string;
  unit: string;
  group: string;
  from: string;
  to: string;
  /** False: the metric ignores its range (a current state), so no dates are claimed. */
  ranged?: boolean;
  points: MetricPoint[];
  series: MetricSeries[];
  reduce: string;
  total: number;
  /** The mean of the per-key figures, from the server: the dashed reference line. None for running totals or no points. */
  average?: number;
  /** Points are running totals. */
  cumulative?: boolean;
  spans?: StateSpan[];
  meta?: Record<string, unknown>;
  // App data widgets only (GET /api/apps/data): the shape the app sent, its
  // own heading, a table's columns and rows, and when the app made the
  // answer. Stale: the app could not be asked, so this is Reskon's kept copy.
  shape?: "number" | "series" | "table" | "checklist" | "list";
  label?: string;
  table?: AppTable;
  fetched_at?: string;
  stale?: boolean;
  stale_reason?: string;
  /** The app's name, for the widget's own words ("Habits sent nothing to show"). */
  app_name?: string;
}

/** A table an app sent. Each row holds only the columns' keys. */
export interface AppTable {
  columns: { key: string; label: string; unit?: string }[];
  rows: Record<string, string | number | boolean | null>[];
}

export interface MetricDef {
  name: string;
  label: string;
  description: string;
  unit: string;
  groups: string[];
  splits: string[] | null;
  filters: string[] | null;
  reduce: string;
  ranged: boolean;
}

export interface MetricCatalog {
  metrics: MetricDef[];
  vizzes: Viz[];
  ranges: string[];
  reduces: string[];
  filter_values: Record<string, string[]>;
}

export const TIME_GROUPS = ["day", "week", "month"];

/** Narrowest width each viz draws well at; below it, the number fallback. */
export const MIN_WIDTH: Record<Viz, number> = {
  bar: 280,
  line: 280,
  cumulative: 280,
  split_bar: 320,
  small_multiples: 280,
  bands: 320,
  table: 260,
  list: 0,
  number: 0,
  pie: 0,
  share_bar: 320,
  checklist: 0,
};

/** Dates the dashboard's picker runs every widget over, instead of each widget's own range. */
export interface DateOverride {
  from: string;
  to: string;
}
