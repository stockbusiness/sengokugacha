"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PolygonCanvas } from "@/components/admin/PolygonCanvas";
import AiImageGeneratePanel from "@/components/admin/AiImageGeneratePanel";

type MapRow = {
  id: string;
  name: string;
  image_url: string;
  is_active: boolean;
  status: "draft" | "review" | "published" | "archived";
  viewbox_width: number;
  viewbox_height: number;
};

type Area = { id: string; name: string; polygon: [number, number][] | null };

type Hotspot = {
  id: string;
  area_id: string;
  position_x: number;
  position_y: number;
  label: string | null;
  metaverse_areas: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<MapRow["status"], string> = {
  draft: "下書き",
  review: "確認中",
  published: "公開中",
  archived: "アーカイブ",
};

export default function MetaverseMapsPage() {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  function loadAll() {
    return Promise.all([
      fetch("/api/admin/metaverse/maps").then((res) => res.json()),
      fetch("/api/admin/metaverse/areas").then((res) => res.json()),
    ]).then(([mapData, areaData]) => {
      setMaps(mapData);
      setAreas(areaData.filter((a: { status: string }) => a.status === "published"));
      setStatus("ready");
    });
  }

  useEffect(() => {
    loadAll().catch(() => setStatus("error"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/admin/metaverse/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName("");
      await loadAll();
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(map: MapRow) {
    await fetch(`/api/admin/metaverse/maps/${map.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !map.is_active }),
    });
    await loadAll();
  }

  async function handleStatusChange(map: MapRow, status: MapRow["status"]) {
    await fetch(`/api/admin/metaverse/maps/${map.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  async function handleDelete(mapId: string) {
    if (!confirm("このマップを削除しますか?配置したホットスポットも削除されます。")) return;
    await fetch(`/api/admin/metaverse/maps/${mapId}`, { method: "DELETE" });
    await loadAll();
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">全体マップ管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          城下町の俯瞰イラスト画像をアップロードし、画像上をクリックしてエリアへのホットスポット(点)またはポリゴン(領域)を配置します。
          LIFF側に表示されるのは「有効」かつ状態が「公開中」のマップのみです(下書き・確認中の間は管理画面でのみ確認できます)。
          マップが無い間は、これまでどおりカード一覧のみが表示されます。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">マップ名</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 岐阜城下町 全体マップ"
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            required
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {creating ? "作成中..." : "マップを追加"}
        </button>
      </form>

      <div className="space-y-3">
        {maps.map((map) => (
          <div key={map.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setExpandedId((prev) => (prev === map.id ? null : map.id))}
                className="text-left text-sm font-medium text-zinc-900 dark:text-zinc-50"
              >
                {expandedId === map.id ? "▾" : "▸"} {map.name}
                {!map.is_active && <span className="ml-2 text-xs text-zinc-400">(無効)</span>}
                {!map.image_url && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(画像未設定)</span>}
              </button>
              <div className="flex items-center gap-3 text-xs">
                <select
                  value={map.status}
                  onChange={(e) => handleStatusChange(map, e.target.value as MapRow["status"])}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button onClick={() => handleToggleActive(map)} className="text-zinc-500 hover:underline dark:text-zinc-400">
                  {map.is_active ? "無効にする" : "有効にする"}
                </button>
                <button onClick={() => handleDelete(map.id)} className="text-red-700 hover:underline dark:text-red-400">
                  削除
                </button>
              </div>
            </div>

            {expandedId === map.id && (
              <MapEditor map={map} areas={areas} onReload={loadAll} />
            )}
          </div>
        ))}
        {maps.length === 0 && <p className="text-sm text-zinc-400">まだマップが登録されていません。</p>}
      </div>
    </div>
  );
}

function MapEditor({ map, areas, onReload }: { map: MapRow; areas: Area[]; onReload: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [mode, setMode] = useState<"hotspot" | "polygon">("hotspot");
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [polygonAreaId, setPolygonAreaId] = useState("");
  const [savingPolygon, setSavingPolygon] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/metaverse/maps/${map.id}/hotspots`)
      .then((res) => res.json())
      .then((data: Hotspot[]) => setHotspots(data));
  }, [map.id]);

  async function handleSavePolygon() {
    if (drawingPoints.length < 3 || !polygonAreaId) return;
    setSavingPolygon(true);
    try {
      await fetch(`/api/admin/metaverse/areas/${polygonAreaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polygon: drawingPoints, map_id: map.id }),
      });
      setDrawingPoints([]);
      await onReload();
    } finally {
      setSavingPolygon(false);
    }
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`/api/admin/metaverse/maps/${map.id}/image`, { method: "POST", body: formData });
      await onReload();
    } finally {
      setUploading(false);
    }
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    setSelectedHotspotId(null);
    setPending({ x, y });
    setSelectedAreaId(areas[0]?.id ?? "");
  }

  async function handleConfirmPlacement() {
    if (!pending || !selectedAreaId) return;
    const res = await fetch(`/api/admin/metaverse/maps/${map.id}/hotspots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area_id: selectedAreaId, position_x: pending.x, position_y: pending.y }),
    });
    const created = await res.json();
    setHotspots((prev) => [...(prev ?? []), created]);
    setPending(null);
  }

  async function handleDeleteHotspot(hotspotId: string) {
    await fetch(`/api/admin/metaverse/map-hotspots/${hotspotId}`, { method: "DELETE" });
    setHotspots((prev) => (prev ?? []).filter((h) => h.id !== hotspotId));
    setSelectedHotspotId(null);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {map.image_url ? "マップ画像を差し替え" : "マップ画像をアップロード"}
        </span>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleImageUpload(file);
          }}
          className="block text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
      </label>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
        AI生成の場合も、必ず正方形(1:1)の構図で生成してください(座標系が正方形前提のため)。
      </p>
      <AiImageGeneratePanel
        entityType="metaverse_map"
        entityId={map.id}
        autoPrompt={`日本の戦国時代の城下町「${map.name}」を、山の上の城から川沿いに広がる城下町全体を見渡す、ドローン撮影のような壮大な俯瞰構図で描いてください。必ず正方形(1:1)の構図にしてください。地形(山・川・木々)や街並みの奥行き・光と影を丁寧に描き込み、ゲームエンジンでレンダリングしたような臨場感のある仕上がりにしてください。区画の境界を示す色分けやライン等の図示的な要素は入れないでください(実際のエリア範囲は別途管理画面側でポリゴンとして重ねて設定します)。`}
        currentImageUrl={map.image_url}
        onAdopted={() => onReload()}
      />

      {map.image_url && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMode("hotspot");
                setDrawingPoints([]);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "hotspot" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"}`}
            >
              点ホットスポット
            </button>
            <button
              onClick={() => {
                setMode("polygon");
                setPending(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "polygon" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"}`}
            >
              エリアポリゴン
            </button>
          </div>

          {mode === "hotspot" && (
            <>
              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                画像をクリックしてホットスポットを配置します。配置済みのピン(番号)をクリックすると削除できます。
              </p>
              <div className="relative inline-block max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={map.image_url}
                  alt={map.name}
                  onClick={handleImageClick}
                  className="max-h-[480px] max-w-full cursor-crosshair rounded-lg border border-zinc-200 dark:border-zinc-700"
                />
                {(hotspots ?? []).map((h, i) => (
                  <button
                    key={h.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPending(null);
                      setSelectedHotspotId(h.id);
                    }}
                    style={{ left: `${h.position_x}%`, top: `${h.position_y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold bg-red-700 px-2 py-1 text-xs font-bold text-white shadow-lg"
                    title={h.metaverse_areas?.name ?? h.area_id}
                  >
                    {i + 1}
                  </button>
                ))}
                {pending && (
                  <span
                    style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-zinc-400 bg-white/70 px-2 py-1 text-xs dark:bg-zinc-900/70"
                  >
                    ?
                  </span>
                )}
              </div>

              {pending && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">配置するエリア</span>
                    <select
                      value={selectedAreaId}
                      onChange={(e) => setSelectedAreaId(e.target.value)}
                      className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={handleConfirmPlacement}
                    disabled={!selectedAreaId}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    この位置に配置
                  </button>
                  <button onClick={() => setPending(null)} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                    キャンセル
                  </button>
                </div>
              )}
            </>
          )}

          {mode === "polygon" && (
            <>
              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                画像をクリックして頂点を追加し(3点以上)、下のフォームでエリアを選んで保存してください。
              </p>
              <PolygonCanvas
                imageUrl={map.image_url}
                viewBox={{ x: 0, y: 0, width: map.viewbox_width, height: map.viewbox_height }}
                polygons={areas
                  .filter((a) => a.polygon && a.polygon.length >= 3)
                  .map((a) => ({ id: a.id, points: a.polygon as [number, number][], color: "#f5c518", label: a.name }))}
                drawing={drawingPoints}
                onAddPoint={(point) => setDrawingPoints((prev) => [...prev, point])}
              />
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">保存先エリア</span>
                  <select
                    value={polygonAreaId}
                    onChange={(e) => setPolygonAreaId(e.target.value)}
                    className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    <option value="">選択してください</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={handleSavePolygon}
                  disabled={drawingPoints.length < 3 || !polygonAreaId || savingPolygon}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {savingPolygon ? "保存中..." : `このポリゴン(${drawingPoints.length}点)を保存`}
                </button>
                <button
                  onClick={() => setDrawingPoints((prev) => prev.slice(0, -1))}
                  disabled={drawingPoints.length === 0}
                  className="text-xs text-zinc-500 hover:underline disabled:opacity-30 dark:text-zinc-400"
                >
                  1点戻す
                </button>
                <button
                  onClick={() => setDrawingPoints([])}
                  disabled={drawingPoints.length === 0}
                  className="text-xs text-zinc-500 hover:underline disabled:opacity-30 dark:text-zinc-400"
                >
                  クリア
                </button>
              </div>
            </>
          )}

          {selectedHotspotId && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-zinc-700 dark:text-zinc-300">
                選択中: {hotspots?.find((h) => h.id === selectedHotspotId)?.metaverse_areas?.name}
              </span>
              <button
                onClick={() => handleDeleteHotspot(selectedHotspotId)}
                className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
              >
                このホットスポットを削除
              </button>
              <button
                onClick={() => setSelectedHotspotId(null)}
                className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
              >
                閉じる
              </button>
            </div>
          )}

          {areas.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              公開状態のエリアがありません。先に「エリア管理」でエリアを公開してください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
