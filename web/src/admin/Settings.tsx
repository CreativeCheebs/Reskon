import { Tabs, Typography } from "antd";
import { useApp } from "../store";
import { LookupEditor } from "./LookupEditor";
import { useReassignDelete } from "./ReassignDialog";
import { ReflectionSettings } from "./ReflectionSettings";
import { CaptureSettings } from "./CaptureSettings";
import { CustomFieldSettings } from "./CustomFieldSettings";
import { TaskDateSettings } from "./TaskDateSettings";
import { AccountSettings } from "../auth/AccountSettings";
import { UsersSettings } from "../auth/UsersSettings";
import { useAuth } from "../auth/AuthGate";
import { AppearanceSettings } from "../theme/AppearanceSettings";
import { api } from "../api";
import { confirm, message } from "../theme/feedback";
import { PRIORITY_LEVEL_COLORS, priorityLevel } from "../task/LevelIcons";

// Settings: every lookup is a row the user can edit.

export function Settings() {
  const { boot, reloadBootstrap, behaviourOf } = useApp();
  const { user } = useAuth();
  const statusDelete = useReassignDelete("statuses", false);
  const priorityDelete = useReassignDelete("priorities", true);
  const energyOptions = boot.energy_types.map((e) => ({ value: e.id, label: e.name }));
  const next = (rows: { position: number }[]) => rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  const unique = (base: string, rows: { name: string }[]) => {
    let name = base;
    for (let i = 2; rows.some((r) => r.name === name); i++) name = `${base} ${i}`;
    return name;
  };

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

  const tabs = [
    {
      key: "areas",
      label: "Areas",
      children: (
        <LookupEditor
          collection="areas"
          rows={boot.areas as never}
          fields={[
            { key: "name", title: "Name", kind: "text" },
            { key: "key_prefix", title: "Key prefix", kind: "text", width: 110 },
            { key: "color", title: "Colour", kind: "color", width: 80 },
            { key: "default_energy_type_id", title: "Default energy type", kind: "select", options: energyOptions, nullable: true, width: 180 },
            { key: "position", title: "Order", kind: "number", width: 80 },
          ]}
          newRow={() => {
            const name = unique("New area", boot.areas);
            return { name, key_prefix: "A" + (boot.areas.length + 1), position: next(boot.areas) };
          }}
        />
      ),
    },
    {
      key: "statuses",
      label: "Statuses",
      children: (
        <>
          <Typography.Paragraph type="secondary">
            “On board” off makes a status a header button instead of a column (like Backlog). “Alert after” flags a task red once it
            has sat in the status that many days. The colour caps the column and tints its count.{" "}
            <Typography.Link onClick={suggestStatusColours}>Use suggested colours for all</Typography.Link>
          </Typography.Paragraph>
          <LookupEditor
            collection="statuses"
            rows={boot.statuses as never}
            fields={[
              { key: "name", title: "Name", kind: "text" },
              {
                key: "category_id",
                title: "Category",
                kind: "select",
                width: 150,
                options: boot.status_categories.map((c) => ({ value: c.id, label: `${c.name} (${c.behaviour})` })),
              },
              { key: "color", title: "Colour", kind: "color", width: 80 },
              { key: "on_board", title: "On board", kind: "bool", width: 90 },
              { key: "alert_after_days", title: "Alert after (days)", kind: "number", nullable: true, width: 140 },
              { key: "position", title: "Order", kind: "number", width: 80 },
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
      ),
    },
    {
      key: "priorities",
      label: "Priorities",
      children: (
        <>
          <Typography.Paragraph type="secondary">
            Weight multiplies points. 1.0 is neutral; an unset priority counts as 1.0. A priority with no colour takes one by its
            rank (blue lowest, red highest).{" "}
            <Typography.Link onClick={suggestPriorityColours}>Use suggested colours for all</Typography.Link>
          </Typography.Paragraph>
          <LookupEditor
            collection="priorities"
            rows={boot.priorities as never}
            fields={[
              { key: "name", title: "Name", kind: "text" },
              { key: "color", title: "Colour", kind: "color", width: 80 },
              { key: "weight", title: "Weight", kind: "number", step: 0.25, width: 100 },
              { key: "position", title: "Order", kind: "number", width: 80 },
            ]}
            newRow={() => ({ name: unique("New priority", boot.priorities), weight: 1, position: next(boot.priorities) })}
            onDelete={(r) => priorityDelete.start(r as never)}
          />
          {priorityDelete.dialog}
        </>
      ),
    },
    {
      key: "energy",
      label: "Energy types",
      children: (
        <>
          <Typography.Paragraph type="secondary">
            Every type is equal and every type earns points: hours × the type's rate × intensity. A new rate
            applies to sessions logged after it. Types are added up, never set against each other.
          </Typography.Paragraph>
          <LookupEditor
            collection="energy-types"
            rows={boot.energy_types as never}
            fields={[
              { key: "name", title: "Name", kind: "text" },
              { key: "points_per_hour", title: "Points / hour", kind: "number", width: 110, step: 0.5 },
              { key: "color", title: "Colour", kind: "color", width: 80 },
              { key: "position", title: "Order", kind: "number", width: 80 },
            ]}
            newRow={() => ({ name: unique("New energy type", boot.energy_types), points_per_hour: 1, position: next(boot.energy_types) })}
          />
        </>
      ),
    },
    {
      key: "subtypes",
      label: "Subtypes",
      children: (
        <LookupEditor
          collection="subtypes"
          rows={boot.subtypes as never}
          fields={[
            { key: "name", title: "Name", kind: "text" },
            { key: "energy_type_id", title: "Energy type", kind: "select", options: energyOptions, width: 180 },
            { key: "position", title: "Order", kind: "number", width: 80 },
          ]}
          newRow={() => ({
            name: unique("new subtype", boot.subtypes),
            energy_type_id: boot.energy_types[0]?.id,
            position: next(boot.subtypes),
          })}
        />
      ),
    },
    { key: "dates", label: "Task dates", children: <TaskDateSettings /> },
    { key: "custom", label: "Custom fields", children: <CustomFieldSettings /> },
    { key: "capture", label: "Capture & weights", children: <CaptureSettings /> },
    { key: "reflection", label: "Reflection", children: <ReflectionSettings /> },
    { key: "appearance", label: "Appearance", children: <AppearanceSettings /> },
    { key: "account", label: "Account", children: <AccountSettings /> },
    ...(user.is_admin ? [{ key: "users", label: "People", children: <UsersSettings /> }] : []),
  ];

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Settings</div>
      <Tabs items={tabs} />
    </div>
  );
}
