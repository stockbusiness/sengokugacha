"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PropertyRow = {
  id: string;
  property_code: string;
  name: string;
  status: "draft" | "coming_soon" | "published" | "hidden";
  is_recommended: boolean;
  is_new: boolean;
  metaverse_areas: { id: string; name: string } | null;
  metaverse_building_types: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<PropertyRow["status"], string> = {
  draft: "下書き",
  coming_soon: "近日公開",
  published: "公開中",
  hidden: "非公開",
};

export default function MetaversePropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/metaverse/properties")
      .then((res) => res.json())
      .then((data) => {
        setProperties(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">区画・物件管理({properties.length}件)</h1>
          <Link
            href="/admin/metaverse/properties/new"
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            新規物件を追加
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">区画番号</th>
              <th className="px-4 py-2">物件名</th>
              <th className="px-4 py-2">エリア</th>
              <th className="px-4 py-2">建物タイプ</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 font-mono text-xs text-zinc-500">{p.property_code}</td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{p.name}</td>
                <td className="px-4 py-2">{p.metaverse_areas?.name ?? "-"}</td>
                <td className="px-4 py-2">{p.metaverse_building_types?.name ?? "-"}</td>
                <td className="px-4 py-2">{STATUS_LABEL[p.status]}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/metaverse/properties/${p.id}`}
                    className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {properties.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ物件が登録されていません。</p>}
      </div>
    </div>
  );
}
