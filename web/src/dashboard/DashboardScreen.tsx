import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input, Popconfirm, Segmented, Spin, Tooltip } from "antd";
import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { palette } from "../theme/palette";
import type { Dashboard, DateOverride, Widget } from "./types";
import { DatesPicker, type DatesMode } from "./DatesPicker";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetEditor } from "./WidgetEditor";

// Dashboards: a 12-column grid of widgets (40px rows, 8px margins). View
// only by default, so reading never drags a widget by accident; edit mode
// is a toggle. Positions save once, on drop. Under 768px the same widgets
// stack in one column in their saved order, with no editing at all. The
// date picker runs every widget over one day or a span of dates; it stays
// set while switching dashboards.

const Grid = WidthProvider(GridLayout);
const MOBILE_PX = 768;
// A toolbar down the left side needs room: below this width it goes on top.
const LEFT_TOOLBAR_MIN_PX = 1000;

function useWindowBelow(px: number) {
  const [below, setBelow] = useState(() => window.innerWidth < px);
  useEffect(() => {
    const on = () => setBelow(window.innerWidth < px);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [px]);
  return below;
}

export function DashboardScreen({ id, onOpen }: { id?: number; onOpen: (id: number) => void }) {
  const { reloadKey, boot } = useApp();
  const narrow = useWindowBelow(MOBILE_PX);
  const tight = useWindowBelow(LEFT_TOOLBAR_MIN_PX);
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editor, setEditor] = useState<{ widget?: Widget } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [datesMode, setDatesMode] = useState<DatesMode>("own");
  const [dates, setDates] = useState<DateOverride | null>(null);
  const editing = editMode && !narrow;
  // Settings › Screens: the toolbar sits at the top or down the left side. Phones and windows under 1000px keep it on top.
  const left = boot.settings.dashboard_toolbar === "left" && !narrow && !tight;

  // Only the newest answer counts: a reload answered after a save made
  // here must not put the old layout back (replace() bumps it too).
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const all = await api.get<Dashboard[]>("/dashboards");
      if (n === seq.current) setDashboards(all);
    } catch (e) {
      message.error((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const current = dashboards?.find((d) => d.id === id) ?? dashboards?.[0];
  const replace = (d: Dashboard) => {
    seq.current++;
    setDashboards((all) => all?.map((x) => (x.id === d.id ? d : x)) ?? all);
  };
  const replaceWidget = (w: Widget) =>
    setDashboards((all) =>
      all?.map((d) =>
        d.id !== w.dashboard_id
          ? d
          : { ...d, widgets: d.widgets.some((x) => x.id === w.id) ? d.widgets.map((x) => (x.id === w.id ? w : x)) : [...d.widgets, w] },
      ) ?? all,
    );

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const newDashboard = () =>
    run(async () => {
      const d = await api.post<Dashboard>("/dashboards", { name: "New dashboard" });
      setDashboards((all) => [...(all ?? []), d]);
      onOpen(d.id);
      setEditMode(true);
      setRenaming(d.name);
    });
  const rename = (name: string) =>
    run(async () => {
      setRenaming(null);
      if (!current || !name.trim() || name === current.name) return;
      replace(await api.patch<Dashboard>(`/dashboards/${current.id}`, { name: name.trim() }));
    });
  const deleteDashboard = () =>
    run(async () => {
      if (!current) return;
      await api.del(`/dashboards/${current.id}`);
      const rest = (dashboards ?? []).filter((d) => d.id !== current.id);
      setDashboards(rest);
      if (rest[0]) onOpen(rest[0].id);
    });
  const deleteWidget = (w: Widget) =>
    run(async () => {
      await api.del(`/widgets/${w.id}`);
      setDashboards((all) => all?.map((d) => (d.id === w.dashboard_id ? { ...d, widgets: d.widgets.filter((x) => x.id !== w.id) } : d)) ?? all);
    });
  const saveLayout = (layout: Layout[]) =>
    run(async () => {
      if (!current) return;
      const before = new Map(current.widgets.map((w) => [String(w.id), w]));
      const changed = layout.some((l) => {
        const w = before.get(l.i);
        return w && (w.x !== l.x || w.y !== l.y || w.w !== l.w || w.h !== l.h);
      });
      if (!changed) return;
      const items = layout.map((l) => ({ id: Number(l.i), x: l.x, y: l.y, w: l.w, h: l.h }));
      replace(await api.patch<Dashboard>(`/dashboards/${current.id}/layout`, { items }));
    });

  if (!dashboards) return <Spin style={{ margin: 40 }} />;
  return (
    <div style={{ display: "flex", flexDirection: left ? "row" : "column", alignItems: left ? "flex-start" : undefined, gap: 10, minHeight: 0 }}>
      {/* The dashboard's name is the chosen tab below, so there is no big title: its room goes to the widgets. */}
      <div
        className="jb-dashboard-toolbar"
        data-position={left ? "left" : "top"}
        style={
          left
            ? { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, flex: "none", width: 262, boxSizing: "border-box" }
            : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
        }
      >
        {editing && renaming !== null ? (
          <Input
            autoFocus
            size="small"
            style={{ width: 220 }}
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onPressEnter={() => rename(renaming)}
            onBlur={() => rename(renaming)}
          />
        ) : (
          <Segmented
            size="small"
            vertical={left}
            value={current?.id}
            onChange={(v) => onOpen(Number(v))}
            options={dashboards.map((d) => ({ value: d.id, label: d.name }))}
            style={left ? { maxHeight: "60vh", overflowY: "auto" } : { overflowX: "auto" }}
          />
        )}
        <DatesPicker
          mode={datesMode}
          dates={dates}
          onChange={(m, d) => {
            setDatesMode(m);
            setDates(d);
          }}
        />
        {!left && <span style={{ flex: 1 }} />}
        {editing && current && (
          <>
            <WriteButton size="small" icon={<PlusOutlined />} onClick={() => setEditor({})}>
              Add widget
            </WriteButton>
            <WriteButton size="small" onClick={() => setRenaming(current.name)}>
              Rename
            </WriteButton>
            <Popconfirm title={`Delete "${current.name}"?`} description="Its widgets go with it." onConfirm={deleteDashboard} okText="Delete">
              <WriteButton size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
            <WriteButton size="small" onClick={newDashboard}>
              New dashboard
            </WriteButton>
          </>
        )}
        {!narrow && (
          <Tooltip title={editing ? undefined : "Move, resize, add and remove widgets"}>
            <Button size="small" aria-pressed={editing} type={editing ? "primary" : "default"} icon={editing ? <CheckOutlined /> : <EditOutlined />} onClick={() => setEditMode(!editMode)}>
              {editing ? "Done" : "Edit"}
            </Button>
          </Tooltip>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
      {!current ? (
        <Empty description="No dashboards.">
          <WriteButton onClick={newDashboard}>New dashboard</WriteButton>
        </Empty>
      ) : current.widgets.length === 0 ? (
        <Empty description="This dashboard has no widgets yet.">
          {!narrow && (
            <WriteButton
              onClick={() => {
                setEditMode(true);
                setEditor({});
              }}
            >
              Add widget
            </WriteButton>
          )}
        </Empty>
      ) : narrow ? (
        <Stack dashboard={current} dates={dates} />
      ) : (
        <DashboardGrid
          key={current.id}
          dashboard={current}
          editing={editing}
          dates={dates}
          onLayout={saveLayout}
          onEdit={(widget) => setEditor({ widget })}
          onDelete={deleteWidget}
        />
      )}
      </div>
      {editor && current && (
        <WidgetEditor dashboardId={current.id} editing={editor.widget} onClose={() => setEditor(null)} onSaved={replaceWidget} />
      )}
    </div>
  );
}

function DashboardGrid({
  dashboard,
  editing,
  dates,
  onLayout,
  onEdit,
  onDelete,
}: {
  dashboard: Dashboard;
  editing: boolean;
  dates: DateOverride | null;
  onLayout: (l: Layout[]) => void;
  onEdit: (w: Widget) => void;
  onDelete: (w: Widget) => void;
}) {
  const layout: Layout[] = useMemo(
    () => dashboard.widgets.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 2 })),
    [dashboard.widgets],
  );
  const byId = useMemo(() => new Map<string, Widget>(dashboard.widgets.map((w) => [String(w.id), w])), [dashboard.widgets]);
  return (
    <>
      <style>{`
        .jb-dashboard .react-grid-item.react-grid-placeholder { background: ${palette.accent}; opacity: 0.15; border-radius: 8px; }
        .jb-dashboard .react-grid-item > .react-resizable-handle::after { border-color: ${palette.subtle}; }
      `}</style>
      <Grid
        className="jb-dashboard"
        layout={layout}
        cols={12}
        rowHeight={40}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        resizeHandles={["se"]}
        draggableCancel=".no-drag"
        compactType="vertical"
        onDragStop={onLayout}
        onResizeStop={onLayout}
      >
        {layout.map((l) => (
          <div key={l.i}>
            <WidgetFrame widget={byId.get(l.i)!} editing={editing} dates={dates} onEdit={onEdit} onDelete={onDelete} />
          </div>
        ))}
      </Grid>
    </>
  );
}

/** Phones: one column, saved order, each widget at a height its kind suits. */
function Stack({ dashboard, dates }: { dashboard: Dashboard; dates: DateOverride | null }) {
  const widgets = [...dashboard.widgets].sort((a, b) => a.position - b.position);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {widgets.map((w) => (
        // Small multiples become a vertical stack as tall as their types need.
        <div key={w.id} style={{ height: w.viz === "number" ? 130 : w.viz === "bands" ? Math.max(130, w.h * 48) : w.viz === "small_multiples" ? undefined : 300 }}>
          <WidgetFrame widget={w} editing={false} dates={dates} />
        </div>
      ))}
    </div>
  );
}
