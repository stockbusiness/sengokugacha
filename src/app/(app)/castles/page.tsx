"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type Castle = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  status: "recruiting" | "published";
  description: string | null;
  main_image_url: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  recruiting: "城主募集中",
  published: "公開中",
};

type Status = "loading" | "ready" | "error";

export default function CastlesPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [castles, setCastles] = useState<Castle[]>([]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/castles")
          .then((res) => res.json())
          .then((data: Castle[]) => {
            if (cancelled) return;
            setCastles(data);
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
      <PageHeader title="全国のお城一覧" subtitle="城主が担当する城・地域と、販売中の区画を紹介します。" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          {castles.map((castle) => (
            <Link key={castle.id} href={`/castles/${castle.id}`} className="block">
              <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                <div className="flex items-center gap-3">
                  {castle.main_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toDisplayUrl(castle.main_image_url) ?? undefined}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-ink-raised text-2xl">🏯</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-parchment">{castle.name}</p>
                      <span className="rounded-full bg-crimson/70 px-1.5 py-0.5 text-[10px] font-bold text-parchment">
                        {STATUS_LABEL[castle.status] ?? castle.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-parchment-dim">{castle.prefecture ?? castle.region ?? ""}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {castles.length === 0 && <p className="text-center text-sm text-parchment-dim">まだ公開中の城がありません。</p>}

          <div className="pt-4 text-center">
            <TextLink href="/">← ホームに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
