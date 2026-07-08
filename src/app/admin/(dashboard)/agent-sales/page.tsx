"use client";

import { useEffect, useMemo, useState } from "react";

type AgentSale = {
  id: string;
  agentId: string;
  agentName: string;
  buyerDisplayName: string;
  amount: number;
  type: string;
  source: string;
  payoutStatus: "unpaid" | "paid";
  paidAt: string | null;
  createdAt: string;
};

export default function AgentSalesPage() {
  const [sales, setSales] = useState<AgentSale[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/agent-sales")
      .then((res) => res.json())
      .then((data) => {
        setSales(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function togglePayout(sale: AgentSale) {
    setTogglingId(sale.id);
    const nextStatus = sale.payoutStatus === "paid" ? "unpaid" : "paid";

    try {
      const res = await fetch(`/api/admin/agent-sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payout_status: nextStatus }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      // 失敗時は静かに再読み込みのみ行い、一覧の実際の状態に揃える。
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  const unpaidTotalsByAgent = useMemo(() => {
    const totals = new Map<string, { agentName: string; total: number }>();
    for (const s of sales) {
      if (s.payoutStatus !== "unpaid") continue;
      const entry = totals.get(s.agentId) ?? { agentName: s.agentName, total: 0 };
      entry.total += s.amount;
      totals.set(s.agentId, entry);
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total);
  }, [sales]);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">売上ログ({sales.length}件)</h1>
        {/* CSVファイルのダウンロードのためnext/linkではなく通常のaタグを使用する */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/admin/agent-sales?format=csv"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          CSVダウンロード
        </a>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Phase1は記録のみです。自己購入/紹介経由の判別手段が無いため type は一律 &quot;referral&quot;
        で記録されています。集計・ランク自動反映はPhase2以降です。金額は売上総額であり、
        実際の報酬額(手数料率反映後)の計算は別途手動で行ってください。
      </p>

      {unpaidTotalsByAgent.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">代理店別 未払い売上合計</p>
          <ul className="space-y-1 text-amber-700 dark:text-amber-400">
            {unpaidTotalsByAgent.map((a) => (
              <li key={a.agentName}>
                {a.agentName}: {a.total.toLocaleString()}円
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">代理店</th>
              <th className="px-4 py-2">購入者</th>
              <th className="px-4 py-2">金額</th>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">購入内容</th>
              <th className="px-4 py-2">支払い状況</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {new Date(s.createdAt).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{s.agentName}</td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{s.buyerDisplayName}</td>
                <td className="px-4 py-2">{s.amount.toLocaleString()}円</td>
                <td className="px-4 py-2">{s.type}</td>
                <td className="px-4 py-2">{s.source}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => togglePayout(s)}
                    disabled={togglingId === s.id}
                    className={
                      "rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 " +
                      (s.payoutStatus === "paid"
                        ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900")
                    }
                  >
                    {s.payoutStatus === "paid" ? "支払い済み" : "未払い"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ売上ログがありません。</p>}
      </div>
    </div>
  );
}
