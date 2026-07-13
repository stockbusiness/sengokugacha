import Link from "next/link";
import { getHqCastleLordSummary } from "@/lib/castle-kpi";
import { getKpiSummary } from "@/lib/kpi";

// KPIは常に最新のDB状態を反映する必要があるため静的生成しない。
export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const [kpi, castleLordSummary] = await Promise.all([getKpiSummary(), getHqCastleLordSummary()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">管理画面</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="登録ユーザー数" value={kpi.totalUsers.toLocaleString()} />
        <KpiTile label="本日の新規登録" value={kpi.newUsersToday.toLocaleString()} />
        <KpiTile label="本日アクセスした人数" value={kpi.dau.toLocaleString()} />
        <KpiTile label="直近7日でアクセスした人数" value={kpi.wau.toLocaleString()} />
        <KpiTile label="本日のガチャ実行数" value={kpi.gachaDrawsToday.toLocaleString()} />
        <KpiTile label="本日の購入額" value={`¥${kpi.purchasesTodayYen.toLocaleString()}`} />
        <KpiTile label="今月の購入額" value={`¥${kpi.purchasesMonthYen.toLocaleString()}`} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">城主プラン</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="登録城数" value={castleLordSummary.castleCount.toLocaleString()} />
          <KpiTile label="有効な城主契約" value={castleLordSummary.activeContractCount.toLocaleString()} />
          <KpiTile label="審査・手続き中の契約" value={castleLordSummary.pendingContractCount.toLocaleString()} />
          <KpiTile label="土地販売総額" value={`¥${castleLordSummary.totalLandSalesYen.toLocaleString()}`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/help"
          className="rounded-xl border border-red-300 bg-red-50 p-5 hover:border-red-500 dark:border-red-900 dark:bg-red-950/30"
        >
          <p className="font-semibold text-red-800 dark:text-red-300">使い方ガイド</p>
          <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/70">各ページの目的・項目の意味・用語集</p>
        </Link>
        <Link
          href="/admin/line-settings"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">LIFF/LINE設定</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">LIFF ID・LINEログインチャネルIDの設定</p>
        </Link>
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
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">国(66国+最終国)の一覧・編集</p>
        </Link>
        <Link
          href="/admin/warlords"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">武将マスタ</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">武将の名前・画像・説明文の一覧・編集</p>
        </Link>
        <Link
          href="/admin/metaverse"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">メタバース内覧</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">城下町デジタル内覧のエリア・物件・問い合わせ管理</p>
        </Link>
        <Link
          href="/admin/agents"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">代理店管理</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">代理店の登録・紹介コード発行・ランク更新</p>
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
        <Link
          href="/admin/agent-sales"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">売上ログ</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">代理店経由の購入記録の一覧・CSV出力</p>
        </Link>
        <Link
          href="/admin/achievements"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">実績ログ</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">地方コンプ・天下統一達成者の一覧</p>
        </Link>
        <Link
          href="/admin/users"
          className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">ユーザー検索</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">表示名・LINEユーザーIDでのサポート検索</p>
        </Link>
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
