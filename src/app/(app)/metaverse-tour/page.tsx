"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type Overview = {
  publishedPropertyCount: number;
  areaCount: number;
  recommendedProperties: { id: string; name: string; mainImageUrl: string | null }[];
};

type Status = "loading" | "ready" | "error";

export default function MetaverseTourTopPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/metaverse/overview")
          .then((res) => res.json())
          .then((data: Overview) => {
            if (cancelled) return;
            setOverview(data);
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
      <PageHeader
        title="戦国城下町 デジタル内覧"
        subtitle="建設予定の城下町や武家屋敷を、スマートフォンから見学できます。"
      />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && overview && (
        <div className="space-y-4">
          <Card className="text-center">
            <p className="text-sm text-parchment-dim">
              現在 <span className="font-bold text-gold-soft">{overview.areaCount}</span> エリア、
              <span className="font-bold text-gold-soft">{overview.publishedPropertyCount}</span> 件の物件を公開中です。
            </p>
          </Card>

          <LinkButton href="/metaverse-tour/areas">エリアを見る</LinkButton>
          <LinkButton href="/metaverse-tour/favorites" variant="secondary">
            お気に入りを見る
          </LinkButton>

          <Card className="text-xs leading-relaxed text-parchment-dim">
            掲載画像および動画は、今後開発予定のメタバース空間を表現した完成予定イメージです。実際の仕様、デザイン、機能、配置は、開発状況により変更される場合があります。
          </Card>

          <div className="text-center">
            <TextLink href="/">ホームに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
