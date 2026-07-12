"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type Area = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isRecommended: boolean;
  isNew: boolean;
  publishedPropertyCount: number;
};

type MapHotspot = {
  id: string;
  areaId: string;
  areaName: string;
  positionX: number;
  positionY: number;
  label: string | null;
  icon: string | null;
};

type MapAreaPolygon = {
  id: string;
  slug: string;
  name: string;
  polygon: [number, number][];
};

type TownMap = {
  id: string;
  name: string;
  imageUrl: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  hotspots: MapHotspot[];
  areaPolygons: MapAreaPolygon[];
};

type Status = "loading" | "ready" | "error";

export default function MetaverseTourAreasPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [map, setMap] = useState<TownMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return Promise.all([
          fetch("/api/metaverse/areas").then((res) => res.json()),
          fetch("/api/metaverse/map").then((res) => res.json()),
        ]).then(([areaData, mapData]: [Area[], TownMap | null]) => {
          if (cancelled) return;
          setAreas(areaData);
          setMap(mapData);
          setStatus("ready");
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="エリア一覧" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          {map && (
            <div className="relative overflow-hidden rounded-2xl border border-gold/15 shadow-lg shadow-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={toDisplayUrl(map.imageUrl) ?? undefined} alt={map.name} className="w-full" />
              {map.areaPolygons.length > 0 && (
                <svg
                  viewBox={`0 0 ${map.viewBoxWidth} ${map.viewBoxHeight}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                >
                  {map.areaPolygons.map((a) => (
                    <polygon
                      key={a.id}
                      points={a.polygon.map(([x, y]) => `${x},${y}`).join(" ")}
                      className="cursor-pointer fill-gold/25 stroke-gold stroke-[6] transition hover:fill-gold/45"
                      onClick={() => router.push(`/metaverse-tour/areas/${a.id}`)}
                    >
                      <title>{a.name}</title>
                    </polygon>
                  ))}
                </svg>
              )}
              {map.hotspots
                .filter((h) => !map.areaPolygons.some((a) => a.id === h.areaId))
                .map((h) => (
                  <Link
                    key={h.id}
                    href={`/metaverse-tour/areas/${h.areaId}`}
                    style={{ left: `${h.positionX}%`, top: `${h.positionY}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold bg-ink/80 px-2 py-1 text-xs font-semibold text-gold-soft shadow-lg"
                  >
                    {h.icon ?? "📍"} {h.label ?? h.areaName}
                  </Link>
                ))}
            </div>
          )}

          {areas.map((area) => (
            <Link key={area.id} href={`/metaverse-tour/areas/${area.id}`} className="block">
              <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                <div className="flex items-center gap-3">
                  {area.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toDisplayUrl(area.thumbnailUrl) ?? undefined} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-ink-raised text-2xl">🏯</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-parchment">{area.name}</p>
                      {area.isNew && <span className="rounded-full bg-crimson px-1.5 py-0.5 text-[10px] font-bold text-parchment">NEW</span>}
                      {area.isRecommended && <span className="text-xs">⭐</span>}
                    </div>
                    {area.shortDescription && <p className="mt-0.5 text-xs text-parchment-dim">{area.shortDescription}</p>}
                    <p className="mt-1 text-xs text-gold-soft">公開中の区画: {area.publishedPropertyCount}件</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {areas.length === 0 && <p className="text-center text-sm text-parchment-dim">まだ公開中のエリアがありません。</p>}

          <div className="pt-4 text-center">
            <TextLink href="/metaverse-tour">← 内覧トップに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
