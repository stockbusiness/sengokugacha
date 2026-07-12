"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toDisplayUrl } from "@/lib/image-url";

type HistoryRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  target: string | null;
  prompt: string;
  provider: string;
  model: string;
  adopted: boolean;
  image_url: string | null;
  created_at: string;
};

type HistoryResponse = {
  summary: {
    total: number;
    adopted: number;
    byProvider: Record<string, number>;
    byEntityType: Record<string, number>;
    limit: number;
  };
  rows: HistoryRow[];
};

const ENTITY_TYPE_LABEL: Record<string, string> = {
  warlord: "武将カード",
  metaverse_area: "エリア画像",
  metaverse_property: "物件画像",
  metaverse_scene: "内覧シーン画像",
  metaverse_map: "全体マップ画像",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

export default function AiImageHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/ai-image-history")
      .then((res) => res.json())
      .then((body: HistoryResponse) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !data) return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  const { summary, rows } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ai-image-settings" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← AI画像生成設定
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">AI画像生成 履歴・使用状況</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          直近{summary.limit}件の生成リクエストの一覧です。採用済みのものはプレビュー画像を表示します
          (未採用の生成はプレビュー時に破棄しているため、画像そのものは残っていません)。
          金額(コスト)はモデル・サイズで単価が変わり不正確になりやすいため、件数のみ表示しています。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="生成回数(直近)" value={summary.total} />
        <StatCard label="採用数" value={summary.adopted} />
        <StatCard
          label="プロバイダ内訳"
          value={Object.entries(summary.byProvider)
            .map(([provider, count]) => `${provider === "gemini" ? "Gemini" : "OpenAI"}: ${count}`)
            .join(" / ") || "-"}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start gap-3 p-3">
              {row.adopted && row.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={toDisplayUrl(row.image_url) ?? undefined} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700" />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-900">
                  未採用
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    {ENTITY_TYPE_LABEL[row.entity_type] ?? row.entity_type}
                  </span>
                  {row.target && <span className="text-zinc-400 dark:text-zinc-600">target={row.target}</span>}
                  <span className="text-zinc-400 dark:text-zinc-600">{row.provider === "gemini" ? "Gemini" : "OpenAI"} / {row.model}</span>
                  {row.adopted && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                      採用済み
                    </span>
                  )}
                  <span className="ml-auto text-zinc-400 dark:text-zinc-600">{formatDate(row.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-zinc-700 dark:text-zinc-300" title={row.prompt}>
                  {row.prompt}
                </p>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ生成履歴がありません。</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-400 dark:text-zinc-600">{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
