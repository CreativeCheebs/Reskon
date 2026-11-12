// Enter saves a session from the Log time / Edit session form, like the Save
// button. Only a plain Enter in a single-line text box counts: not in the note
// (Enter starts a new line there), not on a button or link (Enter presses
// it), not in a drop-down or a date or time picker (Enter opens it, or picks
// the highlighted choice), and not while an input method is composing a word.

export interface EnterKey {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  /** A box that already used the Enter (a drop-down opening) says so here. */
  defaultPrevented?: boolean;
  /** The element that has focus. */
  target: Pick<HTMLElement, "tagName" | "getAttribute"> & { type?: string; closest?: (selector: string) => Element | null };
}

export function enterSaves(e: EnterKey): boolean {
  if (e.key !== "Enter" || e.isComposing || e.defaultPrevented || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false;
  if (e.target.tagName !== "INPUT") return false;
  const type = (e.target.type ?? "").toLowerCase();
  if (type === "radio" || type === "checkbox" || type === "button" || type === "submit") return false;
  // Ant Design's drop-downs search in an input with the combobox role, open or closed.
  if (e.target.getAttribute("role") === "combobox" || e.target.getAttribute("aria-expanded") !== null) return false;
  // Date and time pickers: Enter belongs to the picker.
  if (e.target.closest?.(".ant-picker")) return false;
  return true;
}
