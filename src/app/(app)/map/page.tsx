"use client";

import { useEffect, useRef, useState } from "react";
import { TextLink } from "@/components/ui/Button";
import { JapanMap, type RegionMarker } from "@/components/map/JapanMap";
import { MapProgress } from "@/components/map/MapProgress";
import { ProvinceButton, getProvinceStatus } from "@/components/map/ProvinceButton";
import { RegionPanel } from "@/components/map/RegionPanel";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { ProvinceProgress, ProvinceProgressSummary } from "@/lib/provinces";

type Status = "loading" | "ready" | "error";

const REGION_ORDER = ["東北", "関東", "中部", "近畿", "中国", "四国", "九州", "北陸"];

// public/map-japan.webp 上でのおおよその地方位置(画像全体に対する百分率座標)。
// 正確な行政境界ではなく、地図をタップした際に対応する地方パネルへスクロールするための目安。
const REGION_MAP_POSITIONS: Record<string, { x: number; y: number }> = {
  東北: { x: 69.0, y: 45.3 },
  関東: { x: 62.0, y: 59.8 },
  中部: { x: 53.0, y: 57.0 },
  北陸: { x: 44.0, y: 51.0 },
  近畿: { x: 42.5, y: 64.0 },
  中国: { x: 28.2, y: 65.5 },
  四国: { x: 39.0, y: 70.4 },
  九州: { x: 15.8, y: 76.0 },
};

export default function MapPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [summary, setSummary] = useState<ProvinceProgressSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const regionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await ensureLiffSession();
        if (session.status === "redirecting") return;

        const res = await fetch("/api/map");
        if (!res.ok) throw new Error("進捗の取得に失敗しました。");
        const data: ProvinceProgressSummary = await res.json();
        if (cancelled) return;
        setSummary(data);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const nonFinalProvinces = summary?.provinces.filter((p) => !p.isFinalProvince) ?? [];
  const mino = summary?.provinces.find((p) => p.isFinalProvince) ?? null;
  const conqueredCount = summary?.conqueredCount ?? 0;

  const regionGroups = REGION_ORDER.map((region) => ({
    region,
    provinces: nonFinalProvinces.filter((p) => p.region === region),
  })).filter((g) => g.provinces.length > 0);

  const markers: RegionMarker[] = regionGroups
    .filter((g) => REGION_MAP_POSITIONS[g.region])
    .map((g) => ({
      region: g.region,
      x: REGION_MAP_POSITIONS[g.region].x,
      y: REGION_MAP_POSITIONS[g.region].y,
      conquered: g.provinces.filter((p) => p.isConquered).length,
      total: g.provinces.length,
    }));

  const selectedProvince =
    summary?.provinces.find((p) => p.id === selectedProvinceId && !p.isFinalProvince) ?? null;

  function scrollToRegion(region: string) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    regionRefs.current[region]?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function handleSelectProvince(province: ProvinceProgress) {
    setSelectedProvinceId((prev) => (prev === province.id ? null : province.id));
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MapProgress conquered={conqueredCount} total={66} />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}
      {status === "error" && (
        <p className="rounded-2xl border border-crimson/50 bg-crimson-soft/40 p-4 text-center text-sm text-parchment">
          {errorMessage}
        </p>
      )}

      {status === "ready" && (
        <div className="space-y-6">
          <JapanMap markers={markers} onSelectRegion={scrollToRegion} />

          {selectedProvince && (
            <div className="rounded-xl border border-gold/40 bg-ink-raised/90 p-3 text-center text-sm text-parchment">
              {selectedProvince.isConquered
                ? `✓ ${selectedProvince.name}国は制圧済みです。`
                : `${selectedProvince.name}国はまだ制圧されていません。ガチャで3体の武将を集めましょう。`}
            </div>
          )}

          <div className="space-y-4">
            {regionGroups.map((group) => (
              <RegionPanel
                key={group.region}
                ref={(el) => {
                  regionRefs.current[group.region] = el;
                }}
                title={group.region}
                conquered={group.provinces.filter((p) => p.isConquered).length}
                total={group.provinces.length}
              >
                {group.provinces.map((p) => (
                  <ProvinceButton
                    key={p.id}
                    name={p.name}
                    status={getProvinceStatus(p, conqueredCount)}
                    selected={selectedProvinceId === p.id}
                    onSelect={() => handleSelectProvince(p)}
                  />
                ))}
              </RegionPanel>
            ))}
          </div>

          {mino && <MinoPanel province={mino} conqueredCount={conqueredCount} />}
        </div>
      )}

      <div className="mt-8 border-t border-gold/15 pt-6">
        <TextLink href="/regions">地方コンプ状況を見る</TextLink>
      </div>
    </div>
  );
}

function MinoPanel({ province, conqueredCount }: { province: ProvinceProgress; conqueredCount: number }) {
  const threshold = province.unlockConditionCount;
  const unlocked = threshold == null || conqueredCount >= threshold;

  return (
    <div className="rounded-2xl border border-gold bg-gradient-to-b from-crimson-soft/60 to-ink-raised/90 p-4 text-center shadow-lg shadow-black/30">
      <h2 className="font-heading mb-2 text-sm font-bold text-gold-soft">最終国</h2>

      {province.isConquered ? (
        <p className="rounded-lg border border-gold bg-gradient-to-b from-gold-soft to-gold px-4 py-3 font-bold text-ink">
          ✓ {province.name}国(天下統一達成)
        </p>
      ) : unlocked ? (
        <p className="rounded-lg border border-gold/40 bg-crimson-soft/60 px-4 py-3 font-semibold text-parchment">
          挑戦可能: {province.name}国
        </p>
      ) : (
        <p className="rounded-lg border border-gold/10 bg-ink px-4 py-3 font-medium text-parchment-dim/50">
          🔒 {province.name}国
          {threshold != null ? `(あと${Math.max(threshold - conqueredCount, 0)}国)` : ""}
        </p>
      )}
    </div>
  );
}
