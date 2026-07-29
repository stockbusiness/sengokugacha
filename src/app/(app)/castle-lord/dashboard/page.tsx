"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { PlotCardMedia } from "@/components/castle/PlotCard";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";
import { getPlotStatusPresentation } from "@/modules/castle/domain/plot-presentation";

type LordDashboardPlot = {
  id: string;
  plot_code: string;
  name: string;
  price_yen: number;
  sold_price_yen: number | null;
  status: string;
  main_image_url: string | null;
};

type LordDashboardSummary = {
  contract: { id: string; status: string; castleId: string | null; castleName: string | null } | null;
  plots: LordDashboardPlot[];
  plotCapacity: number;
  plotsSold: number;
  plotsAvailable: number;
  totalLandSalesYen: number;
  commissionHeldYen: number;
  commissionConfirmedYen: number;
  commissionPaidYen: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "申込(下書き)",
  screening: "審査中",
  approved: "承認済み",
  payment_pending: "入金待ち",
  training: "研修中",
  active: "有効(正式城主)",
  suspended: "停止中",
  expired: "契約終了(更新待ち)",
};

type Status = "loading" | "ready" | "error";

// 一般ユーザー向けのPlotCardと同じ見た目にしつつ、城主にだけ必要な成約価格を足す。
// 担当城が未確定(castleIdがnull)の契約では遷移先が無いのでリンクにしない。
function LordPlotCard({ plot, castleId }: { plot: LordDashboardPlot; castleId: string | null }) {
  const { dimmed } = getPlotStatusPresentation(plot.status);

  const body = (
    <div
      className={`overflow-hidden rounded-2xl border border-gold/15 bg-ink-raised/80 shadow-lg shadow-black/30 ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <PlotCardMedia imageUrl={toDisplayUrl(plot.main_image_url)} priceYen={plot.price_yen} status={plot.status} />
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold text-parchment">{plot.name}</p>
        <p className="mt-0.5 text-xs text-parchment-dim">{plot.plot_code}</p>
        {plot.status === "sold" && plot.sold_price_yen !== null && (
          <p className="mt-1 text-xs text-gold-soft">成約 {plot.sold_price_yen.toLocaleString()}円</p>
        )}
      </div>
    </div>
  );

  if (!castleId) return body;
  return (
    <Link href={`/castles/${castleId}/plots/${plot.id}`} className="block transition hover:opacity-90">
      {body}
    </Link>
  );
}

export default function CastleLordDashboardPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<LordDashboardSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/lord/dashboard")
          .then((res) => {
            if (!res.ok) throw new Error("城主ダッシュボードの取得に失敗しました。");
            return res.json();
          })
          .then((data: LordDashboardSummary) => {
            if (cancelled) return;
            setSummary(data);
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
      <PageHeader title="城主ダッシュボード" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && summary && (
        <div className="space-y-4">
          {!summary.contract ? (
            <Card className="space-y-2 text-center text-sm text-parchment-dim">
              <p>城主契約がありません。</p>
              {/* 城主プランの申込はアプリ内では完結せず代理店経由で手続きする運用のため、
                  ここでは問い合わせ先の案内にとどめる */}
              <p>城主プランのお申込みについて詳しくは代理店にお問い合わせください。</p>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-parchment-dim">担当城</span>
                  <span className="text-sm font-semibold text-parchment">{summary.contract.castleName ?? "未確定"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-parchment-dim">契約状態</span>
                  <span className="text-sm text-gold-soft">
                    {STATUS_LABEL[summary.contract.status] ?? summary.contract.status}
                  </span>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <p className="text-xs text-parchment-dim">販売枠</p>
                  <p className="mt-1 text-lg font-bold text-parchment">{summary.plotCapacity}区画</p>
                </Card>
                <Card>
                  <p className="text-xs text-parchment-dim">販売済み</p>
                  <p className="mt-1 text-lg font-bold text-parchment">{summary.plotsSold}区画</p>
                </Card>
                <Card>
                  <p className="text-xs text-parchment-dim">販売可能</p>
                  <p className="mt-1 text-lg font-bold text-parchment">{summary.plotsAvailable}区画</p>
                </Card>
                <Card>
                  <p className="text-xs text-parchment-dim">土地販売総額</p>
                  <p className="mt-1 text-lg font-bold text-gold-soft">{summary.totalLandSalesYen.toLocaleString()}円</p>
                </Card>
              </div>

              <Card>
                <p className="text-sm font-semibold text-gold-soft">城主報酬</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-parchment-dim">保留(猶予期間中)</span>
                    <span className="text-parchment">{summary.commissionHeldYen.toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-parchment-dim">確定済み</span>
                    <span className="text-parchment">{summary.commissionConfirmedYen.toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-parchment-dim">支払済み</span>
                    <span className="text-parchment">{summary.commissionPaidYen.toLocaleString()}円</span>
                  </div>
                </div>
              </Card>

              {/* 件数だけでは自分がいま何を売っているのか分からないため、担当城の区画そのものを並べる。
                  下書き区画はサーバー側で除外済み(まだ販売枠に紐づいていない内部管理用のため)。 */}
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gold-soft">担当城の区画</h2>
                {summary.plots.length === 0 ? (
                  <Card className="text-center text-sm text-parchment-dim">
                    公開中の区画がありません。契約が有効になると販売枠の分だけ区画が販売可能になります。
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {summary.plots.map((plot) => (
                      <LordPlotCard key={plot.id} plot={plot} castleId={summary.contract?.castleId ?? null} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-4 text-center">
            <TextLink href="/">← ホームに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
