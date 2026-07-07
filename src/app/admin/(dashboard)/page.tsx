import Link from "next/link";

export default function AdminIndexPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">管理画面</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/gacha-config"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">ガチャ設定</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">無料/有料の1日上限、イベントプリセット</p>
        </Link>
        <Link
          href="/admin/provinces"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">国マスタ</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">provinces の一覧・編集</p>
        </Link>
        <Link
          href="/admin/warlords"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">武将マスタ</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">warlords の一覧・編集</p>
        </Link>
        <Link
          href="/admin/agents"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">代理店管理</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">agents の作成・referral_code発行・ランク更新</p>
        </Link>
        <Link
          href="/admin/links"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">送客導線</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">AIアート教室・NFTマーケット・評議員募集への遷移URL</p>
        </Link>
        <Link
          href="/admin/payment-settings"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">決済設定</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Stripeキー・購入パック価格の設定</p>
        </Link>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        売上ログ・実績ログ・ユーザー検索は、該当データが十分に溜まってから追加予定です。
      </p>
    </div>
  );
}
