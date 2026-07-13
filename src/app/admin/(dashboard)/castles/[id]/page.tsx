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

      <CastlePlotsSection castleId={castle.id} />
    </div>
  );
}

type PlotStatus =
  | "draft"
  | "available"
  | "reserved"
  | "application_pending"
  | "payment_pending"
  | "sold"
  | "cancelled"
  | "suspended";

type CastlePlot = {
  id: string;
  plot_code: string;
  name: string;
  price_yen: number;
  status: PlotStatus;
};

const PLOT_STATUS_LABEL: Record<PlotStatus, string> = {
  draft: "下書き(未割当)",
  available: "販売可能",
  reserved: "予約中",
  application_pending: "申込審査中",
  payment_pending: "入金待ち",
  sold: "販売済み",
  cancelled: "取消",
  suspended: "一時停止",
};

function CastlePlotsSection({ castleId }: { castleId: string }) {
  const [plots, setPlots] = useState<CastlePlot[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [count, setCount] = useState(10);
  const [codePrefix, setCodePrefix] = useState("A");
  const [priceYen, setPriceYen] = useState(300_000);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function fetchPlots() {
    fetch(`/api/admin/castles/${castleId}/plots`)
      .then((res) => res.json())
      .then((data) => {
        setPlots(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchPlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castleId]);

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/castles/${castleId}/plots/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, code_prefix: codePrefix, price_yen: priceYen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setStatus("loading");
      fetchPlots();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  const availableCount = plots.filter((p) => p.status !== "draft").length;

  return (
    <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          区画({plots.length}件、販売枠に紐づいた区画{availableCount}件)
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          事前に区画を「下書き」として登録しておくと、城主契約が有効化された際に販売枠の分だけ自動的に「販売可能」へ昇格します。
        </p>
      </div>

      <form
        onSubmit={handleBulkCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">件数</span>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">区画コード接頭辞</span>
          <input
            type="text"
            value={codePrefix}
            onChange={(e) => setCodePrefix(e.target.value)}
            className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">価格(円)</span>
          <input
            type="number"
            value={priceYen}
            onChange={(e) => setPriceYen(Number(e.target.value))}
            className="w-32 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {creating ? "作成中..." : "下書き区画をまとめて作成"}
        </button>
        {message && <span className="text-xs text-red-700 dark:text-red-400">{message}</span>}
      </form>

      {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
      {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}
      {status === "ready" && (
        <div className="space-y-1">
          {plots.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span>
                {p.plot_code} <span className="text-zinc-500 dark:text-zinc-400">{p.name}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-zinc-500 dark:text-zinc-400">{p.price_yen.toLocaleString()}円</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {PLOT_STATUS_LABEL[p.status]}
                </span>
              </span>
            </div>
          ))}
          {plots.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ区画が登録されていません。</p>
          )}
        </div>
      )}
    </div>
  );
}
