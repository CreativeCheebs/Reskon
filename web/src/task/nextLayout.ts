import type { CSSProperties } from "react";
import { palette } from "../theme/palette";

// The label-and-control rows of the "What's next?" forms (Continue and Next
// round), shared so their labels line up in one column.

export const nextGrid: CSSProperties = { display: "grid", gridTemplateColumns: "84px 1fr", gap: "10px 8px", alignItems: "center" };
export const nextLabel: CSSProperties = { fontSize: 13, color: palette.muted };
