import { useState } from "react";
import { Checkbox, Divider, Drawer, Form, Input, InputNumber, Popconfirm, Radio, Select, Space, Switch, message } from "antd";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { TaskCard } from "../board/TaskCard";
import { CustomFilterEditor } from "./CustomFilterEditor";
import { cardConfigOf, filterOf, SHOW_LABELS } from "./cardConfig";
import type { CardConfig, CardShow, Task, View, ViewFilter } from "../types";
import { DIFFICULTIES } from "../types";

// Edit one view: name, layout, filter, and its card configuration with a
// live preview. Changes apply to this view only.

interface Props {
  view: View;
  sample?: Task;
  onClose: () => void;
}

export function ViewSettings({ view, sample, onClose }: Props) {
  const { boot, reloadBootstrap } = useApp();
  const [name, setName] = useState(view.name);
  const [layout, setLayout] = useState(view.layout);
  const [filter, setFilter] = useState<ViewFilter>(filterOf(view));
  const [card, setCard] = useState<CardConfig>(cardConfigOf(view));
  const [busy, setBusy] = useState(false);

  const setShow = (k: keyof CardShow, v: boolean) => setCard((c) => ({ ...c, show: { ...c.show, [k]: v } }));
  const setF = <K extends keyof ViewFilter>(k: K, v: ViewFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/views/${view.id}`, { name, layout, filter, card_config: card });
      await reloadBootstrap();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/views/${view.id}`);
      window.location.hash = "";
      await reloadBootstrap();
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const taskFields = boot.custom_fields.filter((f) => f.entity === "task");
  const preview: Task = sample ?? SAMPLE;

  return (
    <Drawer
      open
      width={460}
      title="View settings"
      onClose={onClose}
      extra={
        <Space>
          <Popconfirm title="Delete this view?" onConfirm={remove}>
            <WriteButton danger size="small">
              Delete
            </WriteButton>
          </Popconfirm>
          <WriteButton type="primary" size="small" loading={busy} onClick={save}>
            Save
          </WriteButton>
        </Space>
      }
    >
      <Form layout="vertical" size="small">
        <Form.Item label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Form.Item>
        <Form.Item label="Layout">
          <Radio.Group value={layout} onChange={(e) => setLayout(e.target.value)}>
            <Radio.Button value="board">Board</Radio.Button>
            <Radio.Button value="table">Table</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Divider plain orientation="left">Filter</Divider>
        <Form.Item label="Areas" help="Empty means all areas">
          <Select
            mode="multiple"
            allowClear
            value={filter.areas ?? []}
            onChange={(v: number[]) => setF("areas", v.length ? v : null)}
            options={boot.areas.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Form.Item>
        <Form.Item label="Statuses" help="Empty means all statuses">
          <Select
            mode="multiple"
            allowClear
            value={filter.statuses ?? []}
            onChange={(v: number[]) => setF("statuses", v.length ? v : null)}
            options={boot.statuses.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
        <Space>
          <Form.Item label="Min difficulty">
            <Select
              allowClear
              style={{ width: 110 }}
              value={filter.difficulty_min ?? undefined}
              onChange={(v) => setF("difficulty_min", v ?? null)}
              options={DIFFICULTIES.map((d) => ({ value: d, label: d }))}
            />
          </Form.Item>
          <Form.Item label="Done within (days)">
            <InputNumber
              min={0}
              value={filter.include_done_days ?? undefined}
              onChange={(v) => setF("include_done_days", v ?? null)}
              placeholder="all"
            />
          </Form.Item>
          <Form.Item label="Open only">
            <Switch checked={!!filter.open_only} onChange={(v) => setF("open_only", v)} />
          </Form.Item>
        </Space>
        <Form.Item label="Custom fields">
          <CustomFilterEditor fields={taskFields} value={filter.custom ?? {}} onChange={(v) => setF("custom", Object.keys(v).length ? v : null)} />
        </Form.Item>

        <Divider plain orientation="left">Card</Divider>
        <Form.Item label="Density">
          <Radio.Group value={card.density} onChange={(e) => setCard((c) => ({ ...c, density: e.target.value }))}>
            <Radio.Button value="compact">Compact</Radio.Button>
            <Radio.Button value="comfortable">Comfortable</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 12 }}>
          {(Object.keys(SHOW_LABELS) as (keyof typeof SHOW_LABELS)[]).map((k) => (
            <Checkbox key={k} checked={card.show[k]} onChange={(e) => setShow(k, e.target.checked)}>
              {SHOW_LABELS[k]}
            </Checkbox>
          ))}
        </div>
        {taskFields.length > 0 && (
          <Form.Item label="Custom fields on cards">
            <Select
              mode="multiple"
              value={card.show.custom}
              onChange={(v: string[]) => setCard((c) => ({ ...c, show: { ...c.show, custom: v } }))}
              options={taskFields.map((f) => ({ value: f.key, label: f.label }))}
            />
          </Form.Item>
        )}
        <Form.Item label="Preview">
          <div style={{ width: 280 }}>
            <TaskCard task={preview} config={card} />
          </div>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// Shown when the view has no tasks yet. Display-only values.
const SAMPLE: Task = {
  id: 0,
  key: "",
  title: "Example task",
  description: null,
  area_id: 0,
  status_id: 0,
  priority_id: null,
  energy_type_id: null,
  difficulty: 4,
  estimate_h: 3,
  due_at: "2026-11-04",
  board_pos: 0,
  custom: {},
  created_at: "",
  updated_at: "",
  behaviour: "in_progress",
  first_started_at: null,
  last_started_at: null,
  completed_at: null,
  cancelled_at: null,
  last_moved_at: "",
  created_age_h: 72,
  started_age_h: 30,
  time_in_status_h: 20,
  stalled: false,
  points: 4,
  logged_h: 1.5,
  progress_pct: 50,
  subtypes: ["coding"],
};
