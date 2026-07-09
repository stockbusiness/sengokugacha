import Link from "next/link";

// ホーム/国家ダッシュボードから各ハブページへの入口。詳細な説明・外部リンクは
// ハブページ側(/academy, /market, /events)に集約する。
export function AcademyHubCard() {
  return (
    <Link
      href="/academy"
      className="block rounded-lg border border-gold/25 px-3 py-4 text-center text-xs font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
    >
      <p className="text-lg">📜</p>
      <p className="mt-1">AI寺子屋</p>
    </Link>
  );
}
