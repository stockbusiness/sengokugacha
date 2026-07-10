"use client";

import { useEffect, useState } from "react";

type Province = {
  id: string;
  name: string;
  region: string;
  is_final_province: boolean;
  unlock_condition_count: number | null;
  display_order: number | null;
  landmark_name: string | null;
  theme_description: string | null;
  has_castle_town: boolean;
  castle_town_concept_art_url: string | null;
};

export default function ProvincesPage() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/provinces")
      .then((res) => res.json())
      .then((data) => {
        setProvinces(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function updateField<K extends keyof Province>(id: string, key: K, value: Province[K]) {
    setProvinces((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)));
  }

  async function handleSave(province: Province) {
    setSavingId(province.id);
    setMessageById((prev) => ({ ...prev, [province.id]: "" }));

    try {
      const res = await fetch(`/api/admin/provinces/${province.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: province.name,
          region: province.region,
          display_order: province.display_order,
          unlock_condition_count: province.unlock_condition_count,
          landmark_name: province.landmark_name,
          theme_description: province.theme_description,
          has_castle_town: province.has_castle_town,
          castle_town_concept_art_url: province.castle_town_concept_art_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [province.id]: "保存しました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [province.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">国マスタ({provinces.length}国)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          日本地図に表示される66国+最終国(美濃)の名称・地方・並び順を編集します。「解放条件(制圧数)」は
          最終国にのみ表示され、他の国を何か国制圧したら挑戦可能になるかを設定します。「メタバース関連項目」は
          将来の機能用に用意した項目で、現時点ではゲーム画面に反映されません(入力しても動作は変わりません)。
        </p>
      </div>

      <div className="space-y-3">
        {provinces.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-end gap-3">
              <TextField label="国名" value={p.name} onChange={(v) => updateField(p.id, "name", v)} />
              <TextField label="地方" value={p.region} onChange={(v) => updateField(p.id, "region", v)} />
              <NumField
                label="表示順"
                value={p.display_order}
                onChange={(v) => updateField(p.id, "display_order", v)}
              />
              {p.is_final_province && (
                <NumField
                  label="解放条件(制圧数)"
                  value={p.unlock_condition_count}
                  onChange={(v) => updateField(p.id, "unlock_condition_count", v)}
                />
              )}
              {p.is_final_province && (
                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                  最終国
                </span>
              )}
            </div>

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">
                メタバース関連項目(将来用)
              </summary>
              <div className="mt-2 space-y-2">
                <TextField
                  label="ランドマーク名"
                  value={p.landmark_name ?? ""}
                  onChange={(v) => updateField(p.id, "landmark_name", v || null)}
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    世界観説明文
                  </span>
                  <textarea
                    value={p.theme_description ?? ""}
                    onChange={(e) => updateField(p.id, "theme_description", e.target.value || null)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    rows={2}
                  />
                </label>
                <TextField
                  label="城下町コンセプトアートURL"
                  value={p.castle_town_concept_art_url ?? ""}
                  onChange={(v) => updateField(p.id, "castle_town_concept_art_url", v || null)}
                />
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={p.has_castle_town}
                    onChange={(e) => updateField(p.id, "has_castle_town", e.target.checked)}
                  />
                  城下町3D空間を持つ国
                </label>
              </div>
            </details>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => handleSave(p)}
                disabled={savingId === p.id}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingId === p.id ? "保存中..." : "保存"}
              </button>
              {messageById[p.id] && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[p.id]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
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
        className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
