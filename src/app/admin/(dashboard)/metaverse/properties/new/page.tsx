"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Area = { id: string; name: string };

export default function NewMetaversePropertyPage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [propertyCode, setPropertyCode] = useState("");
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/metaverse/areas")
      .then((res) => res.json())
      .then((data: Area[]) => {
        setAreas(data);
        if (data.length > 0) setAreaId(data[0].id);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/metaverse/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_code: propertyCode, name, area_id: areaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      router.push(`/admin/metaverse/properties/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラーが発生しました。");
      setSaving(false);
    }
  }

  if (areas.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/admin/metaverse/properties" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← 区画・物件管理
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          先に「エリア管理」からエリアを1件以上登録してください。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <Link href="/admin/metaverse/properties" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
        ← 区画・物件管理
      </Link>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">新規物件を追加</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        ここでは基本情報のみ登録します。画像・内覧シーン(画像/動画)・説明ポイントは、保存後に移動する編集ページから追加してください。
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">区画番号</span>
          <input
            type="text"
            value={propertyCode}
            onChange={(e) => setPropertyCode(e.target.value)}
            placeholder="例: BUKE-A-001"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">物件名</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">エリア</span>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {saving ? "作成中..." : "作成して詳細を編集する"}
        </button>
      </form>
    </div>
  );
}
