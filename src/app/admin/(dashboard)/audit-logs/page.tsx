"use client";

import { useEffect, useState } from "react";

type AuditLog = {
  id: string;
  actor_name: string | null;
  action: string;
  details: string | null;
  created_at: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/audit-logs")
      .then((res) => res.json())
      .then((data) => {
        setLogs(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">操作ログ(直近{logs.length}件)</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        金銭・法務・ゲーム経済に関わる主要な操作のみを記録しています(国/武将/代理店マスタ等の
        軽微な編集は対象外)。担当者名はログイン時の自己申告のため、共有パスワード運用下では
        厳密な本人確認ではありません。
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">担当者</th>
              <th className="px-4 py-2">操作</th>
              <th className="px-4 py-2">詳細</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {new Date(log.created_at).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{log.actor_name ?? "(未入力)"}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">{log.action}</td>
                <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">{log.details ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ操作ログがありません。</p>}
      </div>
    </div>
  );
}
