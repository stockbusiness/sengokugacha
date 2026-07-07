"use client";

import { useEffect, useState } from "react";

type AgentSale = {
  id: string;
  agentName: string;
  buyerDisplayName: string;
  amount: number;
  type: string;
  source: string;
  createdAt: string;
};

export default function AgentSalesPage() {
  const [sales, setSales] = useState<AgentSale[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/agent-sales")
      .then((res) => res.json())
      .then((data) => {
        setSales(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">売上ログ({sales.length}件)</h1>
        <a
          href="/api/admin/agent-sales?format=csv"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          CSVダウンロード
        </a>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Phase1は記録のみです。自己購入/紹介経由の判別手段が無いため type は一律 &quot;referral&quot;
        で記録されています。集計・ランク自動反映はPhase2以降です。
      </p>

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
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ売上ログがありません。</p>}
      </div>
    </div>
  );
}
