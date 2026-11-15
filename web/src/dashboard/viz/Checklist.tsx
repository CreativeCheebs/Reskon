import { BorderOutlined, CheckSquareFilled } from "@ant-design/icons";
import { Table } from "antd";
import { palette } from "../../theme/palette";
import { appValue } from "../format";
import type { MetricResult } from "../types";

// An app's checklist and table (docs/plugins.md section 6.2), drawn in
// Reskon's style. Read-only: ticking happens in the app's own page, so
// nothing here is clickable. Each item says "done" or "not done" in words
// as well as by its box, so the state is never told by colour alone. All
// text is the app's, shown as plain text.

/** Read by screen readers, not shown. */
const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** Each item with a ticked or empty box, its label and its detail. The
 *  server sends value 1 for done and 0 for not done. */
export function ChecklistViz({ res }: { res: MetricResult }) {
  return (
    // Safari drops a list's meaning when its bullets are hidden; role="list" keeps it.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul role="list" aria-label={res.label || "Checklist"} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {res.points.map((p) => {
        const done = p.value === 1;
        return (
          <li key={p.key} style={{ position: "relative", display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
            {done ? (
              <CheckSquareFilled aria-hidden style={{ color: palette.success, fontSize: 15, flex: "none", alignSelf: "center" }} />
            ) : (
              <BorderOutlined aria-hidden style={{ color: palette.subtle, fontSize: 15, flex: "none", alignSelf: "center" }} />
            )}
            <span title={p.label} style={{ fontSize: 13, fontWeight: 500, color: done ? palette.fg : palette.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.label}
              <span style={srOnly}>{done ? ": done" : ": not done"}</span>
            </span>
            {p.detail && <span title={p.detail} style={{ color: palette.muted, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A table an app sent: its own columns, the unit in the header (as the
 *  app wrote it), numbers to the right, and a sideways scroll when it is
 *  wider than the widget. */
export function AppTableViz({ res }: { res: MetricResult }) {
  const t = res.table!;
  // Rows are kept apart from their keys, so no app column can clash with them.
  const rows = t.rows.map((row, i) => ({ i, row }));
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="i"
      dataSource={rows}
      scroll={{ x: "max-content" }}
      columns={t.columns.map((c) => ({
        key: c.key,
        title: c.unit ? `${c.label} (${c.unit})` : c.label,
        align: t.rows.some((row) => typeof row[c.key] === "number") ? ("right" as const) : undefined,
        render: (_: unknown, r: (typeof rows)[number]) => {
          const v = r.row[c.key];
          if (v === null || v === undefined) return "";
          if (typeof v === "number") return appValue(v);
          if (typeof v === "boolean") return v ? "Yes" : "No";
          return v;
        },
      }))}
    />
  );
}
