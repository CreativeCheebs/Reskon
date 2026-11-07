import { useCallback, useState, type ThHTMLAttributes } from "react";
import type { ColumnsType } from "antd/es/table";
import { local } from "../offline";
import { palette } from "../theme/palette";

// Drag the right edge of a column header to resize it. Widths are kept in
// this browser only (localStorage), per table: screens differ between
// machines, so a width that suits one would not suit another.

const MIN = 40;
type Widths = Record<string, number>;

function load(key: string): Widths {
  try {
    const v = JSON.parse(local.get(key) ?? "{}");
    return v && typeof v === "object" ? (v as Widths) : {};
  } catch {
    return {};
  }
}

/** Columns need a `key`. `storageKey` names the table, e.g. "view:3". */
export function useColumnWidths<T>(storageKey: string, cols: ColumnsType<T>) {
  const key = "jitterbug.colw." + storageKey;
  const [widths, setWidths] = useState<Widths>(() => load(key));

  const resize = useCallback(
    (col: string, w: number, done: boolean) => {
      setWidths((prev) => {
        const next = { ...prev, [col]: Math.max(MIN, Math.round(w)) };
        if (done) local.set(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  const columns = cols.map((c) => {
    const k = c.key === undefined ? undefined : String(c.key);
    if (!k) return c;
    return {
      ...c,
      width: widths[k] ?? c.width,
      onHeaderCell: () => ({ onResize: (w: number, done: boolean) => resize(k, w, done) }) as ThHTMLAttributes<HTMLElement>,
    };
  });
  return { columns, components: { header: { cell: ResizableTitle } } };
}

function ResizableTitle({ onResize, children, style, ...rest }: ThHTMLAttributes<HTMLElement> & { onResize?: (w: number, done: boolean) => void }) {
  if (!onResize)
    return (
      <th style={style} {...rest}>
        {children}
      </th>
    );
  const start = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX;
    let w = th.width;
    const move = (ev: PointerEvent) => {
      w = th.width + ev.clientX - x0;
      onResize(w, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      onResize(w, true);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <th style={{ ...style, position: "relative" }} {...rest}>
      {children}
      <span
        role="presentation"
        onPointerDown={start}
        // Sorting is on header click; a click on the handle must not sort.
        onClick={(e) => e.stopPropagation()}
        title="Drag to resize"
        className="jb-col-resize"
        style={{ position: "absolute", top: 0, right: -4, bottom: 0, width: 8, cursor: "col-resize", zIndex: 2 }}
      >
        <span style={{ position: "absolute", top: "25%", bottom: "25%", left: 3, width: 2, borderRadius: 1, background: palette.border }} />
      </span>
    </th>
  );
}
