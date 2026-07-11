"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PopularProperty = {
  propertyId: string;
  propertyName: string;
  detailViewCount: number;
  tourStartCount: number;
  favoriteCount: number;
};

type Analytics = {
  eventCountByType: Record<string, number>;
  popularProperties: PopularProperty[];
  totalTourStart: number;
  totalTourComplete: number;
  tourCompletionRate: number | null;
  totalInquiries: number;
  inquiryConversionRate: number | null;
  agentPerformance: { name: string; count: number }[];
};

function formatPercent(rate: number | null): string {
  if (rate == null) return "-";
  return `${Math.round(rate * 1000) / 10}%`;
}

export default function MetaverseAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/metaverse/analytics")
      .then((res) => res.json())
      .then((body: Analytics) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !data) return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">閲覧分析</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          直近の閲覧ログ(最大5,000件)から集計した参考値です。厳密な統計処理は行っていません。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="内覧開始数" value={data.totalTourStart} />
        <StatTile label="内覧完了率" value={formatPercent(data.tourCompletionRate)} />
        <StatTile label="相談申込数" value={data.totalInquiries} />
        <StatTile label="相談転換率" value={formatPercent(data.inquiryConversionRate)} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">人気物件(詳細閲覧数順)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-2">物件名</th>
                <th className="px-2 py-2">詳細閲覧</th>
                <th className="px-2 py-2">内覧開始</th>
                <th className="px-2 py-2">お気に入り</th>
              </tr>
            </thead>
            <tbody>
              {data.popularProperties.map((p) => (
                <tr key={p.propertyId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-2 py-2 text-zinc-900 dark:text-zinc-50">{p.propertyName}</td>
                  <td className="px-2 py-2">{p.detailViewCount}</td>
                  <td className="px-2 py-2">{p.tourStartCount}</td>
                  <td className="px-2 py-2">{p.favoriteCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.popularProperties.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ閲覧データがありません。</p>}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">代理店別 相談申込数</h2>
        <ul className="space-y-1 text-sm">
          {data.agentPerformance.map((a) => (
            <li key={a.name} className="flex items-center justify-between">
              <span className="text-zinc-700 dark:text-zinc-300">{a.name}</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{a.count}件</span>
            </li>
          ))}
          {data.agentPerformance.length === 0 && <p className="text-zinc-400">まだデータがありません。</p>}
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">イベント種別ごとの件数</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.eventCountByType).map(([type, count]) => (
            <span key={type} className="rounded-full border border-zinc-200 px-2 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              {type}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
