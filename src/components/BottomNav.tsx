"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "パスポート", icon: "🏯" },
  { href: "/gacha", label: "ガチャ", icon: "🎴" },
  { href: "/collection", label: "図鑑", icon: "📖" },
  { href: "/map", label: "地図", icon: "🗾" },
  { href: "/purchase", label: "購入", icon: "🛒" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-gold/15 bg-ink/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition ${
                active ? "text-gold-soft" : "text-parchment-dim hover:text-gold-soft/70"
              }`}
            >
              <span className={`text-lg ${active ? "" : "opacity-70"}`}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
