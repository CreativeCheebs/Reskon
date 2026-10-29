import { useState } from "react";
import { Drawer, Form, InputNumber, Select, Space, Switch } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { TypeLabel, TypeIcon } from "../task/TypeIcon";
import { useEpics } from "../task/useEpics";
import { CustomFilterEditor } from "./CustomFilterEditor";
import { filterOf } from "./cardConfig";
import type { TaskType, View, ViewFilter } from "../types";
import { DifficultySlider } from "../task/DifficultySlider";

// Which tasks this view shows. Applied on the server.

export function FilterSettings({ view, onClose }: { view: View; onClose: () => void }) {
  const { boot, updateView } = useApp();
  const { epics } = useEpics();
  const [filter, setFilter] = useState<ViewFilter>(filterOf(view));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ViewFilter>(k: K, v: ViewFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const list = <T,>(v: T[]) => (v.length ? v : null);

  const save = async () => {
    setBusy(true);
    try {
      updateView(await api.patch<View>(`/views/${view.id}`, { filter }));
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      width={440}
      title="Filter"
      onClose={onClose}
      extra={
        <Space>
          <WriteButton size="small" onClick={() => setFilter(filterOf({ ...view, filter: {} }))}>
            Clear all
          </WriteButton>
          <WriteButton type="primary" size="small" loading={busy} onClick={save}>
            Apply
          </WriteButton>
        </Space>
      }
    >
      <Form layout="vertical" size="small">
        <Form.Item label="Type" help="Empty means tasks and epics">
          <Select<TaskType[]>
            mode="multiple"
            allowClear
            value={filter.types ?? []}
            onChange={(v) => set("types", list(v))}
            options={(["task", "epic"] as TaskType[]).map((t) => ({ value: t, label: <TypeLabel type={t} /> }))}
          />
        </Form.Item>
        <Form.Item label="Epic" help="Tasks belonging to these epics. Empty means any.">
          <Select<number[]>
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="search"
            value={filter.epics ?? []}
            onChange={(v) => set("epics", list(v))}
            options={[
              { value: 0, search: "no epic", label: "No epic" },
              ...epics.map((e) => ({
                value: e.id,
                search: e.title.toLowerCase(),
                label: (
                  <span>
                    <TypeIcon type="epic" /> {e.title}
                  </span>
                ),
              })),
            ]}
          />
        </Form.Item>
        <Form.Item label="Areas" help="Empty means all areas">
          <Select
            mode="multiple"
            allowClear
            value={filter.areas ?? []}
            onChange={(v: number[]) => set("areas", list(v))}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Form.Item>
        <Form.Item label="Statuses" help="Empty means all statuses">
          <Select
            mode="multiple"
            allowClear
            value={filter.statuses ?? []}
            onChange={(v: number[]) => set("statuses", list(v))}
            options={boot.statuses.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
        <Space wrap>
          <Form.Item label="Min difficulty">
            <DifficultySlider value={filter.difficulty_min} width={220} onChange={(v) => set("difficulty_min", v)} />
          </Form.Item>
          <Form.Item label="Done within (days)">
            <InputNumber min={0} value={filter.include_done_days ?? undefined} onChange={(v) => set("include_done_days", v ?? null)} placeholder="all" />
          </Form.Item>
          <Form.Item label="Open only">
            <Switch checked={!!filter.open_only} onChange={(v) => set("open_only", v)} />
          </Form.Item>
        </Space>
        <Form.Item label="Custom fields">
          <CustomFilterEditor
            fields={boot.custom_fields.filter((f) => f.entity === "task")}
            value={filter.custom ?? {}}
            onChange={(v) => set("custom", Object.keys(v).length ? v : null)}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

/** How many filter constraints are active, for the button badge. */
export function activeFilterCount(view: View): number {
  const f = filterOf(view);
  return [f.types, f.epics, f.areas, f.statuses].filter((x) => x && x.length).length +
    (f.difficulty_min ? 1 : 0) +
    (f.open_only ? 1 : 0) +
    Object.keys(f.custom ?? {}).length;
}
