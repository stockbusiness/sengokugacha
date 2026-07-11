"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Area = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  status: "draft" | "published";
  display_order: number | null;
  is_recommended: boolean;
  is_new: boolean;
};

type BuildingType = { id: string; name: string; display_order: number | null };

export default function MetaverseAreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [buildingTypes, setBuildingTypes] = useState<BuildingType[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newBuildingType, setNewBuildingType] = useState("");

  function loadAll() {
    return Promise.all([
      fetch("/api/admin/metaverse/areas").then((res) => res.json()),
      fetch("/api/admin/metaverse/building-types").then((res) => res.json()),
    ]).then(([areaData, buildingTypeData]) => {
      setAreas(areaData);
      setBuildingTypes(buildingTypeData);
      setStatus("ready");
    });
  }

  useEffect(() => {
    loadAll().catch(() => setStatus("error"));
  }, []);

  function updateField<K extends keyof Area>(id: string, key: K, value: Area[K]) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)));
  }

  async function handleSave(area: Area) {
    setSavingId(area.id);
    setMessageById((prev) => ({ ...prev, [area.id]: "" }));

    try {
      const res = await fetch(`/api/admin/metaverse/areas/${area.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: area.slug,
          name: area.name,
          short_description: area.short_description,
          status: area.status,
          display_order: area.display_order,
          is_recommended: area.is_recommended,
          is_new: area.is_new,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [area.id]: "保存しました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [area.id]: error instanceof Error ? error.message : "保存に失敗しました。",
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
      const res = await fetch("/api/admin/metaverse/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug, name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setNewSlug("");
      setNewName("");
      await loadAll();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateBuildingType(e: React.FormEvent) {
    e.preventDefault();
    if (!newBuildingType.trim()) return;
    await fetch("/api/admin/metaverse/building-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBuildingType.trim() }),
    });
    setNewBuildingType("");
    await loadAll();
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">エリア管理({areas.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          「状態」を「公開」にするとLIFF・外部内覧ページに表示されます。「下書き」の間は表示されません。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">slug(URL用の識別子)</span>
          <input
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">エリア名</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            required
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {creating ? "作成中..." : "エリアを追加"}
        </button>
        {createError && <p className="w-full text-sm text-red-700 dark:text-red-400">{createError}</p>}
      </form>

      <div className="space-y-3">
        {areas.map((area) => (
          <div key={area.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-end gap-3">
              <TextField label="slug" value={area.slug} onChange={(v) => updateField(area.id, "slug", v)} />
              <TextField label="エリア名" value={area.name} onChange={(v) => updateField(area.id, "name", v)} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">状態</span>
                <select
                  value={area.status}
                  onChange={(e) => updateField(area.id, "status", e.target.value as Area["status"])}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="draft">下書き</option>
                  <option value="published">公開</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={area.is_recommended}
                  onChange={(e) => updateField(area.id, "is_recommended", e.target.checked)}
                />
                おすすめ
              </label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={area.is_new}
                  onChange={(e) => updateField(area.id, "is_new", e.target.checked)}
                />
                新着
              </label>
            </div>

            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">短い説明</span>
              <input
                type="text"
                value={area.short_description ?? ""}
                onChange={(e) => updateField(area.id, "short_description", e.target.value || null)}
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => handleSave(area)}
                disabled={savingId === area.id}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingId === area.id ? "保存中..." : "保存"}
              </button>
              {messageById[area.id] && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[area.id]}</span>
              )}
            </div>
          </div>
        ))}
        {areas.length === 0 && <p className="text-sm text-zinc-400">まだエリアが登録されていません。</p>}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">建物タイプ</h2>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          物件登録時に選択する建物タイプ(例: 標準武家屋敷、上位武家屋敷、商人屋敷)を管理します。
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {buildingTypes.map((bt) => (
            <li
              key={bt.id}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              {bt.name}
            </li>
          ))}
        </ul>
        <form onSubmit={handleCreateBuildingType} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newBuildingType}
            onChange={(e) => setNewBuildingType(e.target.value)}
            placeholder="新しい建物タイプ名"
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            追加
          </button>
        </form>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
