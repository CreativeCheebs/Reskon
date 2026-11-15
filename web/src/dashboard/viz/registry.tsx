import type { ReactNode } from "react";
import type { MetricResult, Viz, WidgetOptions } from "../types";
import { Chart } from "./Charts";
import { ListViz, NumberViz, TableViz } from "./Simple";
import { BandsViz } from "./Bands";
import { SmallMultiplesViz } from "./SmallMultiples";
import { PieViz } from "./Pie";

// Every way a widget can be drawn, in one list. A new chart type is one
// entry here (and its name in the server's WidgetVizzes); nothing else in
// the dashboard needs to change.

export interface DrawProps {
  res: MetricResult;
  options: WidgetOptions;
  /** The widget is narrower than this chart's minimum width. */
  narrow: boolean;
}

export interface VizEntry {
  draw: (p: DrawProps) => ReactNode;
  /** Its content can be taller than the widget, so the widget scrolls. */
  scrolls?: boolean;
  /** It draws something useful with no points (so no "no data" message). */
  drawsEmpty?: boolean;
  /** Too narrow, it draws itself smaller instead of becoming a single number. */
  keepsWhenNarrow?: boolean;
}

const chart = (viz: Viz): VizEntry => ({ draw: ({ res, options }) => <Chart res={res} viz={viz} options={options} /> });

export const VIZZES: Record<Viz, VizEntry> = {
  bar: chart("bar"),
  line: chart("line"),
  cumulative: chart("cumulative"),
  split_bar: chart("split_bar"),
  share_bar: chart("share_bar"),
  number: { draw: ({ res }) => <NumberViz res={res} />, drawsEmpty: true },
  list: { draw: ({ res }) => <ListViz res={res} />, scrolls: true },
  table: { draw: ({ res }) => <TableViz res={res} />, scrolls: true },
  bands: { draw: ({ res }) => <BandsViz res={res} />, drawsEmpty: true },
  pie: { draw: ({ res }) => <PieViz res={res} />, scrolls: true },
  // Small multiples fall back per type, never to one summed number.
  small_multiples: { draw: ({ res, narrow }) => <SmallMultiplesViz res={res} narrow={narrow} />, scrolls: true, keepsWhenNarrow: true },
};
