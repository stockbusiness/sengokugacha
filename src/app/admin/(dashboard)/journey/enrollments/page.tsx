"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Enrollment = {
  enrollmentId: string;
  userId: string;
  displayName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  completedMissions: number;
  anomalies: string[];
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: "進行中",
  completed: "修了",
  withdrawn: "取りやめ",
};

export default function AdminJourneyEnrollmentsPage() {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  useEffect(() => {
    fetch("/api/admin/journey/enrollments")
      .then((res) => res.json())
      .then((data: Enrollment[]) => {
        setRows(Array.isArray(data) ? data : []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  const flaggedCount = rows.filter((row) => row.anomalies.length > 0).length;
  const visible = onlyFlagged ? rows.filter((row) => row.anomalies.length > 0) : rows;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/journey" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← はじまりの旅
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">ユーザー別進捗({rows.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          「要確認」は短時間の連続完了や自由記述の使い回しを機械的に拾ったものです。
          <strong>不正と断定するものではなく、自動で止めることもしません。</strong>
          気になる場合のみ個別にご確認ください。
        </p>
      </div>

      {flaggedCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          要確認のみ表示({flaggedCount}件)
        </label>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">参加者</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2">完了数</th>
              <th className="px-4 py-2">開始</th>
              <th className="px-4 py-2">確認事項</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((row) => (
              <tr key={row.enrollmentId} className={row.anomalies.length > 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{row.displayName ?? "(未設定)"}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{STATUS_LABEL[row.status] ?? row.status}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{row.completedMissions}</td>
                <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(row.startedAt).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
                  {row.anomalies.join(" / ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">該当する参加者がいません。</p>}
      </div>
    </div>
  );
}
