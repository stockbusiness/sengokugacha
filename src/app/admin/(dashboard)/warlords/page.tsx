"use client";

import { useEffect, useMemo, useState } from "react";

type Warlord = {
  id: string;
  province_id: string;
  name: string;
  rarity: string;
  slot_type: "common" | "mid" | "rare";
  stats_json: Record<string, number>;
  lore: string | null;
  image_url: string | null;
  gacha_reveal_animation_url: string | null;
  tenka_toitsu_image_url: string | null;
  provinces: { id: string; name: string; display_order: number | null } | null;
};

const SLOT_ORDER: Record<Warlord["slot_type"], number> = { common: 0, mid: 1, rare: 2 };
const SLOT_LABEL: Record<Warlord["slot_type"], string> = { common: "コモン枠", mid: "中間枠", rare: "レア枠" };

export default function WarlordsPage() {
  const [warlords, setWarlords] = useState<Warlord[]>([]);
  const [statsDraft, setStatsDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/warlords")
      .then((res) => res.json())
      .then((data: Warlord[]) => {
        setWarlords(data);
        setStatsDraft(Object.fromEntries(data.map((w) => [w.id, JSON.stringify(w.stats_json)])));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const grouped = useMemo(() => {
    const byProvince = new Map<string, Warlord[]>();
    for (const w of warlords) {
      const key = w.provinces?.id ?? w.province_id;
      if (!byProvince.has(key)) byProvince.set(key, []);
      byProvince.get(key)!.push(w);
    }
    return [...byProvince.values()]
      .map((group) => group.sort((a, b) => SLOT_ORDER[a.slot_type] - SLOT_ORDER[b.slot_type]))
      .sort((a, b) => (a[0].provinces?.display_order ?? 0) - (b[0].provinces?.display_order ?? 0));
  }, [warlords]);

  function updateField<K extends keyof Warlord>(id: string, key: K, value: Warlord[K]) {
    setWarlords((prev) => prev.map((w) => (w.id === id ? { ...w, [key]: value } : w)));
  }

  async function handleSave(warlord: Warlord) {
    setSavingId(warlord.id);
    setMessageById((prev) => ({ ...prev, [warlord.id]: "" }));

    let statsJson: unknown;
    try {
      statsJson = JSON.parse(statsDraft[warlord.id] ?? "{}");
    } catch {
      setMessageById((prev) => ({ ...prev, [warlord.id]: "ステータスのJSON形式が不正です" }));
      setSavingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/admin/warlords/${warlord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: warlord.name,
          rarity: warlord.rarity,
          lore: warlord.lore,
          stats_json: statsJson,
          image_url: warlord.image_url,
          gacha_reveal_animation_url: warlord.gacha_reveal_animation_url,
          tenka_toitsu_image_url: warlord.tenka_toitsu_image_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [warlord.id]: "保存しました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [warlord.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleImageUpload(warlord: Warlord, file: File) {
    setUploadingId(warlord.id);
    setMessageById((prev) => ({ ...prev, [warlord.id]: "" }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/warlords/${warlord.id}/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "画像のアップロードに失敗しました。");
      updateField(warlord.id, "image_url", data.image_url as string);
      setMessageById((prev) => ({ ...prev, [warlord.id]: "画像をアップロードしました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [warlord.id]: error instanceof Error ? error.message : "画像のアップロードに失敗しました。",
      }));
    } finally {
      setUploadingId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">武将マスタ({warlords.length}体)</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        国・スロット(コモン/中間/レア)の組み替えはガチャ抽選ロジックの前提を崩すため、管理画面からは変更できません。
      </p>

      {grouped.map((group) => (
        <section
          key={group[0].provinces?.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {group[0].provinces?.name ?? "(不明な国)"}
          </h2>
          <div className="space-y-4">
            {group.map((w) => (
              <div key={w.id} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium text-zinc-400">{SLOT_LABEL[w.slot_type]}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <TextField label="武将名" value={w.name} onChange={(v) => updateField(w.id, "name", v)} />
                  <TextField label="レアリティ" value={w.rarity} onChange={(v) => updateField(w.id, "rarity", v)} />
                  <TextField
                    label="画像URL"
                    value={w.image_url ?? ""}
                    onChange={(v) => updateField(w.id, "image_url", v || null)}
                  />
                </div>

                <div className="mt-2 flex items-center gap-3">
                  {w.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.image_url}
                      alt={w.name}
                      className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                  )}
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      画像をアップロード(自動でLINE表示用にリサイズされます)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingId === w.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) handleImageUpload(w, file);
                      }}
                      className="block text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
                    />
                    {uploadingId === w.id && (
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        アップロード中...
                      </span>
                    )}
                  </label>
                </div>

                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">逸話</span>
                  <textarea
                    value={w.lore ?? ""}
                    onChange={(e) => updateField(w.id, "lore", e.target.value || null)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    rows={2}
                  />
                </label>
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    ステータス(JSON)
                  </span>
                  <input
                    type="text"
                    value={statsDraft[w.id] ?? ""}
                    onChange={(e) => setStatsDraft((prev) => ({ ...prev, [w.id]: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>

                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => handleSave(w)}
                    disabled={savingId === w.id}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {savingId === w.id ? "保存中..." : "保存"}
                  </button>
                  {messageById[w.id] && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[w.id]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
