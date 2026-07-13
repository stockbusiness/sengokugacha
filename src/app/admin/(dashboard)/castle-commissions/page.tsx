"use client";

import { useEffect, useState } from "react";

type LedgerLine = {
  id: string;
  recipient_type: string;
  recipient_user_id: string | null;
  recipient_agent_id: string | null;
  amount_yen: number;
  status: string;
  created_at: string;
  castles: { name: string } | null;
};

const RECIPIENT_LABEL: Record<string, string> = {
  lord: "城主",
  agency: "販売代理店",
  organization: "上位代理店・組織",
  hq: "本部",
  development_fund: "開発積立",
  regional_activity: "地域活動",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "処理待ち",
  held: "保留(猶予期間中)",
  confirmed: "確定済み",
  payable: "支払可能",
  paid: "支払済み",
  reversed: "取消・反対仕訳",
};

export default function CastleCommissionsPage() {
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function fetchLines() {
    fetch("/api/admin/commission-ledger")
      .then((res) => res.json())
      .then((data) => {
        setLines(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchLines();
  }, []);

  async function handleConfirmMatured() {
    setConfirming(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/commission-ledger/confirm-matured", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "確定処理に失敗しました。");
      setMessage(`${data.confirmedCount}件を確定しました`);
      setStatus("loading");
      fetchLines();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "確定処理に失敗しました。");
    } finally {
      setConfirming(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">土地販売報酬元帳({lines.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          区画購入が確定すると自動的に明細が計上されます(保留)。猶予期間(取消・返金期間)経過後に確定操作を行うと、支払対象になります。支払処理は代理店管理・ユーザー検索画面から受取者を特定し、別途実行してください。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleConfirmMatured}
          disabled={confirming}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {confirming ? "処理中..." : "猶予期間経過分を確定する"}
        </button>
        {message && <span className="text-xs text-zinc-500 dark:text-zinc-400">{message}</span>}
      </div>

      <div className="space-y-1">
        {lines.map((line) => (
          <div
            key={line.id}
            className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span>
              {RECIPIENT_LABEL[line.recipient_type] ?? line.recipient_type}
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{line.castles?.name ?? ""}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={line.amount_yen < 0 ? "text-red-700 dark:text-red-400" : ""}>
                {line.amount_yen.toLocaleString()}円
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {STATUS_LABEL[line.status] ?? line.status}
              </span>
            </span>
          </div>
        ))}
        {lines.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ報酬明細がありません。</p>}
      </div>
    </div>
  );
}
