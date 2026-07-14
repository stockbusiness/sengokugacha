"use client";

import { useState } from "react";
import Link from "next/link";

type MenuItem = { href: string; icon: string; label: string } | { href: null; icon: string; label: string };

// 画面デザインガイドのサイドメニュー相当。プレゼント(ギフトボックス)機能は未実装のため
// 「準備中」として表示のみにとどめ、実在しない機能を偽装しない。
const MENU_ITEMS: MenuItem[] = [
  { href: "/announcements", icon: "📯", label: "お知らせ" },
  { href: "/", icon: "📝", label: "本日の任務" },
  { href: null, icon: "🎁", label: "プレゼント" },
  { href: "/ranking", icon: "🏆", label: "国家ランキング" },
  { href: "/my-land", icon: "🏞️", label: "所有区画" },
  { href: "/castle-lord/dashboard", icon: "🏯", label: "城主ダッシュボード" },
  { href: "/guide", icon: "❓", label: "遊び方・ヘルプ" },
  { href: "/legal/support", icon: "✉️", label: "お問い合わせ" },
];

export function SideMenu() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const configRes = await fetch("/api/app-config");
      const config = await configRes.json().catch(() => ({}));
      if (config.liffId) {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: config.liffId }).catch(() => {});
        if (liff.isLoggedIn()) liff.logout();
      }
    } catch {
      /* LIFF側のログアウトに失敗しても、サーバー側セッションのクリアは継続する */
    } finally {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        className="fixed right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-ink/80 text-gold-soft backdrop-blur-sm transition hover:border-gold/50 active:scale-95"
      >
        <span className="text-lg" aria-hidden="true">
          ☰
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
          />
          <div className="menu-slide-in relative flex h-full w-72 max-w-[80vw] flex-col border-l border-gold/20 bg-ink-raised px-4 py-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-heading text-sm font-bold text-gold-soft">メニュー</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-parchment-dim transition hover:text-gold-soft"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {MENU_ITEMS.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-parchment transition hover:bg-ink hover:text-gold-soft"
                  >
                    <span className="text-base" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-parchment-dim/50"
                  >
                    <span className="text-base opacity-50" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                    <span className="ml-auto text-[10px]">準備中</span>
                  </div>
                )
              )}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-4 rounded-lg border border-gold/20 px-3 py-2.5 text-center text-sm text-parchment-dim transition hover:border-crimson/50 hover:text-crimson-soft disabled:opacity-50"
            >
              {loggingOut ? "ログアウト中..." : "ログアウト"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
