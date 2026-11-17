import { useEffect } from "react";
import { useApp } from "../store";
import { useTheme } from "./ThemeProvider";
import { BUILTIN_THEMES, parseTheme, type Theme } from "./themes";

// Once signed in, the theme saved on the account wins over whatever this
// browser last showed (e.g. after signing in on a new device).

/** The account's saved theme, if any. Stored as {id} for built-ins, or the
 *  full theme for uploaded ones. */
export function savedTheme(value: unknown): Theme | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { id?: string };
  const builtin = BUILTIN_THEMES.find((b) => b.id === v.id);
  if (builtin) return builtin;
  return parseTheme(JSON.stringify(value)).theme;
}

export function ThemeSync() {
  const { boot } = useApp();
  const { choice, setTheme } = useTheme();
  const saved = savedTheme(boot.settings.theme);
  useEffect(() => {
    // Compare the choice, not what is on screen: System shows as Dark or
    // Light, and a built-in is the same theme whatever its colours say.
    if (saved && (saved.id !== choice.id || (!saved.builtin && JSON.stringify(saved.colors) !== JSON.stringify(choice.colors)))) setTheme(saved);
    // Only when the account's setting changes, not on every local switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(boot.settings.theme)]);
  return null;
}
