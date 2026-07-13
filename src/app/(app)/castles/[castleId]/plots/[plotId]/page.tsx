"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, TextLink } from "@/components/ui/Button";
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
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plot, setPlot] = useState<PlotDetail | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

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

  async function handlePurchase() {
    if (!plot) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const reserveRes = await fetch(`/api/plots/${plot.id}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: referralCode }),
      });
      const reserveData = await reserveRes.json();
      if (!reserveRes.ok) throw new Error(reserveData.error ?? "予約に失敗しました。");

      const checkoutRes = await fetch("/api/purchase/castle-plot-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: reserveData.reservationId, castleId: plot.castle_id }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.error ?? "決済ページの作成に失敗しました。");

      window.location.href = checkoutData.url;
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setPurchasing(false);
    }
  }

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
            <div className="space-y-2">
              <Button onClick={handlePurchase} disabled={purchasing}>
                {purchasing ? "手続き中..." : "購入手続きへ進む"}
              </Button>
              {purchaseError && <p className="text-center text-xs text-crimson">{purchaseError}</p>}
              <p className="text-center text-[11px] text-parchment-dim">
                お申込み後、一定時間内にお支払いが完了しない場合は自動的にキャンセルされます。
              </p>
            </div>
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
