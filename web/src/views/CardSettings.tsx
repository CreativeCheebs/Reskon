import { useState } from "react";
import { Checkbox, Drawer, Form, Radio, Select } from "antd";
import { message } from "../theme/feedback";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { TaskCard } from "../board/TaskCard";
import { cardConfigOf, SHOW_LABELS } from "./cardConfig";
import type { CardConfig, CardShow, Task, View } from "../types";

// What each card (and table column) shows in this view, with a live
// preview. Applies to this view only.

export function CardSettings({ view, sample, onClose }: { view: View; sample?: Task; onClose: () => void }) {
  const { boot, updateView } = useApp();
  const [card, setCard] = useState<CardConfig>(cardConfigOf(view));
  const [busy, setBusy] = useState(false);
  const setShow = (k: keyof CardShow, v: boolean) => setCard((c) => ({ ...c, show: { ...c.show, [k]: v } }));
  const taskFields = boot.custom_fields.filter((f) => f.entity === "task");

  const save = async () => {
    setBusy(true);
    try {
      updateView(await api.patch<View>(`/views/${view.id}`, { card_config: card }));
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
      width={400}
      title={view.layout === "board" ? "Card" : "Columns"}
      onClose={onClose}
      extra={
        <WriteButton type="primary" size="small" loading={busy} onClick={save}>
          Save
        </WriteButton>
      }
    >
      <Form layout="vertical" size="small">
        <Form.Item label="Density">
          <Radio.Group value={card.density} onChange={(e) => setCard((c) => ({ ...c, density: e.target.value }))}>
            <Radio.Button value="compact">Compact</Radio.Button>
            <Radio.Button value="comfortable">Comfortable</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 12 }}>
          {(Object.keys(SHOW_LABELS) as (keyof typeof SHOW_LABELS)[])
            // A board's columns are its statuses; cards never repeat them.
            .filter((k) => !(k === "status" && view.layout === "board"))
            .map((k) => (
              <Checkbox key={k} checked={card.show[k]} onChange={(e) => setShow(k, e.target.checked)}>
                {SHOW_LABELS[k]}
              </Checkbox>
            ))}
        </div>
        {view.layout === "table" && (
          <Form.Item>
            <Checkbox checked={card.icons_only} onChange={(e) => setCard((c) => ({ ...c, icons_only: e.target.checked }))}>
              Symbols only: hide the priority and intensity names
            </Checkbox>
          </Form.Item>
        )}
        {taskFields.length > 0 && (
          <Form.Item label="Custom fields">
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
            <TaskCard task={sample ?? SAMPLE} config={card} />
          </div>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// Shown when the view has no tasks yet. Display-only values.
const SAMPLE: Task = {
  id: 0, key: "", title: "Example task", description: null, area_id: 0, status_id: 0, priority_id: null,
  energy_type_id: null, difficulty: 4, estimate_h: 3, due_at: "2026-11-04", start_date: null, end_date: null, snoozed_until: null, type: "task", epic_id: null,
  parent_id: null, board_pos: 0, custom: {}, created_at: "", updated_at: "", behaviour: "in_progress", first_started_at: null,
  last_started_at: null, completed_at: null, cancelled_at: null, last_moved_at: "", created_age_h: 72,
  started_age_h: 30, time_in_status_h: 20, stalled: false, points: 4, logged_h: 1.5, progress_pct: 50, remaining_h: 1.5, days_to_due: 2, pace_h: 0.5, snoozed: false, missing: [],
  subtypes: ["coding"], epic_tasks: null, epic_done: null, epic_estimate_h: null, epic_logged_h: null,
  subtask_count: 0, subtask_done: 0,
};
