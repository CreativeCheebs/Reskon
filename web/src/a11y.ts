import type { CheckboxProps } from "antd";
import type { KeyboardEvent } from "react";

/**
 * Props that make a plain element work like a button for people using the
 * keyboard or a screen reader: Tab reaches it, Enter or Space presses it, and
 * it is announced as a button with the given name. Use a real <button> where
 * you can; use this where the element has to stay a <div> or <span> (a table
 * row, a chart bar, a card).
 */
export function pressable(onPress: (() => void) | undefined, label?: string) {
  if (!onPress) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: () => onPress(),
    onKeyDown: (e: KeyboardEvent) => {
      // A key pressed inside a child (an input, a nested button) belongs to the child.
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress();
      }
    },
  };
}

/**
 * A name for a table's row checkbox ("Select Fix the shed"). Ant Design hands
 * extra attributes to the input, but its types do not list aria-label.
 */
export const checkboxLabel = (label: string): Partial<CheckboxProps> => ({ "aria-label": label }) as Partial<CheckboxProps>;
