"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type PlotDetail = {
  id: string;
  castle_id: string;
  plot_code: string;
  block_label: string | null;
  name: string;
  description: string | null;
  main_image_url: string | null;
  price_yen: number;
  status: string;
  castleName: string;
};

const PLOT_STATUS_LABEL: Record<string, string> = {
  available: "販売可能",
  reserved: "予約中",
  application_pending: "申込審査中",
  payment_pending: "入金待ち",
  sold: "販売済み",
  cancelled: "取消",
  suspended: "一時停止",
};

type Status = "loading" | "ready" | "error";

export default function PlotDetailPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PlotDetailPageInner />
    </Suspense>
  );
}

function PlotDetailPageInner() {
  const { castleId, plotId } = useParams<{ castleId: string; plotId: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plot, setPlot] = useState<PlotDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch(`/api/plots/${plotId}`)
          .then((res) => {
            if (!res.ok) throw new Error("区画情報の取得に失敗しました。");
            return res.json();
          })
          .then((data: PlotDetail) => {
            if (cancelled) return;
            setPlot(data);
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
  }, [plotId]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && plot && (
        <div className="space-y-4">
          <PageHeader title={plot.name} subtitle={`${plot.castleName} / ${plot.plot_code}`} />

          {plot.main_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={toDisplayUrl(plot.main_image_url) ?? undefined}
              alt={plot.name}
              className="w-full rounded-2xl border border-gold/15 object-cover shadow-lg shadow-black/30"
            />
          )}

          <Card>
            <div className="flex items-center justify-between">
              <span className="text-sm text-parchment-dim">価格</span>
              <span className="text-xl font-bold text-gold-soft">{plot.price_yen.toLocaleString()}円</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-parchment-dim">状態</span>
              <span className="text-sm text-parchment">{PLOT_STATUS_LABEL[plot.status] ?? plot.status}</span>
            </div>
            {plot.block_label && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-parchment-dim">街区</span>
                <span className="text-sm text-parchment">{plot.block_label}</span>
              </div>
            )}
          </Card>

          {plot.description && (
            <Card className="text-sm leading-relaxed text-parchment-dim">{plot.description}</Card>
          )}

          {plot.status === "available" ? (
            <Card className="space-y-3 text-center">
              <p className="text-sm leading-relaxed text-parchment">
                この区画のご購入・お申込みは、担当代理店を通じたお手続きとなります。
              </p>
              <LinkButton href="/legal/support">お問い合わせはこちら</LinkButton>
            </Card>
          ) : (
            <Card className="text-xs leading-relaxed text-parchment-dim">
              現在この区画は{PLOT_STATUS_LABEL[plot.status] ?? plot.status}のため、お申込みいただけません。
            </Card>
          )}

          <div className="pt-4 text-center">
            <TextLink href={`/castles/${castleId}`}>← 城の詳細に戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
