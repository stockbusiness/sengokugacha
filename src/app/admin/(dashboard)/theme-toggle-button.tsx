"use client";

import { useAdminTheme } from "./theme-provider";

export function ThemeToggleButton() {
  const { dark, toggle } = useAdminTheme();

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {dark ? "☀️ ライト" : "🌙 ダーク"}
    </button>
  );
}
