import { useEffect, useState } from "react";
import { ColorPicker, Input, InputNumber, Popconfirm, Select, Switch, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";

// A small editable table for one lookup collection. Each cell saves on its
// own (PATCH /api/<collection>/<id>) when it changes or loses focus.

export type FieldSpec =
  | { key: string; title: string; kind: "text"; width?: number }
  | { key: string; title: string; kind: "number"; width?: number; step?: number; nullable?: boolean }
  | { key: string; title: string; kind: "bool"; width?: number }
  | { key: string; title: string; kind: "color"; width?: number }
  | { key: string; title: string; kind: "select"; width?: number; options: { value: string | number; label: string }[]; nullable?: boolean };

type Row = { id: number; is_builtin?: boolean } & Record<string, unknown>;

interface Props {
  collection: string;
  rows: Row[];
  fields: FieldSpec[];
  newRow: () => Record<string, unknown>;
  /** Custom delete flow (e.g. pick a replacement). Default: confirm and DELETE. */
  onDelete?: (row: Row) => void;
  canDelete?: (row: Row) => boolean;
}

export function LookupEditor({ collection, rows, fields, newRow, onDelete, canDelete }: Props) {
  const { reloadBootstrap, online } = useApp();

  const save = async (id: number, key: string, value: unknown) => {
    try {
      await api.patch(`/${collection}/${id}`, { [key]: value });
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const add = async () => {
    try {
      await api.post(`/${collection}`, newRow());
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const del = async (row: Row) => {
    try {
      await api.del(`/${collection}/${row.id}`);
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<Row> = fields.map((f) => ({
    title: f.title,
    width: f.width,
    render: (_: unknown, row: Row) => <Cell spec={f} value={row[f.key]} disabled={!online} onSave={(v) => save(row.id, f.key, v)} />,
  }));
  columns.push({
    title: "",
    width: 110,
    render: (_, row) =>
      row.is_builtin ? (
        <Tag bordered={false}>built-in</Tag>
      ) : canDelete && !canDelete(row) ? null : onDelete ? (
        <WriteButton size="small" danger type="text" onClick={() => onDelete(row)}>
          Delete
        </WriteButton>
      ) : (
        <Popconfirm title="Delete?" onConfirm={() => del(row)}>
          <WriteButton size="small" danger type="text">
            Delete
          </WriteButton>
        </Popconfirm>
      ),
  });

  return (
    <>
      <Table<Row> size="small" rowKey="id" dataSource={rows} columns={columns} pagination={false} />
      <WriteButton size="small" style={{ marginTop: 8 }} onClick={add}>
        + Add
      </WriteButton>
    </>
  );
}

function Cell({ spec, value, disabled, onSave }: { spec: FieldSpec; value: unknown; disabled: boolean; onSave: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  switch (spec.kind) {
    case "text":
      return (
        <Input
          size="small"
          disabled={disabled}
          value={(draft as string) ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft)}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
        />
      );
    case "number":
      return (
        <InputNumber
          size="small"
          disabled={disabled}
          step={spec.step}
          value={draft as number | null}
          placeholder={spec.nullable ? "none" : undefined}
          onChange={(v) => setDraft(v)}
          onBlur={() => draft !== value && (draft !== null || spec.nullable) && onSave(draft ?? null)}
        />
      );
    case "bool":
      return <Switch size="small" disabled={disabled} checked={!!value} onChange={(v) => onSave(v)} />;
    case "color":
      return (
        <ColorPicker
          size="small"
          disabled={disabled}
          value={(value as string) ?? undefined}
          onChangeComplete={(c) => onSave(c.toHexString())}
        />
      );
    case "select":
      return (
        <Select
          size="small"
          style={{ width: "100%" }}
          disabled={disabled}
          allowClear={spec.nullable}
          value={(value as string | number | null) ?? undefined}
          onChange={(v) => onSave(v ?? null)}
          options={spec.options}
        />
      );
  }
}
