"use client";

import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors duration-300 text-indigo-600 dark:text-violet-400"
    >
      {isDark ? "Light Mode" : "Dark Mode"}
    </button>
  );
}
