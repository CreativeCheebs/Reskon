import { useEffect, useState } from "react";
import { Button, Form, InputNumber, Space } from "antd";
import { BgColorsOutlined } from "@ant-design/icons";
import { useApp } from "../store";
import { LookupEditor } from "./LookupEditor";
import { useReassignDelete } from "./ReassignDialog";
import { api } from "../api";
import { autosave, confirm, message } from "../theme/feedback";
import { PRIORITY_LEVEL_COLORS, priorityColor, priorityLevel } from "../task/LevelIcons";
import type { Priority } from "../types";

// The lookup sections of Settings: areas, statuses, priorities, energy
// types and subtypes. Each is one LookupEditor table; the section's intro
// lives with its menu entry in Settings.tsx.

const next = (rows: { position: number }[]) => rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
const unique = (base: string, rows: { name: string }[]) => {
  let name = base;
  for (let i = 2; rows.some((r) => r.name === name); i++) name = `${base} ${i}`;
  return name;
};

function useEnergyOptions() {
  const { boot } = useApp();
  return boot.energy_types.map((e) => ({ value: e.id, label: e.name }));
}

export function AreaSettings() {
  const { boot } = useApp();
  const energyOptions = useEnergyOptions();
  return (
    <LookupEditor
      collection="areas"
      noun="area"
      rows={boot.areas as never}
      fields={[
        { key: "name", title: "Name", kind: "text" },
        { key: "key_prefix", title: "Key prefix", kind: "text", width: 110, help: "Starts the area's task keys, like PER-12." },
        { key: "color", title: "Colour", kind: "color", width: 80 },
        { key: "default_energy_type_id", title: "Default energy type", kind: "select", options: energyOptions, nullable: true, width: 160 },
      ]}
      newRow={() => {
        const name = unique("New area", boot.areas);
        return { name, key_prefix: "A" + (boot.areas.length + 1), position: next(boot.areas) };
      }}
    />
  );
}

export function StatusSettings() {
  const { boot, reloadBootstrap, behaviourOf } = useApp();
  const statusDelete = useReassignDelete("statuses", false);

  // Recolours every status by its behaviour (and whether it is on the board),
  // never its name: off-board to-do slate, to-do violet, in progress cyan,
  // done green, cancelled grey. Replaces chosen colours.
  const suggestStatusColours = () =>
    confirm({
      title: "Recolour every status by what it means?",
      content: "Backlog-like statuses slate, to do violet, in progress cyan, done green, cancelled grey. Colours you chose are replaced.",
      onOk: async () => {
        const by: Record<string, string> = { todo: "#9F8FEF", in_progress: "#6CC3E0", done: "#4BCE97", cancelled: "#738496" };
        try {
          for (const s of boot.statuses) {
            const b = behaviourOf(s.id) ?? "todo";
            await api.patch(`/statuses/${s.id}`, { color: b === "todo" && !s.on_board ? "#8C9BAB" : by[b] });
          }
        } catch (e) {
          message.error((e as Error).message);
        }
        await reloadBootstrap();
      },
    });

  return (
    <>
      <LookupEditor
        collection="statuses"
        noun="status"
        extra={<SuggestColours onClick={suggestStatusColours} />}
        rows={boot.statuses as never}
        fields={[
          { key: "name", title: "Name", kind: "text" },
          {
            key: "category_id",
            title: "Category",
            kind: "select",
            width: 130,
            help: "What the status means: to do, in progress, done or cancelled.",
            options: boot.status_categories.map((c) => ({ value: c.id, label: c.name })),
          },
          { key: "color", title: "Colour", kind: "color", width: 80, help: "Caps the board column and tints its count." },
          { key: "on_board", title: "On board", kind: "bool", width: 96, help: "Off makes the status a header button instead of a column, like Backlog." },
          { key: "alert_after_days", title: "Alert after", kind: "number", nullable: true, width: 110, help: "Flags a task red once it has sat in the status this many days." },
        ]}
        newRow={() => ({
          name: unique("New status", boot.statuses),
          category_id: boot.status_categories[1]?.id ?? 1,
          position: next(boot.statuses),
        })}
        onDelete={(r) => statusDelete.start(r as never)}
      />
      {statusDelete.dialog}
    </>
  );
}

export function PrioritySettings() {
  const { boot, reloadBootstrap } = useApp();
  const priorityDelete = useReassignDelete("priorities", true);

  // Recolours every priority by its rank by weight, replacing chosen colours.
  const suggestPriorityColours = () =>
    confirm({
      title: "Recolour every priority by its rank?",
      content: "Blue for the lowest, then green, yellow, orange, and red for the highest. Colours you chose are replaced.",
      onOk: async () => {
        try {
          for (const p of boot.priorities)
            await api.patch(`/priorities/${p.id}`, { color: PRIORITY_LEVEL_COLORS[priorityLevel(p, boot.priorities)] });
        } catch (e) {
          message.error((e as Error).message);
        }
        await reloadBootstrap();
      },
    });

  return (
    <>
      <LookupEditor
        collection="priorities"
        noun="priority"
        extra={<SuggestColours onClick={suggestPriorityColours} />}
        swatchOf={(r) => priorityColor(r as unknown as Priority, boot.priorities)}
        rows={boot.priorities as never}
        fields={[
          { key: "name", title: "Name", kind: "text" },
          { key: "color", title: "Colour", kind: "color", width: 80, help: "With no colour, a priority takes one by its rank: blue lowest, red highest." },
          { key: "weight", title: "Weight", kind: "number", step: 0.25, width: 110, help: "Multiplies points. 1.0 is neutral; a task with no priority counts as 1.0." },
        ]}
        newRow={() => ({ name: unique("New priority", boot.priorities), weight: 1, position: next(boot.priorities) })}
        onDelete={(r) => priorityDelete.start(r as never)}
      />
      {priorityDelete.dialog}
    </>
  );
}

export function EnergyTypeSettings() {
  const { boot } = useApp();
  return (
    <LookupEditor
      collection="energy-types"
      noun="energy type"
      rows={boot.energy_types as never}
      fields={[
        { key: "name", title: "Name", kind: "text" },
        { key: "points_per_hour", title: "Points / hour", kind: "number", width: 120, step: 0.5, help: "A new rate applies to sessions logged after it." },
        { key: "color", title: "Colour", kind: "color", width: 80 },
      ]}
      newRow={() => ({ name: unique("New energy type", boot.energy_types), points_per_hour: 1, position: next(boot.energy_types) })}
    />
  );
}

export function SubtypeSettings() {
  const { boot } = useApp();
  const energyOptions = useEnergyOptions();
  return (
    <>
      <LookupEditor
        collection="subtypes"
        noun="subtype"
        rows={boot.subtypes as never}
        fields={[
          { key: "name", title: "Name", kind: "text" },
          { key: "energy_type_id", title: "Energy type", kind: "select", options: energyOptions, width: 180 },
        ]}
        newRow={() => ({
          name: unique("new subtype", boot.subtypes),
          energy_type_id: boot.energy_types[0]?.id,
          position: next(boot.subtypes),
        })}
      />
      <RankWeights />
    </>
  );
}

const RANKS = ["1st", "2nd", "3rd", "4th"];

// The `subtype_weights` setting: how much of a session's hours each subtype
// gets by its rank. Saved when a box loses focus or is stepped.
function RankWeights() {
  const { boot, saveSetting, online } = useApp();
  const saved = (boot.settings.subtype_weights as number[]) ?? [1, 0.5, 0.25, 0.25];
  const [weights, setWeights] = useState<(number | null)[]>(saved);
  useEffect(() => setWeights(saved), [boot.settings.subtype_weights]);

  const save = (ws: (number | null)[]) => {
    const clean = ws.map((w) => w ?? 0);
    if (clean.every((w, i) => w === saved[i])) return;
    autosave(saveSetting("subtype_weights", clean)).catch(() => setWeights(saved));
  };

  return (
    <Form layout="vertical" size="small" disabled={!online} className="jb-settings-subsection">
      <Form.Item label="Rank weights" extra="The weight of a session's 1st, 2nd, 3rd and 4th subtype.">
        <Space>
          {weights.map((w, i) => (
            <InputNumber
              key={i}
              min={0}
              max={1}
              step={0.05}
              addonBefore={RANKS[i]}
              style={{ width: 120 }}
              value={w}
              onChange={(v) => setWeights((ws) => ws.map((x, j) => (j === i ? v : x)))}
              onBlur={() => save(weights)}
              onStep={(v) => {
                const ws = weights.map((x, j) => (j === i ? v : x));
                setWeights(ws);
                save(ws);
              }}
            />
          ))}
        </Space>
      </Form.Item>
    </Form>
  );
}

function SuggestColours({ onClick }: { onClick: () => void }) {
  return (
    <Button size="small" type="text" icon={<BgColorsOutlined />} onClick={onClick}>
      Use suggested colours
    </Button>
  );
}
