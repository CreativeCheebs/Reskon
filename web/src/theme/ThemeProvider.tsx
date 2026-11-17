import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { local } from "../offline";
import { makeAntTheme } from "./antTheme";
import { applyPalette, isDarkPalette, palette } from "./palette";
import { BUILTIN_THEMES, parseTheme, resolveTheme, SYSTEM_THEME, type Theme } from "./themes";
import { interactionCss } from "./interactionStyles";

// Holds the active theme. Switching replaces the palette, rebuilds the Ant
// token block and the global styles, and re-renders the app. The last theme
// is remembered in this browser so the login page uses it too; once signed
// in, the theme saved on the account wins (see ThemeSync).

const LOCAL_KEY = "jitterbug.theme";

interface ThemeState {
  /** What is on screen now. When the choice is System, this is Dark or Light. */
  theme: Theme;
  /** What the person picked (may be System). */
  choice: Theme;
  setTheme: (t: Theme) => void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Does the computer prefer dark? Dark when it cannot be asked (the app's own look before System existed). */
function systemPrefersDark(): boolean {
  return typeof window.matchMedia !== "function" ? true : window.matchMedia(DARK_QUERY).matches;
}

const Ctx = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}

function initialTheme(): Theme {
  const saved = local.get(LOCAL_KEY);
  if (saved) {
    const parsed = parseTheme(saved);
    if (parsed.theme) {
      const id = (JSON.parse(saved) as { id?: string }).id;
      return BUILTIN_THEMES.find((b) => b.id === id) ?? parsed.theme;
    }
  }
  return SYSTEM_THEME; // nothing chosen yet: follow the computer
}

const style = document.createElement("style");
document.head.appendChild(style);

/** Page-level styles that live outside Ant: body, scrollbars, and the
 *  hover and focus states of cards, toolbar and sidebar. */
function applyGlobalStyles() {
  document.body.style.background = palette.bg;
  document.body.style.color = palette.fg;
  style.textContent = `
    @font-face { font-family: "DM Sans"; src: url("/fonts/DM-Sans.ttf") format("truetype"); font-weight: 100 1000; font-style: normal; font-display: swap; }
    :root { color-scheme: ${isDarkPalette() ? "dark" : "light"}; }
    * { scrollbar-width: thin; scrollbar-color: ${palette.borderStrong} transparent; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${palette.borderStrong}; border-radius: 6px; border: 2px solid ${palette.bg}; }
    ::-webkit-scrollbar-thumb:hover { background: ${palette.muted}; }
    ::-webkit-scrollbar-corner { background: transparent; }
  ` + interactionCss();
}

/** `children` is a render function, called on every theme change, so the
 *  whole tree is rebuilt and every inline style re-reads the palette
 *  (elements passed in from outside would keep their identity and skip
 *  re-rendering). */
export function ThemeProvider({ children }: { children: () => ReactNode }) {
  const [choice, setChoice] = useState<Theme>(initialTheme);
  const [dark, setDark] = useState(systemPrefersDark);
  const theme = resolveTheme(choice, dark);
  // The palette is set while rendering, before any child reads it. (Doing it
  // again for the same theme is harmless.)
  const applied = useRef<Theme | null>(null);
  if (applied.current !== theme) {
    applied.current = theme;
    applyPalette(theme.colors);
    applyGlobalStyles();
  }

  const setTheme = useCallback((t: Theme) => {
    local.set(LOCAL_KEY, JSON.stringify(t));
    setChoice(t);
  }, []);

  // The computer's light/dark setting changed (sunset, or a shortcut): follow it live.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    setDark(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const antTheme = useMemo(makeAntTheme, [theme]);

  return (
    <Ctx.Provider value={{ theme, choice, setTheme }}>
      <ConfigProvider theme={antTheme}>{children()}</ConfigProvider>
    </Ctx.Provider>
  );
}
