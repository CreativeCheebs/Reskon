import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Empty, Segmented, Spin } from "antd";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import type { Dashboard, Widget } from "./types";
import { WidgetFrame } from "./WidgetFrame";

// Dashboards: a 12-column grid of widgets (40px rows, 8px margins). View
// only unless edit mode is on, so reading never drags a widget by accident.

const Grid = WidthProvider(GridLayout);

export function DashboardScreen({ id, onOpen }: { id?: number; onOpen: (id: number) => void }) {
  const { reloadKey } = useApp();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);

  const load = useCallback(async () => {
    try {
      setDashboards(await api.get<Dashboard[]>("/dashboards"));
    } catch (e) {
      message.error((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const current = dashboards?.find((d) => d.id === id) ?? dashboards?.[0];

  if (!dashboards) return <Spin style={{ margin: 40 }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Segmented
          value={current?.id}
          onChange={(v) => onOpen(Number(v))}
          options={dashboards.map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>
      {!current ? (
        <Alert type="info" message="No dashboards." />
      ) : (
        <DashboardGrid key={current.id} dashboard={current} />
      )}
    </div>
  );
}

function DashboardGrid({ dashboard }: { dashboard: Dashboard }) {
  const layout: Layout[] = useMemo(
    () => dashboard.widgets.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 2 })),
    [dashboard.widgets],
  );
  const byId = useMemo(() => new Map<string, Widget>(dashboard.widgets.map((w) => [String(w.id), w])), [dashboard.widgets]);
  if (dashboard.widgets.length === 0) return <Empty description="This dashboard has no widgets yet." />;
  return (
    <Grid
      className="jb-dashboard"
      layout={layout}
      cols={12}
      rowHeight={40}
      margin={[8, 8]}
      containerPadding={[0, 0]}
      isDraggable={false}
      isResizable={false}
      compactType="vertical"
    >
      {layout.map((l) => (
        <div key={l.i}>
          <WidgetFrame widget={byId.get(l.i)!} editing={false} />
        </div>
      ))}
    </Grid>
  );
}
