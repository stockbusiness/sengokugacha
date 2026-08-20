"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; emphasis?: boolean };
type NavGroup = { title: string; items: NavItem[] };

// 管理画面のメニューが30項目を超え1行に収まらなくなったため、カテゴリ別の
// 開閉セクションを持つ左サイドバーへ変更する(旧: 横並びの全項目フラットリスト)。
const NAV_GROUPS: NavGroup[] = [
  {
    title: "ゲーム設定",
    items: [
      { href: "/admin/gacha-config", label: "ガチャ設定" },
      { href: "/admin/gacha-rates", label: "排出率設定" },
      { href: "/admin/gacha-animations", label: "動画演出" },
      { href: "/admin/provinces", label: "国マスタ" },
      { href: "/admin/warlords", label: "武将マスタ" },
      { href: "/admin/conquest-rules", label: "国制覇条件" },
      { href: "/admin/metaverse", label: "メタバース内覧" },
      { href: "/admin/ai-image-settings", label: "AI画像生成設定" },
    ],
  },
  {
    title: "LINE",
    items: [
      { href: "/admin/line-settings", label: "LIFF/LINE設定" },
      { href: "/admin/line-broadcast", label: "LINE一斉配信" },
    ],
  },
  {
    title: "代理店・城主プラン",
    items: [
      { href: "/admin/agents", label: "代理店管理" },
      { href: "/admin/castles", label: "城マスタ" },
      { href: "/admin/castle-lord-contracts", label: "城主契約" },
      { href: "/admin/external-orders", label: "外部注文管理" },
      { href: "/admin/castle-lord-plan-settings", label: "城主プラン設定" },
      { href: "/admin/castle-commission-rules", label: "土地報酬ルール" },
      { href: "/admin/castle-commissions", label: "土地報酬元帳" },
      { href: "/admin/castle-payouts", label: "土地報酬支払" },
      { href: "/admin/castle-lord-manual", label: "城主プランマニュアル", emphasis: true },
    ],
  },
  {
    title: "決済・売上",
    items: [
      { href: "/admin/payment-settings", label: "決済設定" },
      { href: "/admin/purchases", label: "購入履歴" },
      { href: "/admin/agent-sales", label: "売上ログ" },
    ],
  },
  {
    // 「はじまりの旅」は既存の「本日の任務」とは別機能(指示書§4.3)。
    // 設定・教材・進捗・特典をこのグループにまとめる。
    title: "はじまりの旅",
    items: [
      { href: "/admin/journey", label: "設定・緊急停止" },
      { href: "/admin/journey/courses", label: "コース・教材" },
      { href: "/admin/journey/enrollments", label: "ユーザー別進捗" },
      { href: "/admin/journey/rewards", label: "特典の付与状況" },
    ],
  },
  {
    title: "コンテンツ・導線",
    items: [
      { href: "/admin/links", label: "送客導線" },
      { href: "/admin/legal-pages", label: "法的ページ" },
      { href: "/admin/faqs", label: "FAQ" },
      { href: "/admin/announcements", label: "お知らせ" },
    ],
  },
  {
    title: "ユーザー・ログ",
    items: [
      { href: "/admin/users", label: "ユーザー検索" },
      { href: "/admin/achievements", label: "実績ログ" },
      { href: "/admin/audit-logs", label: "操作ログ" },
    ],
  },
  {
    title: "運用監視",
    items: [
      { href: "/admin/integration-recovery", label: "連携復旧管理" },
      { href: "/admin/operations-health", label: "運用監視" },
    ],
  },
];

const TOP_LEVEL_ITEMS: NavItem[] = [
  { href: "/admin", label: "管理画面トップ" },
  { href: "/admin/help", label: "使い方ガイド", emphasis: true },
];

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`block rounded-md px-3 py-1.5 text-sm ${
        active
          ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          : item.emphasis
            ? "font-semibold text-red-700 hover:bg-zinc-100 dark:text-red-400 dark:hover:bg-zinc-900"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function AdminSidebarContent({ onNavigate = () => {} }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {TOP_LEVEL_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
      {NAV_GROUPS.map((group) => {
        const containsActive = group.items.some((item) => item.href === pathname);
        return (
          <details key={group.title} open={containsActive} className="group">
            <summary className="cursor-pointer list-none rounded-md px-3 py-1.5 text-xs font-bold tracking-wide text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
              <span className="inline-block w-3 transition-transform group-open:rotate-90">▶</span> {group.title}
            </summary>
            <div className="ml-2 flex flex-col gap-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="border-b border-zinc-200 bg-white px-4 py-2 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          ☰ メニュー
        </button>
      </div>
      {mobileOpen && (
        <div className="border-b border-zinc-200 bg-white md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <AdminSidebarContent onNavigate={() => setMobileOpen(false)} />
        </div>
      )}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-950">
        <AdminSidebarContent />
      </aside>
    </>
  );
}
