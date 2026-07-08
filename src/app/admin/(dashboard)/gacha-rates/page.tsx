"use client";

import { useEffect, useState } from "react";

type Tier = {
  id: string;
  tier_order: number;
  max_conquered_count: number | null;
  rare_rate: number;
  mid_rate: number;
};

export default function GachaRatesPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  const [newMax, setNewMax] = useState("");
  const [newRare, setNewRare] = useState("1");
  const [newMid, setNewMid] = useState("20");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    return fetch("/api/admin/gacha-rate-tiers")
      .then((res) => res.json())
      .then((data: Tier[]) => {
        setTiers(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  function updateField<K extends keyof Tier>(id: string, key: K, value: Tier[K]) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  }

  async function handleSave(tier: Tier) {
    setSavingId(tier.id);
    setMessageById((prev) => ({ ...prev, [tier.id]: "" }));

    try {
      const res = await fetch(`/api/admin/gacha-rate-tiers/${tier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier_order: tier.tier_order,
          max_conquered_count: tier.max_conquered_count,
          rare_rate: tier.rare_rate,
          mid_rate: tier.mid_rate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [tier.id]: "保存しました。" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [tier.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(tier: Tier) {
    if (!confirm(`階層${tier.tier_order}を削除しますか?`)) return;
    setSavingId(tier.id);

    try {
      const res = await fetch(`/api/admin/gacha-rate-tiers/${tier.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "削除に失敗しました。");
      }
      await load();
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [tier.id]: error instanceof Error ? error.message : "削除に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const nextOrder = tiers.length > 0 ? Math.max(...tiers.map((t) => t.tier_order)) + 1 : 1;
      const res = await fetch("/api/admin/gacha-rate-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier_order: nextOrder,
          max_conquered_count: newMax === "" ? null : Number(newMax),
          rare_rate: Number(newRare) / 100,
          mid_rate: Number(newMid) / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setNewMax("");
      setNewRare("1");
      setNewMid("20");
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">ガチャ排出率設定</h1>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          制圧済み国数に応じたレア/中間排出率の階層です。「階層適用の上限国数」が空欄の行は
          「それ以降すべて」を意味し、必ず最後の階層(最大の適用順)にしてください。
          ここで設定した値がそのまま抽選ロジックと、ユーザー向け排出率開示ページ(/rates)の
          両方に反映されます。
        </p>
      </div>

      <div className="space-y-3">
        {tiers
          .slice()
          .sort((a, b) => a.tier_order - b.tier_order)
          .map((tier) => (
            <div
              key={tier.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-end gap-3">
                <NumField
                  label="適用順"
                  value={tier.tier_order}
                  onChange={(v) => updateField(tier.id, "tier_order", v ?? 0)}
                />
                <NumField
                  label="階層適用の上限国数(空欄=それ以降すべて)"
                  value={tier.max_conquered_count}
                  onChange={(v) => updateField(tier.id, "max_conquered_count", v)}
                />
                <PercentField
                  label="レア排出率(%)"
                  value={tier.rare_rate}
                  onChange={(v) => updateField(tier.id, "rare_rate", v)}
                />
                <PercentField
                  label="中間排出率(%)"
                  value={tier.mid_rate}
                  onChange={(v) => updateField(tier.id, "mid_rate", v)}
                />
                <span className="pb-1.5 text-xs text-zinc-400 dark:text-zinc-600">
                  コモン: {(100 - tier.rare_rate * 100 - tier.mid_rate * 100).toFixed(1)}%
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => handleSave(tier)}
                  disabled={savingId === tier.id}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {savingId === tier.id ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => handleDelete(tier)}
                  disabled={savingId === tier.id}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                >
                  削除
                </button>
                {messageById[tier.id] && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[tier.id]}</span>
                )}
              </div>
            </div>
          ))}
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
      >
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">階層を追加</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              上限国数(空欄=それ以降すべて)
            </span>
            <input
              type="number"
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              className="w-40 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              レア排出率(%)
            </span>
            <input
              type="number"
              step="0.1"
              value={newRare}
              onChange={(e) => setNewRare(e.target.value)}
              className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              中間排出率(%)
            </span>
            <input
              type="number"
              step="0.1"
              value={newMid}
              onChange={(e) => setNewMid(e.target.value)}
              className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? "作成中..." : "追加"}
          </button>
        </div>
        {createError && <p className="text-xs text-red-700 dark:text-red-400">{createError}</p>}
      </form>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
