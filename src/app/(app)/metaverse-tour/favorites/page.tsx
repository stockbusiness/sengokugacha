"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type PropertySummary = {
  id: string;
  name: string;
  areaName: string;
  mainImageUrl: string | null;
};

type Status = "loading" | "ready" | "error";

export default function MetaverseTourFavoritesPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<PropertySummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/metaverse/favorites")
          .then((res) => res.json())
          .then((data: PropertySummary[]) => {
            if (cancelled) return;
            setFavorites(data);
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
      <PageHeader title="お気に入り" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          {favorites.map((p) => (
            <Link key={p.id} href={`/metaverse-tour/properties/${p.id}`} className="block">
              <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                <div className="flex items-center gap-3">
                  {p.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toDisplayUrl(p.mainImageUrl) ?? undefined} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-ink-raised text-xl">🏠</div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-parchment">{p.name}</p>
                    <p className="text-xs text-parchment-dim">{p.areaName}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {favorites.length === 0 && <p className="text-center text-sm text-parchment-dim">まだお気に入りがありません。</p>}

          <div className="pt-4 text-center">
            <TextLink href="/metaverse-tour">← 内覧トップに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
