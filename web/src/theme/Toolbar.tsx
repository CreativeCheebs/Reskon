import type { ReactNode } from "react";
import { Select, type SelectProps } from "antd";

// The shared page header and filter row. Every screen with filters uses
// these, so titles, date ranges, primary actions and filters start on the
// same content edge and keep the same gaps. Controls themselves take their
// look from the theme tokens (antTheme) and interactionStyles: 24px tall,
// a 1px outline, 6px corners, the board's segmented style everywhere.

/** Title, then the screen's main controls; an `end` slot sits on the right edge. */
export function PageHeader({ title, children, end }: { title: ReactNode; children?: ReactNode; end?: ReactNode }) {
  return (
    <div className="jb-page-head">
      <h1 className="jb-page-title">{title}</h1>
      {children}
      {end && <div className="jb-toolbar-end">{end}</div>}
    </div>
  );
}

/** A row of control groups that wraps a whole group at a time. A thin line
 *  sits between groups on the same line; the inner row clips the line off a
 *  group that wrapped to the start of a new line, so no line dangles there. */
export function Toolbar({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="jb-toolbar" style={style}>
      <div className="jb-toolbar-row">{children}</div>
    </div>
  );
}

/** Related controls that stay on one line when the toolbar wraps. The
 *  right-hand group sits on the right edge. */
export function ToolbarGroup({ right, children }: { right?: boolean; children: ReactNode }) {
  return <div className={right ? "jb-toolbar-group jb-toolbar-end" : "jb-toolbar-group"}>{children}</div>;
}

/** A filter dropdown: small, its menu as wide as its options, and tinted
 *  while it narrows what is shown (`active`), like the board's controls. */
export function FilterSelect<V>({ active, className, ...props }: SelectProps<V> & { active?: boolean }) {
  return (
    <Select<V>
      size="small"
      popupMatchSelectWidth={false}
      className={[active && "jb-active", className].filter(Boolean).join(" ") || undefined}
      {...props}
    />
  );
}
