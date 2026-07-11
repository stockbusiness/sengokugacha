"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PolygonCanvas, polygonBoundingBox } from "@/components/admin/PolygonCanvas";

type Area = { id: string; name: string; map_id: string | null; polygon: [number, number][] | null };
type MapRow = { id: string; image_url: string };
type Block = {
  id: string;
  area_id: string;
  block_code: string;
  display_name: string;
  polygon: [number, number][] | null;
  capacity: number | null;
  status: string;
};
type Property = {
  id: string;
  property_code: string;
  name: string;
  area_id: string;
  block_id: string | null;
  polygon: [number, number][] | null;
};

export default function MetaverseBlocksPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [blockDrawing, setBlockDrawing] = useState<[number, number][]>([]);
  const [newBlockCode, setNewBlockCode] = useState("");
  const [newBlockName, setNewBlockName] = useState("");

  const [plotDrawing, setPlotDrawing] = useState<[number, number][]>([]);
  const [newPlotCode, setNewPlotCode] = useState("");
  const [newPlotName, setNewPlotName] = useState("");

  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(5);
  const [gridPrefix, setGridPrefix] = useState("");
  const [generating, setGenerating] = useState(false);

  function loadAll() {
    return Promise.all([
      fetch("/api/admin/metaverse/areas").then((res) => res.json()),
      fetch("/api/admin/metaverse/maps").then((res) => res.json()),
      fetch("/api/admin/metaverse/blocks").then((res) => res.json()),
      fetch("/api/admin/metaverse/properties").then((res) => res.json()),
    ]).then(([areaData, mapData, blockData, propertyData]) => {
      setAreas(areaData);
      setMaps(mapData);
      setBlocks(blockData);
      setProperties(propertyData);
      if (!selectedAreaId && areaData[0]) setSelectedAreaId(areaData[0].id);
      setStatus("ready");
    });
  }

  useEffect(() => {
    loadAll().catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? null;
  const areaMap = maps.find((m) => m.id === selectedArea?.map_id) ?? null;
  const areaBlocks = blocks.filter((b) => b.area_id === selectedAreaId);
  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;
  const blockPlots = properties.filter((p) => p.block_id === selectedBlockId);

  const areaViewBox = useMemo(() => {
    if (!selectedArea?.polygon || selectedArea.polygon.length < 3) return null;
    return polygonBoundingBox(selectedArea.polygon);
  }, [selectedArea]);

  const blockViewBox = useMemo(() => {
    if (!selectedBlock?.polygon || selectedBlock.polygon.length < 3) return null;
    return polygonBoundingBox(selectedBlock.polygon);
  }, [selectedBlock]);

  async function handleCreateBlock() {
    if (blockDrawing.length < 3 || !newBlockCode.trim() || !newBlockName.trim()) return;
    const res = await fetch("/api/admin/metaverse/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area_id: selectedAreaId, block_code: newBlockCode.trim(), display_name: newBlockName.trim() }),
    });
    const created = await res.json();
    await fetch(`/api/admin/metaverse/blocks/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polygon: blockDrawing }),
    });
    setBlockDrawing([]);
    setNewBlockCode("");
    setNewBlockName("");
    await loadAll();
  }

  async function handleCreatePlot() {
    if (plotDrawing.length < 3 || !newPlotCode.trim() || !newPlotName.trim() || !selectedBlock) return;
    const res = await fetch("/api/admin/metaverse/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_code: newPlotCode.trim(), name: newPlotName.trim(), area_id: selectedAreaId }),
    });
    const created = await res.json();
    await fetch(`/api/admin/metaverse/properties/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_id: selectedBlock.id, polygon: plotDrawing }),
    });
    setPlotDrawing([]);
    setNewPlotCode("");
    setNewPlotName("");
    await loadAll();
  }

  async function handleGenerateGrid() {
    if (!selectedBlock?.polygon || !gridPrefix.trim() || gridRows < 1 || gridCols < 1) return;
    setGenerating(true);
    try {
      const box = polygonBoundingBox(selectedBlock.polygon, 0);
      const marginRatio = 0.08;
      const cellWidth = box.width / gridCols;
      const cellHeight = box.height / gridRows;
      let index = 1;
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const cellX = box.x + col * cellWidth;
          const cellY = box.y + row * cellHeight;
          const marginX = cellWidth * marginRatio;
          const marginY = cellHeight * marginRatio;
          const polygon: [number, number][] = [
            [Math.round(cellX + marginX), Math.round(cellY + marginY)],
            [Math.round(cellX + cellWidth - marginX), Math.round(cellY + marginY)],
            [Math.round(cellX + cellWidth - marginX), Math.round(cellY + cellHeight - marginY)],
            [Math.round(cellX + marginX), Math.round(cellY + cellHeight - marginY)],
          ];
          const code = `${gridPrefix.trim()}-${String(index).padStart(3, "0")}`;
          const res = await fetch("/api/admin/metaverse/properties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ property_code: code, name: code, area_id: selectedAreaId }),
          });
          const created = await res.json();
          await fetch(`/api/admin/metaverse/properties/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ block_id: selectedBlock.id, polygon }),
          });
          index++;
        }
      }
      setGridPrefix("");
      await loadAll();
    } finally {
      setGenerating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">街区・区画ポリゴン管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          エリアの中に「街区」を作り、街区の中に「区画」(物件)を配置します。表示される画像は全体マップ画像を
          そのエリア/街区の範囲だけ拡大表示したものです(専用の画像は不要)。エリアにポリゴンが未設定の場合は、
          先に「全体マップ管理」でエリアポリゴンを描いてください。区画は1つずつ描くか、下部の「自動生成」で
          街区内に格子状にまとめて作成できます。
        </p>
      </div>

      <label className="block max-w-sm">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">エリアを選択</span>
        <select
          value={selectedAreaId}
          onChange={(e) => {
            setSelectedAreaId(e.target.value);
            setSelectedBlockId(null);
            setBlockDrawing([]);
          }}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {!selectedArea?.polygon && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          このエリアにはポリゴンが未設定です。先に「全体マップ管理」でこのエリアのポリゴンを描いてください。
        </p>
      )}

      {selectedArea?.polygon && areaMap && areaViewBox && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            街区(クリックして頂点を追加、3点以上でフォームから確定)
          </h2>
          <PolygonCanvas
            imageUrl={areaMap.image_url}
            viewBox={areaViewBox}
            polygons={areaBlocks
              .filter((b) => b.polygon && b.polygon.length >= 3)
              .map((b) => ({
                id: b.id,
                points: b.polygon as [number, number][],
                color: b.id === selectedBlockId ? "#22c55e" : "#38bdf8",
                label: b.display_name,
              }))}
            drawing={blockDrawing}
            onAddPoint={(point) => setBlockDrawing((prev) => [...prev, point])}
            onSelectPolygon={(id) => {
              setSelectedBlockId(id);
              setBlockDrawing([]);
            }}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">街区コード</span>
              <input
                type="text"
                value={newBlockCode}
                onChange={(e) => setNewBlockCode(e.target.value)}
                placeholder="A01"
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">街区名</span>
              <input
                type="text"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                placeholder="第一街区"
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <button
              onClick={handleCreateBlock}
              disabled={blockDrawing.length < 3 || !newBlockCode.trim() || !newBlockName.trim()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              街区を作成({blockDrawing.length}点)
            </button>
            {blockDrawing.length > 0 && (
              <button onClick={() => setBlockDrawing([])} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                クリア
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-2 text-xs">
            {areaBlocks.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => {
                    setSelectedBlockId((prev) => (prev === b.id ? null : b.id));
                    setPlotDrawing([]);
                  }}
                  className={`rounded-full border px-3 py-1 ${selectedBlockId === b.id ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  {b.display_name}({b.block_code})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedBlock && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {selectedBlock.display_name}の区画({blockPlots.length}件)
          </h2>
          {!selectedBlock.polygon && (
            <p className="text-xs text-amber-600 dark:text-amber-400">この街区にはポリゴンがありません。</p>
          )}
          {selectedBlock.polygon && areaMap && blockViewBox && (
            <>
              <PolygonCanvas
                imageUrl={areaMap.image_url}
                viewBox={blockViewBox}
                polygons={blockPlots
                  .filter((p) => p.polygon && p.polygon.length >= 3)
                  .map((p) => ({ id: p.id, points: p.polygon as [number, number][], color: "#f97316", label: p.name }))}
                drawing={plotDrawing}
                onAddPoint={(point) => setPlotDrawing((prev) => [...prev, point])}
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">区画番号</span>
                  <input
                    type="text"
                    value={newPlotCode}
                    onChange={(e) => setNewPlotCode(e.target.value)}
                    placeholder="SNGK-KINKA-A01-001"
                    className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">物件名</span>
                  <input
                    type="text"
                    value={newPlotName}
                    onChange={(e) => setNewPlotName(e.target.value)}
                    className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <button
                  onClick={handleCreatePlot}
                  disabled={plotDrawing.length < 3 || !newPlotCode.trim() || !newPlotName.trim()}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  区画を作成({plotDrawing.length}点)
                </button>
                {plotDrawing.length > 0 && (
                  <button onClick={() => setPlotDrawing([])} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                    クリア
                  </button>
                )}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">区画を自動生成(格子状に一括作成)</p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">行数</span>
                    <input
                      type="number"
                      min={1}
                      value={gridRows}
                      onChange={(e) => setGridRows(Number(e.target.value))}
                      className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">列数</span>
                    <input
                      type="number"
                      min={1}
                      value={gridCols}
                      onChange={(e) => setGridCols(Number(e.target.value))}
                      className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">区画番号の接頭辞</span>
                    <input
                      type="text"
                      value={gridPrefix}
                      onChange={(e) => setGridPrefix(e.target.value)}
                      placeholder="SNGK-KINKA-A01"
                      className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </label>
                  <button
                    onClick={handleGenerateGrid}
                    disabled={generating || !gridPrefix.trim()}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {generating ? "生成中..." : `${gridRows * gridCols}区画を生成`}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-600">
                  生成後、各区画は「区画・物件管理」から名前・画像・内覧シーン等を編集してください(自動生成では区画番号と位置のみ設定されます)。
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
