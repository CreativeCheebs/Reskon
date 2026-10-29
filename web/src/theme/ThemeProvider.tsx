import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { local } from "../offline";
import { makeAntTheme } from "./antTheme";
import { applyPalette, palette } from "./palette";
import { BUILTIN_THEMES, parseTheme, type Theme } from "./themes";

// Holds the active theme. Switching replaces the palette, rebuilds the Ant
// token block and the global styles, and re-renders the app. The last theme
// is remembered in this browser so the login page uses it too; once signed
// in, the theme saved on the account wins (see ThemeSync).

const LOCAL_KEY = "jitterbug.theme";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
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
  return BUILTIN_THEMES[0];
}

const style = document.createElement("style");
document.head.appendChild(style);

/** Page-level styles that live outside Ant: body, scrollbars. */
function applyGlobalStyles() {
  document.body.style.background = palette.bg;
  document.body.style.color = palette.fg;
  style.textContent = `
    :root { color-scheme: dark; }
    * { scrollbar-width: thin; scrollbar-color: ${palette.borderStrong} transparent; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${palette.borderStrong}; border-radius: 6px; border: 2px solid ${palette.bg}; }
    ::-webkit-scrollbar-thumb:hover { background: ${palette.muted}; }
    ::-webkit-scrollbar-corner { background: transparent; }
  `;
}

/** `children` is a render function, called on every theme change, so the
 *  whole tree is rebuilt and every inline style re-reads the palette
 *  (elements passed in from outside would keep their identity and skip
 *  re-rendering). */
export function ThemeProvider({ children }: { children: () => ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const t = initialTheme();
    applyPalette(t.colors);
    applyGlobalStyles();
    return t;
  });

  const setTheme = useCallback((t: Theme) => {
    applyPalette(t.colors);
    applyGlobalStyles();
    local.set(LOCAL_KEY, JSON.stringify(t));
    setThemeState(t);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const antTheme = useMemo(makeAntTheme, [theme]);

  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <ConfigProvider theme={antTheme}>{children()}</ConfigProvider>
    </Ctx.Provider>
  );
}
