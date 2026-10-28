import { DatePicker, Form, Input, InputNumber, Select, Switch } from "antd";
import dayjs from "dayjs";
import { useApp } from "../store";
import type { CustomField } from "../types";

// Editors for an entity's custom fields, one per definition. Keys in the
// value with no definition are left alone (never stripped). The server
// validates every value against its definition on write.

export function CustomFieldsEditor({
  entity,
  value,
  onChange,
  disabled,
}: {
  entity: "task" | "session";
  value: Record<string, unknown>;
  /** Called with one changed key; null means remove it. */
  onChange: (key: string, v: unknown) => void;
  disabled?: boolean;
}) {
  const { boot } = useApp();
  const defs = boot.custom_fields.filter((f) => f.entity === entity);
  if (defs.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
      {defs.map((f) => (
        <Form.Item key={f.key} label={f.label} style={{ marginBottom: 8 }}>
          <FieldInput field={f} value={value[f.key]} disabled={disabled} onChange={(v) => onChange(f.key, v)} />
        </Form.Item>
      ))}
    </div>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const clear = (v: unknown) => onChange(v === "" || v === undefined ? null : v);
  switch (field.type) {
    case "bool":
      return <Switch size="small" disabled={disabled} checked={value === true} onChange={onChange} />;
    case "date":
      return (
        <DatePicker
          size="small"
          style={{ width: "100%" }}
          disabled={disabled}
          value={typeof value === "string" && value ? dayjs(value) : null}
          onChange={(d) => clear(d ? d.format("YYYY-MM-DD") : null)}
        />
      );
    case "int":
    case "real":
      return (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          disabled={disabled}
          precision={field.type === "int" ? 0 : undefined}
          value={typeof value === "number" ? value : null}
          onChange={(v) => clear(v ?? null)}
        />
      );
    case "select":
      return (
        <Select
          size="small"
          allowClear
          disabled={disabled}
          value={(value as string) ?? undefined}
          onChange={(v) => clear(v)}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      );
    default:
      return (
        <Input
          size="small"
          disabled={disabled}
          defaultValue={(value as string) ?? ""}
          key={String(value ?? "")}
          onBlur={(e) => e.target.value !== (value ?? "") && clear(e.target.value)}
        />
      );
  }
}
