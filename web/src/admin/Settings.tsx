import { Tabs, Typography } from "antd";
import { useApp } from "../store";
import { LookupEditor } from "./LookupEditor";
import { useReassignDelete } from "./ReassignDialog";
import { ReflectionSettings } from "./ReflectionSettings";
import { CaptureSettings } from "./CaptureSettings";
import { CustomFieldSettings } from "./CustomFieldSettings";
import { AccountSettings } from "../auth/AccountSettings";
import { UsersSettings } from "../auth/UsersSettings";
import { useAuth } from "../auth/AuthGate";
import { AppearanceSettings } from "../theme/AppearanceSettings";

// Settings: every lookup is a row the user can edit.

export function Settings() {
  const { boot } = useApp();
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
            has sat in the status that many days.
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
          <Typography.Paragraph type="secondary">Weight multiplies points. 1.0 is neutral; an unset priority counts as 1.0.</Typography.Paragraph>
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
            Spend and restore are tracked separately and never netted against each other.
          </Typography.Paragraph>
          <LookupEditor
            collection="energy-types"
            rows={boot.energy_types as never}
            fields={[
              { key: "name", title: "Name", kind: "text" },
              {
                key: "direction",
                title: "Direction",
                kind: "select",
                width: 120,
                options: [
                  { value: "spend", label: "spend" },
                  { value: "restore", label: "restore" },
                ],
              },
              { key: "color", title: "Colour", kind: "color", width: 80 },
              { key: "position", title: "Order", kind: "number", width: 80 },
            ]}
            newRow={() => ({ name: unique("New energy type", boot.energy_types), direction: "spend", position: next(boot.energy_types) })}
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
