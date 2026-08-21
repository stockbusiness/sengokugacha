import type { CommissionAdminNotice } from "@/modules/castle/domain/commission-admin-view";

// Passport実装指示書 PR-P1b。「Agencyへ移管済み／新規計上停止中」の表示。
//
// 空の一覧に「データがありません」とだけ出ると、障害や読み込み失敗と区別が付かない。
// なぜ空なのか(移管したので新規が発生しない)を、一覧より前に説明する。
export function CommissionMigrationNotice({
  notice,
  agencyUrl,
}: {
  notice: CommissionAdminNotice;
  // 代理店システムへの導線。遷移先が確定していない環境ではリンクを出さない。
  agencyUrl?: string | null;
}) {
  if (notice.kind === "none") return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
    >
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{notice.title}</p>
      <ul className="mt-2 space-y-1">
        {notice.lines.map((line) => (
          <li key={line} className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {line}
          </li>
        ))}
      </ul>
      {agencyUrl && (
        <a
          href={agencyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          代理店システムを開く
        </a>
      )}
    </div>
  );
}
