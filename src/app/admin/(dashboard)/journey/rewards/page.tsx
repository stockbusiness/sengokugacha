"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 特典(付与要求)の管理。
//
// 指示書§4.2: 失敗した付与要求の再実行 / Wallet未送信の付与要求の取消 /
// Wallet側で正式に取消済みの取引に対する訂正記録 / 滞留中・上限保留中の一覧。
// §11: いずれも本部管理者(manager)限定・操作理由必須・監査ログ必須。
//
// 実際のWallet送信はPR5。ここでの「再実行」は送信待ち(PENDING)へ戻すところまで。

type RewardRow = {
  id: string;
  userId: string;
  displayName: string | null;
  missionTitle: string | null;
  amount: number;
  status: string;
  completionSource: string;
  commonUserId: string | null;
  attemptCount: number;
  lastError: string | null;
  walletTransactionId: string | null;
  createdAt: string;
  stale: boolean;
};

type Summary = {
  succeededTotal: number;
  inFlightTotal: number;
  limitHeldTotal: number;
  courseCap: number;
  periodCap: number;
  capReached: boolean;
  staleCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "送信待ち",
  PROCESSING: "送信中",
  SUCCEEDED: "付与済み",
  FAILED: "送信失敗",
  LIMIT_HELD: "上限保留",
  CANCELLED: "取消(未送信)",
  REVERSED: "取消(Wallet訂正済み)",
};

const FILTERS = ["すべて", "要対応", "送信待ち", "送信失敗", "上限保留", "付与済み"] as const;

export default function AdminJourneyRewardsPage() {
  const [rows, setRows] = useState<RewardRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("すべて");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/journey/rewards")
      .then((res) => res.json())
      .then((data: { rows: RewardRow[]; summary: Summary }) => {
        setRows(data.rows ?? []);
        setSummary(data.summary ?? null);
        setStatus("ready");
      });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
  }, []);

  async function act(row: RewardRow, action: "retry" | "cancel" | "reverse" | "release") {
    const reason = window.prompt("操作理由を入力してください（監査ログに残ります）");
    if (reason === null || reason.trim().length === 0) return;

    let walletReversalTransactionId: string | null = null;
    if (action === "reverse") {
      walletReversalTransactionId = window.prompt("Wallet側の取消取引IDを入力してください");
      if (!walletReversalTransactionId) return;
    }

    setBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/journey/rewards/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, walletReversalTransactionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作に失敗しました。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  const visible = rows.filter((row) => {
    switch (filter) {
      case "要対応":
        return row.stale || row.status === "FAILED" || row.status === "LIMIT_HELD";
      case "送信待ち":
        return row.status === "PENDING";
      case "送信失敗":
        return row.status === "FAILED";
      case "上限保留":
        return row.status === "LIMIT_HELD";
      case "付与済み":
        return row.status === "SUCCEEDED";
      default:
        return true;
    }
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/admin/journey" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← はじまりの旅
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">特典の付与状況({rows.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Wallet がまだ本番稼働していないため、現在すべての要求は「送信待ち」のまま保留されます。
          稼働後にまとめて送信できるよう記録だけを残しています。
          再実行・取消・訂正は本部管理者のみ行え、操作理由が監査ログに残ります。
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="付与済み" value={summary.succeededTotal} />
          <Stat label="送信中・待ち" value={summary.inFlightTotal} />
          <Stat label="上限保留中" value={summary.limitHeldTotal} />
          <Stat label="要対応（滞留）" value={summary.staleCount} highlight={summary.staleCount > 0} />
        </div>
      )}

      {summary?.capReached && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          付与総量が上限に達しています（コース上限 {summary.courseCap.toLocaleString()} / 期間上限{" "}
          {summary.periodCap.toLocaleString()}）。上限は「はじまりの旅」の設定画面から変更できます。
        </p>
      )}

      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{message}</p>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item} onClick={() => setFilter(item)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === item
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}>
            {item}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((row) => (
          <div key={row.id} className={`rounded-xl border p-4 ${row.stale ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {row.displayName ?? "(未設定)"} — {row.missionTitle ?? "ミッション"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.amount.toLocaleString()} / {STATUS_LABEL[row.status] ?? row.status}
                  {row.completionSource === "SELF_REPORTED" && " / 自己申告での完了"}
                  {row.stale && " / 滞留しています"}
                  {!row.commonUserId && " / 共通ID未解決"}
                  {row.attemptCount > 0 && ` / 送信試行${row.attemptCount}回`}
                </p>
                <p className="text-xs text-zinc-400">{new Date(row.createdAt).toLocaleString("ja-JP")}</p>
                {row.lastError && (
                  <p className="mt-1 break-all text-xs text-red-700 dark:text-red-400">{row.lastError}</p>
                )}
                {row.walletTransactionId && (
                  <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    Wallet取引ID: {row.walletTransactionId}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {row.status === "FAILED" && (
                  <ActionButton label="再実行する" onClick={() => act(row, "retry")} disabled={busyId === row.id} />
                )}
                {row.status === "LIMIT_HELD" && (
                  <ActionButton label="保留を解除" onClick={() => act(row, "release")} disabled={busyId === row.id} />
                )}
                {["PENDING", "FAILED", "LIMIT_HELD"].includes(row.status) && !row.walletTransactionId && (
                  <ActionButton label="取り消す" onClick={() => act(row, "cancel")} disabled={busyId === row.id} />
                )}
                {row.status === "SUCCEEDED" && (
                  <ActionButton label="Wallet取消を記録" onClick={() => act(row, "reverse")} disabled={busyId === row.id} />
                )}
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">該当する要求がありません。</p>}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
      {label}
    </button>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-800"}`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">{value.toLocaleString()}</p>
    </div>
  );
}
