import Link from "next/link";
import LogoutButton from "./logout-button";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              管理画面
            </Link>
            <Link href="/admin/gacha-config" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              ガチャ設定
            </Link>
            <Link href="/admin/provinces" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              国マスタ
            </Link>
            <Link href="/admin/warlords" className="hover:text-zinc-900 dark:hover:text-zinc-50">
              武将マスタ
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
          </nav>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
    </div>
  );
}
