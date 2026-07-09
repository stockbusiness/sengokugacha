"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Animation = {
  id: string;
  animation_key: string;
  name: string;
  rarity: string;
  status: string;
  priority: number;
  weight: number;
  file_size_bytes: number;
  duration_ms: number;
  poster_url: string | null;
  updated_at: string;
};

const RARITY_LABEL: Record<string, string> = {
  ANY: "共通",
  common: "足軽級",
  mid: "武将級",
  rare: "大名級",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開",
  stopped: "停止",
};

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

export default function GachaAnimationsPage() {
  const [items, setItems] = useState<Animation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusFilter, setStatusFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (rarityFilter) params.set("rarity", rarityFilter);
    if (keyword) params.set("keyword", keyword);

    return fetch(`/api/admin/gacha-animations?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { items: Animation[] }) => {
        setItems(data.items ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, rarityFilter]);

  async function handleDisable(id: string) {
    if (!confirm("この動画演出を無効化しますか?")) return;
    const res = await fetch(`/api/admin/gacha-animations/${id}/disable`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      setMessage(body.error ?? "無効化に失敗しました。");
      return;
    }
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("この動画演出を削除しますか?(使用済みの場合は無効化のみ行われます)")) return;
    const res = await fetch(`/api/admin/gacha-animations/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setMessage(body.error ?? "削除に失敗しました。");
      return;
    }
    setMessage(body.hardDeleted ? "削除しました。" : "使用済みのため無効化しました。");
    await load();
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">ガチャ動画演出</h1>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
            レアリティ(足軽級/武将級/大名級)ごとに再生する動画演出を管理します。
          </p>
        </div>
        <Link
          href="/admin/gacha-animations/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          新規登録
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開状態</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">すべて</option>
            <option value="draft">下書き</option>
            <option value="published">公開</option>
            <option value="stopped">停止</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">レアリティ</span>
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">すべて</option>
            <option value="ANY">共通</option>
            <option value="common">足軽級</option>
            <option value="mid">武将級</option>
            <option value="rare">大名級</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">キーワード</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="動画名 / animationKey"
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              onClick={() => load()}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:text-zinc-300"
            >
              検索
            </button>
          </div>
        </label>
      </div>

      {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}
      {status === "loading" && <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
      {status === "error" && <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}

      {status === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">サムネイル</th>
                <th className="px-3 py-2">動画名 / key</th>
                <th className="px-3 py-2">レアリティ</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">優先度</th>
                <th className="px-3 py-2">容量</th>
                <th className="px-3 py-2">長さ</th>
                <th className="px-3 py-2">更新日時</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={item.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-3 py-2">
                    {item.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster_url} alt="" className="h-14 w-8 rounded object-cover" />
                    ) : (
                      <span className="block h-14 w-8 rounded bg-zinc-100 dark:bg-zinc-800" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-600">{item.animation_key}</p>
                  </td>
                  <td className="px-3 py-2">{RARITY_LABEL[item.rarity] ?? item.rarity}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[item.status] ?? item.status}</td>
                  <td className="px-3 py-2">{item.priority}</td>
                  <td className="px-3 py-2">{formatBytes(item.file_size_bytes)}</td>
                  <td className="px-3 py-2">{formatDuration(item.duration_ms)}</td>
                  <td className="px-3 py-2 text-xs">{new Date(item.updated_at).toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Link href={`/admin/gacha-animations/${item.id}`} className="text-xs font-semibold text-zinc-700 underline dark:text-zinc-300">
                        編集
                      </Link>
                      <button onClick={() => handleDisable(item.id)} className="text-xs font-semibold text-amber-700 underline dark:text-amber-400">
                        無効化
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-red-700 underline dark:text-red-400">
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-zinc-400 dark:text-zinc-600">
                    該当する動画演出がありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
