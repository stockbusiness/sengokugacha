"use client";

import { useState } from "react";
import { useEffect } from "react";

type AuditLog = {
  id: string;
  actor_name: string | null;
  action: string;
  details: string | null;
  created_at: string;
  // 20260729000001 で追加。対象の特定用。
  target_type: string | null;
  target_id: string | null;
  before_snapshot: unknown;
  after_snapshot: unknown;
  // 20260815000001 で追加(ADR-10)。指示書§7が求める6項目を揃えるため。
  admin_role: string | null;
  request_id: string | null;
  operation_reason: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  manager: "本部管理者",
  operator: "担当者",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit-logs")
      .then((res) => res.json())
      .then((data) => {
        setLogs(Array.isArray(data) ? data : []);
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
        軽微な編集は対象外)。担当者名・権限はログイン時の自己申告のため、共有パスワード運用下では
        厳密な本人確認ではありません。行をクリックすると対象と変更前後の値を確認できます。
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">担当者</th>
              <th className="px-4 py-2">権限</th>
              <th className="px-4 py-2">操作</th>
              <th className="px-4 py-2">操作理由</th>
              <th className="px-4 py-2">詳細</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const expanded = expandedId === log.id;
              const hasDetail = !!(log.target_type || log.before_snapshot || log.after_snapshot || log.request_id);
              return (
                <>
                  <tr
                    key={log.id}
                    onClick={() => hasDetail && setExpandedId(expanded ? null : log.id)}
                    className={`border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${hasDetail ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900" : ""}`}
                  >
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {new Date(log.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{log.actor_name ?? "(未入力)"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {log.admin_role ? (ROLE_LABEL[log.admin_role] ?? log.admin_role) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">{log.action}</td>
                    <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">{log.operation_reason ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {log.details ?? ""}
                      {hasDetail && <span className="ml-1 text-zinc-400">{expanded ? "▾" : "▸"}</span>}
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${log.id}-detail`} className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-900/50">
                      <td colSpan={6} className="px-4 py-3">
                        <dl className="space-y-2 text-xs">
                          {log.target_type && (
                            <div>
                              <dt className="inline text-zinc-500 dark:text-zinc-400">対象: </dt>
                              <dd className="inline font-mono text-zinc-700 dark:text-zinc-300">
                                {log.target_type} / {log.target_id ?? "—"}
                              </dd>
                            </div>
                          )}
                          {log.request_id && (
                            <div>
                              <dt className="inline text-zinc-500 dark:text-zinc-400">リクエストID: </dt>
                              <dd className="inline font-mono text-zinc-700 dark:text-zinc-300">{log.request_id}</dd>
                            </div>
                          )}
                          {(log.before_snapshot != null || log.after_snapshot != null) && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Snapshot label="変更前" value={log.before_snapshot} />
                              <Snapshot label="変更後" value={log.after_snapshot} />
                            </div>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {logs.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ操作ログがありません。</p>}
      </div>
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div>
      <p className="text-zinc-500 dark:text-zinc-400">{label}</p>
      <pre className="mt-1 max-h-48 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
