import Link from "next/link";
import { getAdminRole } from "@/lib/admin-session";
import LogoutButton from "./logout-button";
import { AdminThemeProvider } from "./theme-provider";
import { ThemeToggleButton } from "./theme-toggle-button";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const adminRole = await getAdminRole();
  return (
    <AdminThemeProvider>
      <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <nav className="flex flex-wrap gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-300">
              <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                管理画面
              </Link>
              <Link
                href="/admin/help"
                className="font-semibold text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                使い方ガイド
              </Link>
              <Link href="/admin/line-settings" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                LIFF/LINE設定
              </Link>
              <Link href="/admin/line-broadcast" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                LINE一斉配信
              </Link>
              <Link href="/admin/gacha-config" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                ガチャ設定
              </Link>
              <Link href="/admin/gacha-rates" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                排出率設定
              </Link>
              <Link href="/admin/gacha-animations" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                動画演出
              </Link>
              <Link href="/admin/provinces" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                国マスタ
              </Link>
              <Link href="/admin/warlords" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                武将マスタ
              </Link>
              <Link href="/admin/metaverse" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                メタバース内覧
              </Link>
              <Link href="/admin/ai-image-settings" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                AI画像生成設定
              </Link>
              <Link href="/admin/agents" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                代理店管理
              </Link>
              <Link href="/admin/links" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                送客導線
              </Link>
              <Link href="/admin/payment-settings" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                決済設定
              </Link>
              <Link href="/admin/purchases" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                購入履歴
              </Link>
              <Link href="/admin/agent-sales" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                売上ログ
              </Link>
              <Link href="/admin/achievements" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                実績ログ
              </Link>
              <Link href="/admin/users" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                ユーザー検索
              </Link>
              <Link href="/admin/legal-pages" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                法的ページ
              </Link>
              <Link href="/admin/faqs" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                FAQ
              </Link>
              <Link href="/admin/announcements" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                お知らせ
              </Link>
              <Link href="/admin/audit-logs" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                操作ログ
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              {adminRole && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    adminRole === "manager"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {adminRole === "manager" ? "本部管理者" : "本部担当者"}
                </span>
              )}
              <ThemeToggleButton />
              <LogoutButton />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </div>
    </AdminThemeProvider>
  );
}
