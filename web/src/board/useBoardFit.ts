import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Sizes board columns to the space available. When every column fits, they
// share the width (up to MAX each). When they don't, the width is chosen so
// the last visible column is whole and a slice of the next one peeks in from
// the right edge, which says "scroll" better than a column cut mid-card.
// Also reports which edges have more content past them, for the fade cues.

export const COL_MIN = 248;
const COL_MAX = 360;
export const COL_GAP = 10;
export const COLLAPSED_W = 36;
const PEEK = 0.3; // fraction of a column left showing when the board scrolls

export function columnWidth(avail: number, expanded: number, collapsed: number): number {
  const room = avail - collapsed * (COLLAPSED_W + COL_GAP);
  if (expanded === 0) return COL_MIN;
  if (expanded * COL_MIN + (expanded - 1) * COL_GAP <= room) return Math.min(COL_MAX, (room - (expanded - 1) * COL_GAP) / expanded);
  for (let k = expanded - 1; k >= 1; k--) {
    const w = (room - k * COL_GAP) / (k + PEEK);
    if (w >= COL_MIN) return Math.min(COL_MAX, Math.floor(w));
  }
  return COL_MIN;
}

export function useBoardFit(expanded: number, collapsed: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(COL_MIN);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(columnWidth(el.clientWidth, expanded, collapsed));
    setMore({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, [expanded, collapsed]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  return { ref, width, more };
}
