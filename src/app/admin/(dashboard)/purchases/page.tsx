"use client";

import { useEffect, useState } from "react";

type Purchase = {
  id: string;
  buyerDisplayName: string;
  itemType: string;
  amount: number;
  grantAmount: number;
  status: string;
  grantStatus: string;
  grantLastError: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未完了",
  processing: "処理中",
  completed: "完了",
  failed: "失敗",
  refunded: "返金済み",
};

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  function load() {
    return fetch("/api/admin/purchases")
      .then((res) => res.json())
      .then((data: Purchase[]) => {
        setPurchases(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRefund(purchase: Purchase) {
    if (
      !confirm(
        `${purchase.buyerDisplayName}様の購入(¥${purchase.amount.toLocaleString()})を返金しますか?\nStripe側でも実際に返金処理が行われ、付与済みのアイテムも取り消されます。`
      )
    ) {
      return;
    }

    setRefundingId(purchase.id);
    setMessageById((prev) => ({ ...prev, [purchase.id]: "" }));

    try {
      const res = await fetch(`/api/admin/purchases/${purchase.id}/refund`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "返金に失敗しました。");
      await load();
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [purchase.id]: error instanceof Error ? error.message : "返金に失敗しました。",
      }));
    } finally {
      setRefundingId(null);
    }
  }

  // 千ノ国パスポート 全体統合対応 実装計画(PR3)。決済は完了しているが権利付与に
  // 失敗した購入(grant_status='failed')を、権利付与ブロック(src/lib/purchase-grants.ts)
  // の再実行で復旧する。
  async function handleRetryGrant(purchase: Purchase) {
    setRetryingId(purchase.id);
    setMessageById((prev) => ({ ...prev, [purchase.id]: "" }));

    try {
      const res = await fetch(`/api/admin/purchases/${purchase.id}/retry-grant`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "再実行に失敗しました。");
      await load();
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [purchase.id]: error instanceof Error ? error.message : "再実行に失敗しました。",
      }));
    } finally {
      setRetryingId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">購入履歴({purchases.length}件)</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        「返金」を押すとStripe側で実際に返金処理が行われ、付与済みの石高/ガチャ券も取り消されます
        (取り消し後の残高が0を下回る場合は0になります)。完了済みの購入のみ返金できます。
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">日時</th>
              <th className="px-3 py-2">ユーザー</th>
              <th className="px-3 py-2">商品</th>
              <th className="px-3 py-2">金額</th>
              <th className="px-3 py-2">状態</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(p.createdAt).toLocaleString("ja-JP")}
                </td>
                <td className="px-3 py-2">{p.buyerDisplayName}</td>
                <td className="px-3 py-2">
                  {p.itemType === "kokudaka" ? `石高 ${p.grantAmount}` : `ガチャ券 ${p.grantAmount}枚`}
                </td>
                <td className="px-3 py-2">¥{p.amount.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      p.status === "completed"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : p.status === "refunded"
                          ? "text-amber-700 dark:text-amber-400"
                          : p.grantStatus === "failed"
                            ? "text-red-700 dark:text-red-400"
                            : "text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                    {p.grantStatus === "failed" && "(権利付与失敗)"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {p.status === "completed" && (
                    <button
                      onClick={() => handleRefund(p)}
                      disabled={refundingId === p.id}
                      className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {refundingId === p.id ? "処理中..." : "返金"}
                    </button>
                  )}
                  {p.status === "processing" && p.grantStatus === "failed" && (
                    <button
                      onClick={() => handleRetryGrant(p)}
                      disabled={retryingId === p.id}
                      className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                    >
                      {retryingId === p.id ? "再実行中..." : "権利付与を再実行"}
                    </button>
                  )}
                  {p.grantLastError && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">前回のエラー: {p.grantLastError}</p>
                  )}
                  {messageById[p.id] && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-400">{messageById[p.id]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
