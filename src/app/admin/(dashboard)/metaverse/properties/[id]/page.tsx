"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Area = { id: string; name: string };
type BuildingType = { id: string; name: string };

type PropertyImage = { id: string; image_url: string; display_order: number };
type Scene = {
  id: string;
  name: string;
  image_url: string;
  description: string | null;
  is_published: boolean;
  allow_zoom: boolean;
  video_url: string | null;
  video_duration_ms: number | null;
};

type PropertyDetail = {
  id: string;
  property_code: string;
  name: string;
  area_id: string;
  building_type_id: string | null;
  short_description: string | null;
  description: string | null;
  main_image_url: string | null;
  feature_tags: string[];
  intended_use: string | null;
  status: "draft" | "coming_soon" | "published" | "hidden";
  is_recommended: boolean;
  is_new: boolean;
  internal_price_yen: number | null;
  internal_rights_note: string | null;
  internal_benefits_note: string | null;
  images: PropertyImage[];
  scenes: Scene[];
};

type Hotspot = {
  id: string;
  title: string;
  description: string | null;
  position_x: number;
  position_y: number;
  status: "available_now" | "planned" | "future_concept";
  is_published: boolean;
};

export default function EditMetaversePropertyPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [buildingTypes, setBuildingTypes] = useState<BuildingType[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all([
      fetch(`/api/admin/metaverse/properties/${propertyId}`).then((res) => res.json()),
      fetch("/api/admin/metaverse/areas").then((res) => res.json()),
      fetch("/api/admin/metaverse/building-types").then((res) => res.json()),
    ]).then(([propertyData, areaData, buildingTypeData]) => {
      setProperty(propertyData);
      setAreas(areaData);
      setBuildingTypes(buildingTypeData);
      setStatus("ready");
    });
  }, [propertyId]);

  useEffect(() => {
    load().catch(() => setStatus("error"));
  }, [load]);

  function updateField<K extends keyof PropertyDetail>(key: K, value: PropertyDetail[K]) {
    setProperty((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!property) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/admin/metaverse/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_code: property.property_code,
          name: property.name,
          area_id: property.area_id,
          building_type_id: property.building_type_id,
          short_description: property.short_description,
          description: property.description,
          feature_tags: property.feature_tags,
          intended_use: property.intended_use,
          status: property.status,
          is_recommended: property.is_recommended,
          is_new: property.is_new,
          internal_price_yen: property.internal_price_yen,
          internal_rights_note: property.internal_rights_note,
          internal_benefits_note: property.internal_benefits_note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setSaveMessage("保存しました");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(file: File, setAsMain: boolean) {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("set_as_main", String(setAsMain));
      const res = await fetch(`/api/admin/metaverse/properties/${propertyId}/images`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setSaveMessage("画像のアップロードに失敗しました。");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    await fetch(`/api/admin/metaverse/property-images/${imageId}`, { method: "DELETE" });
    await load();
  }

  async function handleResetMainImage() {
    await fetch(`/api/admin/metaverse/properties/${propertyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ main_image_url: null }),
    });
    await load();
  }

  async function handleAddScene(e: React.FormEvent) {
    e.preventDefault();
    if (!newSceneName.trim()) return;
    await fetch(`/api/admin/metaverse/properties/${propertyId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSceneName.trim() }),
    });
    setNewSceneName("");
    await load();
  }

  async function handleDeleteScene(sceneId: string) {
    await fetch(`/api/admin/metaverse/scenes/${sceneId}`, { method: "DELETE" });
    await load();
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !property) return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/metaverse/properties" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
        ← 区画・物件管理
      </Link>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{property.name}</h1>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">基本情報</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          「公開状態」を「公開中」または「近日公開」にするとLIFF・外部内覧ページに表示されます。「下書き」「非公開」は表示されません。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="区画番号">
            <input
              type="text"
              value={property.property_code}
              onChange={(e) => updateField("property_code", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </Field>
          <Field label="物件名">
            <input
              type="text"
              value={property.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </Field>
          <Field label="エリア">
            <select
              value={property.area_id}
              onChange={(e) => updateField("area_id", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="建物タイプ">
            <select
              value={property.building_type_id ?? ""}
              onChange={(e) => updateField("building_type_id", e.target.value || null)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">(未設定)</option>
              {buildingTypes.map((bt) => (
                <option key={bt.id} value={bt.id}>
                  {bt.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="公開状態">
            <select
              value={property.status}
              onChange={(e) => updateField("status", e.target.value as PropertyDetail["status"])}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="draft">下書き</option>
              <option value="coming_soon">近日公開</option>
              <option value="published">公開中</option>
              <option value="hidden">非公開</option>
            </select>
          </Field>
          <div className="flex items-end gap-3 pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={property.is_recommended}
                onChange={(e) => updateField("is_recommended", e.target.checked)}
              />
              おすすめ
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" checked={property.is_new} onChange={(e) => updateField("is_new", e.target.checked)} />
              新着
            </label>
          </div>
        </div>

        <Field label="短い説明">
          <input
            type="text"
            value={property.short_description ?? ""}
            onChange={(e) => updateField("short_description", e.target.value || null)}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="詳細説明">
          <textarea
            value={property.description ?? ""}
            onChange={(e) => updateField("description", e.target.value || null)}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="想定用途">
          <input
            type="text"
            value={property.intended_use ?? ""}
            onChange={(e) => updateField("intended_use", e.target.value || null)}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="特徴タグ(カンマ区切り)">
          <input
            type="text"
            value={property.feature_tags.join(", ")}
            onChange={(e) =>
              updateField(
                "feature_tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)
              )
            }
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          社内記録用(プレイヤーには表示されません)
        </h2>
        <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
          価格・権利内容・特典は、アプリ内非販売方針のためLIFF・外部内覧ページには一切表示されません。将来の営業活動・準備のための社内記録としてのみ利用してください。
        </p>
        <Field label="想定価格(円、社内参考値)">
          <input
            type="number"
            value={property.internal_price_yen ?? ""}
            onChange={(e) => updateField("internal_price_yen", e.target.value === "" ? null : Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="権利内容メモ">
          <textarea
            value={property.internal_rights_note ?? ""}
            onChange={(e) => updateField("internal_rights_note", e.target.value || null)}
            rows={2}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="特典メモ">
          <textarea
            value={property.internal_benefits_note ?? ""}
            onChange={(e) => updateField("internal_benefits_note", e.target.value || null)}
            rows={2}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {saveMessage && <span className="text-sm text-zinc-500 dark:text-zinc-400">{saveMessage}</span>}
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">画像ギャラリー</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          物件一覧・詳細ページに表示する画像です。「メイン」バッジの画像が一覧のサムネイルとして使われます。
          未設定の場合は、エリア管理ページの「デフォルト画像設定」で登録した共通画像が使われます。
        </p>
        <div className="flex flex-wrap gap-3">
          {property.images.map((img) => (
            <div key={img.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt="" className="h-24 w-24 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700" />
              {property.main_image_url === img.image_url && (
                <span className="absolute left-1 top-1 rounded bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  メイン
                </span>
              )}
              <button
                onClick={() => handleDeleteImage(img.id)}
                className="mt-1 block w-full text-center text-[11px] text-red-700 hover:underline dark:text-red-400"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">画像を追加(メイン画像として設定)</span>
          <input
            type="file"
            accept="image/*"
            disabled={uploadingImage}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleImageUpload(file, true);
            }}
            className="block text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
        </label>
        {property.main_image_url && (
          <button
            onClick={handleResetMainImage}
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            メイン画像をデフォルトに戻す(共通のデフォルト画像設定を使う)
          </button>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">内覧シーン({property.scenes.length}件)</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          外部内覧ページ(スワイプで切り替わる画面)で表示するシーンです。各シーンをクリックして展開すると、
          画像・動画・説明ポイント(タップすると説明が出る印)を設定できます。「公開する」を押したシーンのみ表示されます。
        </p>
        <div className="space-y-2">
          {property.scenes.map((scene) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              expanded={expandedSceneId === scene.id}
              onToggle={() => setExpandedSceneId((prev) => (prev === scene.id ? null : scene.id))}
              onReload={load}
              onDelete={() => handleDeleteScene(scene.id)}
            />
          ))}
        </div>
        <form onSubmit={handleAddScene} className="flex gap-2">
          <input
            type="text"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            placeholder="新しいシーン名(例: 外観、正門、玄関)"
            className="flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
            シーンを追加
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function SceneRow({
  scene,
  expanded,
  onToggle,
  onReload,
  onDelete,
}: {
  scene: Scene;
  expanded: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null);
  const [newHotspotTitle, setNewHotspotTitle] = useState("");

  useEffect(() => {
    if (!expanded || hotspots !== null) return;
    fetch(`/api/admin/metaverse/scenes/${scene.id}/hotspots`)
      .then((res) => res.json())
      .then((data: Hotspot[]) => setHotspots(data));
  }, [expanded, scene.id, hotspots]);

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`/api/admin/metaverse/scenes/${scene.id}/image`, { method: "POST", body: formData });
      await onReload();
    } finally {
      setUploading(false);
    }
  }

  async function handleVideoUpload(file: File) {
    setUploadingVideo(true);
    setVideoError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/metaverse/scenes/${scene.id}/video`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "動画のアップロードに失敗しました。");
      await onReload();
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : "動画のアップロードに失敗しました。");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleVideoDelete() {
    setUploadingVideo(true);
    setVideoError(null);
    try {
      const res = await fetch(`/api/admin/metaverse/scenes/${scene.id}/video`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await onReload();
    } catch {
      setVideoError("動画の削除に失敗しました。");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function togglePublished() {
    await fetch(`/api/admin/metaverse/scenes/${scene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: !scene.is_published }),
    });
    await onReload();
  }

  async function handleAddHotspot(e: React.FormEvent) {
    e.preventDefault();
    if (!newHotspotTitle.trim()) return;
    const res = await fetch(`/api/admin/metaverse/scenes/${scene.id}/hotspots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newHotspotTitle.trim(), position_x: 50, position_y: 50 }),
    });
    const created = await res.json();
    setHotspots((prev) => [...(prev ?? []), created]);
    setNewHotspotTitle("");
  }

  async function handleUpdateHotspot(hotspot: Hotspot) {
    await fetch(`/api/admin/metaverse/scene-hotspots/${hotspot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: hotspot.title,
        description: hotspot.description,
        position_x: hotspot.position_x,
        position_y: hotspot.position_y,
        status: hotspot.status,
      }),
    });
  }

  async function handleDeleteHotspot(hotspotId: string) {
    await fetch(`/api/admin/metaverse/scene-hotspots/${hotspotId}`, { method: "DELETE" });
    setHotspots((prev) => (prev ?? []).filter((h) => h.id !== hotspotId));
  }

  return (
    <div className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <button onClick={onToggle} className="text-left text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {expanded ? "▾" : "▸"} {scene.name} {!scene.is_published && <span className="text-xs text-zinc-400">(非公開)</span>}
        </button>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={togglePublished} className="text-zinc-500 hover:underline dark:text-zinc-400">
            {scene.is_published ? "非公開にする" : "公開する"}
          </button>
          <button onClick={onDelete} className="text-red-700 hover:underline dark:text-red-400">
            削除
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {scene.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.image_url} alt="" className="h-32 w-full rounded-lg object-cover" />
          ) : (
            <p className="text-xs text-zinc-400">まだ画像が設定されていません。</p>
          )}
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

          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              シーン動画(任意。設定すると外部内覧ページで静止画の代わりに動画を再生します)
            </p>
            {scene.video_url ? (
              <div className="space-y-2">
                <video src={scene.video_url} controls playsInline className="h-32 w-full rounded-lg bg-black object-contain" />
                <p className="text-[11px] text-zinc-400">
                  {scene.video_duration_ms != null ? `長さ: ${(scene.video_duration_ms / 1000).toFixed(1)}秒` : null}
                </p>
                <button
                  onClick={handleVideoDelete}
                  disabled={uploadingVideo}
                  className="text-[11px] text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  動画を削除(静止画のみに戻す)
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="video/mp4"
                disabled={uploadingVideo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleVideoUpload(file);
                }}
                className="block text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
              />
            )}
            {uploadingVideo && <p className="mt-1 text-[11px] text-zinc-400">処理中...</p>}
            {videoError && <p className="mt-1 text-[11px] text-red-700 dark:text-red-400">{videoError}</p>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">説明ポイント</p>
            <div className="space-y-2">
              {(hotspots ?? []).map((h, i) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border border-zinc-100 p-2 dark:border-zinc-800">
                  <input
                    type="text"
                    value={h.title}
                    onChange={(e) => {
                      const next = [...(hotspots ?? [])];
                      next[i] = { ...h, title: e.target.value };
                      setHotspots(next);
                    }}
                    onBlur={() => handleUpdateHotspot(h)}
                    className="w-32 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <input
                    type="number"
                    value={h.position_x}
                    onChange={(e) => {
                      const next = [...(hotspots ?? [])];
                      next[i] = { ...h, position_x: Number(e.target.value) };
                      setHotspots(next);
                    }}
                    onBlur={() => handleUpdateHotspot(h)}
                    className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    title="X座標(0〜100)"
                  />
                  <input
                    type="number"
                    value={h.position_y}
                    onChange={(e) => {
                      const next = [...(hotspots ?? [])];
                      next[i] = { ...h, position_y: Number(e.target.value) };
                      setHotspots(next);
                    }}
                    onBlur={() => handleUpdateHotspot(h)}
                    className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    title="Y座標(0〜100)"
                  />
                  <button onClick={() => handleDeleteHotspot(h.id)} className="text-[11px] text-red-700 hover:underline dark:text-red-400">
                    削除
                  </button>
                </div>
              ))}
              {hotspots !== null && hotspots.length === 0 && (
                <p className="text-xs text-zinc-400">まだ説明ポイントがありません。</p>
              )}
              {hotspots === null && <p className="text-xs text-zinc-400">読み込み中...</p>}
            </div>
            {hotspots !== null && (
              <form onSubmit={handleAddHotspot} className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newHotspotTitle}
                  onChange={(e) => setNewHotspotTitle(e.target.value)}
                  placeholder="新しい説明ポイントのタイトル"
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button type="submit" className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
                  追加
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
