import { blend, palette } from "../theme/palette";
import { withAlpha } from "../views/ViewBackdrop";

// Columns sit half way between the page and the sunken well, with a faint
// outline, so a mostly empty column reads as space rather than a dark slab.
// Over a view's background image they let it show through (see ViewBackdrop).
// Shared by the board and the dashboard's board widget, so they look alike.
export const columnBg = (surface: number) => withAlpha(blend(palette.panelDim, palette.bg, 0.5), surface);
export const columnBorder = (surface: number) => withAlpha(blend(palette.border, palette.bg, 0.6), Math.max(surface, 0.5));
