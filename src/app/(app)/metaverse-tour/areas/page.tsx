"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

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

type Status = "loading" | "ready" | "error";

export default function MetaverseTourAreasPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/metaverse/areas")
          .then((res) => res.json())
          .then((data: Area[]) => {
            if (cancelled) return;
            setAreas(data);
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
          {areas.map((area) => (
            <Link key={area.id} href={`/metaverse-tour/areas/${area.id}`} className="block">
              <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                <div className="flex items-center gap-3">
                  {area.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={area.thumbnailUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
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
