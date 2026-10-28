import { Button, DatePicker, Input, InputNumber, Select, Space, Switch } from "antd";
import dayjs from "dayjs";
import type { CustomField } from "../types";

// Edits a filter's `custom` object: one row per field. Scalars mean
// equality; date and number fields can instead take a from/to range, stored
// as {"gte": ..., "lte": ...}.

type Value = Record<string, unknown>;
type Range = { gte?: string | number; lte?: string | number };

export function CustomFilterEditor({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[];
  value: Value;
  onChange: (v: Value) => void;
}) {
  const used = Object.keys(value);
  const unused = fields.filter((f) => !used.includes(f.key));
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const remove = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {used.map((key) => {
        const f = fields.find((x) => x.key === key);
        return (
          <Space key={key} wrap>
            <span style={{ minWidth: 110, display: "inline-block" }}>{f?.label ?? key}</span>
            {f ? <ValueInput field={f} value={value[key]} onChange={(v) => set(key, v)} /> : <code>{JSON.stringify(value[key])}</code>}
            <Button size="small" type="text" onClick={() => remove(key)}>
              ✕
            </Button>
          </Space>
        );
      })}
      {unused.length > 0 && (
        <Select
          size="small"
          placeholder="+ Filter by field"
          value={null}
          style={{ width: 200 }}
          onChange={(k: string) => {
            const f = fields.find((x) => x.key === k)!;
            set(k, f.type === "bool" ? true : f.type === "date" ? { gte: dayjs().format("YYYY-MM-DD") } : "");
          }}
          options={unused.map((f) => ({ value: f.key, label: f.label }))}
        />
      )}
    </Space>
  );
}

function ValueInput({ field, value, onChange }: { field: CustomField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "bool":
      return <Switch size="small" checked={value === true} onChange={onChange} />;
    case "select":
      return (
        <Select
          size="small"
          style={{ width: 180 }}
          value={value as string}
          onChange={onChange}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      );
    case "date": {
      const r: Range = typeof value === "object" && value !== null ? (value as Range) : { gte: value as string, lte: value as string };
      const d = (s?: string | number) => (s ? dayjs(String(s)) : null);
      return (
        <DatePicker.RangePicker
          size="small"
          allowEmpty={[true, true]}
          value={[d(r.gte), d(r.lte)]}
          onChange={(v) => {
            const next: Range = {};
            if (v?.[0]) next.gte = v[0].format("YYYY-MM-DD");
            if (v?.[1]) next.lte = v[1].format("YYYY-MM-DD");
            onChange(next);
          }}
        />
      );
    }
    case "int":
    case "real":
      return <InputNumber size="small" value={value as number} onChange={onChange} />;
    default:
      return <Input size="small" style={{ width: 180 }} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  }
}
