import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";

type ThemeContextValue = {
  /** The actually-applied theme — "system" resolves to whichever this device currently prefers. */
  theme: Theme;
  /** The stored preference, including "system". */
  mode: ThemeMode;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  mode: "system",
  toggle: () => {},
  setTheme: () => {},
  setMode: () => {},
});

const STORAGE_KEY = "hodora-theme";

function resolveSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initialMode: ThemeMode =
      stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setModeState(initialMode);
    setThemeState(initialMode === "system" ? resolveSystemTheme() : initialMode);
  }, []);

  // While the preference is "system", keep the applied theme in sync with
  // OS-level changes (e.g. the device flips to dark mode at sunset) without
  // requiring a reload.
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setThemeState(resolveSystemTheme());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  // useLayoutEffect (not useEffect): this DOM mutation must land before any
  // descendant's passive effect reads the resulting CSS custom properties —
  // e.g. RouteMap re-resolving --color-route on theme change. Passive
  // effects fire child-before-parent within a commit, so a plain useEffect
  // here would run after some descendants had already read the stale value.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [theme, mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setThemeState(next === "system" ? resolveSystemTheme() : next);
  }, []);

  const setTheme = useCallback((next: Theme) => setMode(next), [setMode]);
  const toggle = useCallback(() => setMode(theme === "dark" ? "light" : "dark"), [theme, setMode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
