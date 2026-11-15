// Shapes of the dashboards and metrics API. Every number in a widget comes
// from GET /api/metrics; widgets only draw it.

export type Viz = "bar" | "line" | "cumulative" | "number" | "list" | "bands" | "split_bar" | "small_multiples" | "table" | "pie" | "share_bar";

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
  /** App page widgets only (source "app_page"): the app's id and its page's
   *  id, from the app's description file. Such a widget has no metric. */
  app?: string;
  widget?: string;
}

export interface WidgetOptions {
  color?: string;
  show_axis?: boolean;
  /** Narrower than this, the widget shows its number instead of a squashed chart. */
  min_width_px?: number;
}

/** Where a widget's content comes from: a metric, or a connected app's own
 *  page ("app_page", whose viz is always "page"). "view" and "app_data" are
 *  planned (docs/next-phase.md section 0). */
export type WidgetSource = "metric" | "view" | "app_data" | "app_page";

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
  points: MetricPoint[];
  series: MetricSeries[];
  reduce: string;
  total: number;
  /** Points are running totals. */
  cumulative?: boolean;
  spans?: StateSpan[];
  meta?: Record<string, unknown>;
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
};

/** Dates the dashboard's picker runs every widget over, instead of each widget's own range. */
export interface DateOverride {
  from: string;
  to: string;
}
