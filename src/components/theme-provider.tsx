"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ThemeSetting = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeSetting) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialThemeSetting(): ThemeSetting {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem("tp-theme");
  if (stored === "light" || stored === "dark" || stored === "system")
    return stored;
  return "system";
}

function getInitialSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeSetting>(getInitialThemeSetting);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(
    getInitialSystemTheme,
  );

  const resolvedTheme = useMemo<ResolvedTheme>(() => {
    return theme === "system" ? systemTheme : theme;
  }, [systemTheme, theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tp-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    onChange();

    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      resolvedTheme,
      setTheme,
      toggle: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    };
  }, [resolvedTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    // Return a dummy value during SSR if the context is not available yet
    return {
      theme: "system" as const,
      resolvedTheme: "light" as const,
      setTheme: () => {},
      toggle: () => {},
    };
  }
  return value;
}
