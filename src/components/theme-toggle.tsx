"use client";

import { useTheme } from "./theme-provider";
import { Moon } from "lucide-react";

export function ThemeToggle() {
  const { toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/15"
      aria-label="Cambiar tema"
    >
      <Moon className="h-4 w-4" />
    </button>
  );
}
