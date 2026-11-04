import { useEffect, useState, type ReactNode } from "react";
import { Button, Input, InputNumber, Popconfirm, Select, Switch, Table, Tag, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { autosave, message } from "../theme/feedback";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api";
import { useApp } from "../store";
import { WriteButton } from "../offline";
import { ColorField } from "../theme/ColorField";
import { palette } from "../theme/palette";
import { useReassignDelete } from "./ReassignDialog";

// A small editable table for one lookup collection. Each cell saves on its
// own (PATCH /api/<collection>/<id>) when it changes or loses focus. Rows
// are listed by `position`; the arrows swap a row with its neighbour and
// renumber the list.

export type FieldSpec = { key: string; title: string; width?: number; help?: string } & (
  | { kind: "text" }
  | { kind: "number"; step?: number; nullable?: boolean }
  | { kind: "bool" }
  | { kind: "color" }
  | { kind: "select"; options: { value: string | number; label: string }[]; nullable?: boolean }
);

type Row = { id: number; position: number; is_builtin?: boolean } & Record<string, unknown>;

interface Props {
  collection: string;
  rows: Row[];
  fields: FieldSpec[];
  /** What one row is called, for the add button ("priority"). */
  noun: string;
  newRow: () => Record<string, unknown>;
  /** Custom delete flow (e.g. pick a replacement). Default: confirm and DELETE. */
  onDelete?: (row: Row) => void;
  canDelete?: (row: Row) => boolean;
  /** The colour a row shows as, beside its name. Default: its `color`. */
  swatchOf?: (row: Row) => string | null | undefined;
  /** More actions for the whole list, shown on the right under it. */
  extra?: ReactNode;
}

const NAME_MIN = 160;
const ACTIONS_WIDTH = 124;

export function LookupEditor({ collection, rows, fields, noun, newRow, onDelete, canDelete, swatchOf, extra }: Props) {
  const { reloadBootstrap, online } = useApp();
  const sorted = [...rows].sort((a, b) => a.position - b.position || a.id - b.id);
  const hasColor = fields.some((f) => f.kind === "color");

  const save = async (id: number, key: string, value: unknown) => {
    try {
      await autosave(api.patch(`/${collection}/${id}`, { [key]: value }));
    } catch {
      // autosave showed the error; reloading puts the cell back.
    }
    await reloadBootstrap();
  };

  const move = async (index: number, by: -1 | 1) => {
    const order = [...sorted];
    [order[index], order[index + by]] = [order[index + by], order[index]];
    const renumber = async () => {
      for (const [i, r] of order.entries()) if (r.position !== i) await api.patch(`/${collection}/${r.id}`, { position: i });
    };
    try {
      await autosave(renumber());
    } catch {
      // autosave showed the error.
    }
    await reloadBootstrap();
  };

  const add = async () => {
    try {
      await api.post(`/${collection}`, newRow());
      await reloadBootstrap();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // Anything still in use asks where its users should move (ReassignDialog).
  const reassign = useReassignDelete(collection as never, false);
  const del = (row: Row) => reassign.start(row as never);

  const columns: ColumnsType<Row> = fields.map((f) => ({
    title: f.help ? (
      <Tooltip title={f.help}>
        <span style={{ cursor: "help" }}>
          {f.title} <QuestionCircleOutlined style={{ color: palette.subtle, fontSize: 11 }} />
        </span>
      </Tooltip>
    ) : (
      f.title
    ),
    width: f.width,
    render: (_: unknown, row: Row) => (
      <Cell
        spec={f}
        value={row[f.key]}
        disabled={!online}
        swatch={f.key === "name" && hasColor ? (swatchOf ? swatchOf(row) : (row.color as string | null)) : undefined}
        onSave={(v) => save(row.id, f.key, v)}
      />
    ),
  }));
  columns.push({
    title: "",
    width: ACTIONS_WIDTH,
    render: (_, row, i) => (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Tooltip title="Move up">
          <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={!online || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${row.name} up`} />
        </Tooltip>
        <Tooltip title="Move down">
          <Button
            size="small"
            type="text"
            icon={<ArrowDownOutlined />}
            disabled={!online || i === sorted.length - 1}
            onClick={() => move(i, 1)}
            aria-label={`Move ${row.name} down`}
          />
        </Tooltip>
        <span style={{ marginLeft: "auto" }}>
          {row.is_builtin ? (
            <Tooltip title="Built-in rows can be renamed and recoloured, not deleted.">
              <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
                built-in
              </Tag>
            </Tooltip>
          ) : canDelete && !canDelete(row) ? null : onDelete ? (
            <WriteButton size="small" danger type="text" onClick={() => onDelete(row)}>
              Delete
            </WriteButton>
          ) : (
            <Popconfirm title={`Delete “${row.name}”?`} onConfirm={() => del(row)}>
              <WriteButton size="small" danger type="text">
                Delete
              </WriteButton>
            </Popconfirm>
          )}
        </span>
      </div>
    ),
  });

  // Wide enough for every fixed column plus a usable name; narrower
  // screens scroll the table, never the page.
  const minWidth = fields.reduce((sum, f) => sum + (f.width ?? NAME_MIN), 0) + ACTIONS_WIDTH;

  return (
    <>
      {reassign.dialog}
      <Table<Row>
        className="jb-lookup"
        size="small"
        rowKey="id"
        dataSource={sorted}
        columns={columns}
        pagination={false}
        scroll={{ x: minWidth }}
      />
      <div className="jb-lookup-foot">
        <WriteButton size="small" icon={<PlusOutlined />} onClick={add}>
          Add {noun}
        </WriteButton>
        {extra && <span style={{ marginLeft: "auto" }}>{extra}</span>}
      </div>
    </>
  );
}

function Cell({
  spec,
  value,
  disabled,
  swatch,
  onSave,
}: {
  spec: FieldSpec;
  value: unknown;
  disabled: boolean;
  swatch?: string | null;
  onSave: (v: unknown) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  switch (spec.kind) {
    case "text":
      return (
        <Input
          size="small"
          disabled={disabled}
          value={(draft as string) ?? ""}
          prefix={swatch !== undefined ? <span className="jb-swatch" style={{ background: swatch ?? "transparent" }} /> : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onSave(draft)}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
        />
      );
    case "number":
      return (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
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
      return <ColorField disabled={disabled} value={value as string | null} onChange={(hex) => hex && onSave(hex)} />;
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
