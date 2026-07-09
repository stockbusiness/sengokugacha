"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "パスポート", icon: "🏯" },
  { href: "/gacha", label: "武将登用", icon: "🎴" },
  { href: "/collection", label: "図鑑", icon: "📖" },
  { href: "/map", label: "地図", icon: "🗾" },
  { href: "/purchase", label: "購入", icon: "🛒" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 border-t border-gold/15 bg-ink/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors duration-200 active:scale-95 ${
                active ? "text-gold-soft" : "text-parchment-dim hover:text-gold-soft/70"
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold shadow-[0_0_8px_rgba(201,162,39,0.8)]" />
              )}
              <span
                className={`text-lg transition-transform duration-200 ${
                  active ? "scale-110 drop-shadow-[0_0_6px_rgba(232,205,122,0.5)]" : "opacity-70"
                }`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
