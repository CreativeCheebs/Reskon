import type { Viz } from "./types";

// Names of chart types and date ranges as the widget editors show them.

export const VIZ_LABEL: Record<Viz, string> = {
  bar: "Bars",
  line: "Line",
  cumulative: "Cumulative (only rises)",
  number: "Number",
  list: "List",
  bands: "Bands (states across days)",
  split_bar: "Stacked bars",
  small_multiples: "Small multiples (one chart per type)",
  table: "Table",
  pie: "Pie (each part's share)",
  share_bar: "Share bars (each day to 100%)",
  checklist: "Checklist (ticks, read-only)",
};

export const RANGE_LABEL: Record<string, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "Year",
  month: "This month",
  all: "All",
};
