"use client";

import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "admin-theme";

const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function useAdminTheme() {
  return useContext(ThemeContext);
}

// 管理画面はゲーム側の固定ダークテーマから独立して、ライト/ダークを手動切り替えできる。
// 初回はOSの設定を初期値として採用し、以降はlocalStorageに保存した選択を優先する。
export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <div className={dark ? "dark" : ""} style={{ colorScheme: dark ? "dark" : "light" }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
