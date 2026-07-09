import Link from "next/link";

// アートディレクション指示書の表示優先順位(無料武将登用→AI寺子屋→おすすめイベント→
// 武将図鑑→国盗り→マーケット)をホーム最上部の入口として並べる。
const ACTIONS = [
  { href: "/gacha", icon: "🎴", label: "武将登用" },
  { href: "/academy", icon: "📜", label: "AI寺子屋" },
  { href: "/events", icon: "🎆", label: "イベント" },
  { href: "/collection", icon: "📖", label: "武将図鑑" },
  { href: "/map", icon: "🗾", label: "国盗り" },
  { href: "/market", icon: "🏮", label: "マーケット" },
];

export function PriorityQuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-gold/20 bg-ink-raised/70 py-3.5 text-center backdrop-blur-sm transition-transform duration-150 hover:-translate-y-0.5 hover:border-gold/50 active:translate-y-0 active:scale-95"
        >
          <span className="text-2xl drop-shadow-[0_0_6px_rgba(201,162,39,0.25)]">{action.icon}</span>
          <span className="text-[11px] font-semibold text-parchment">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
