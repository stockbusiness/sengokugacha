"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type CastleStatus = "draft" | "recruiting" | "published" | "hidden";

type Castle = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  status: CastleStatus;
  description: string | null;
  main_image_url: string | null;
  display_order: number;
};

const STATUS_OPTIONS: { value: CastleStatus; label: string }[] = [
  { value: "draft", label: "下書き(非公開)" },
  { value: "recruiting", label: "城主募集中" },
  { value: "published", label: "公開中" },
  { value: "hidden", label: "非公開" },
];

export default function CastleEditPage() {
  const { id } = useParams<{ id: string }>();
  const [castle, setCastle] = useState<Castle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/castles")
      .then((res) => res.json())
      .then((data: Castle[]) => {
        const found = data.find((c) => c.id === id) ?? null;
        setCastle(found);
        setStatus(found ? "ready" : "error");
      })
      .catch(() => setStatus("error"));
  }, [id]);

  async function handleSave() {
    if (!castle) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/castles/${castle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: castle.name,
          prefecture: castle.prefecture,
          region: castle.region,
          description: castle.description,
          main_image_url: castle.main_image_url,
          display_order: castle.display_order,
          status: castle.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessage("保存しました");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !castle) return <p className="text-red-700 dark:text-red-400">城が見つかりません。</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{castle.name}の編集</h1>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">城名</span>
        <input
          type="text"
          value={castle.name}
          onChange={(e) => setCastle({ ...castle, name: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <div className="flex gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">都道府県</span>
          <input
            type="text"
            value={castle.prefecture ?? ""}
            onChange={(e) => setCastle({ ...castle, prefecture: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">地方</span>
          <input
            type="text"
            value={castle.region ?? ""}
            onChange={(e) => setCastle({ ...castle, region: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開状態</span>
        <select
          value={castle.status}
          onChange={(e) => setCastle({ ...castle, status: e.target.value as CastleStatus })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">説明文</span>
        <textarea
          value={castle.description ?? ""}
          onChange={(e) => setCastle({ ...castle, description: e.target.value || null })}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          メイン画像URL(画像アップロードは今後の対応予定)
        </span>
        <input
          type="text"
          value={castle.main_image_url ?? ""}
          onChange={(e) => setCastle({ ...castle, main_image_url: e.target.value || null })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {message && <span className="text-xs text-zinc-500 dark:text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}
