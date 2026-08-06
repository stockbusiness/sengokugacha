"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { PlotStatusBadge } from "@/components/castle/PlotStatusBadge";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { readReferralCode } from "@/lib/client/referral-code";
import { toDisplayUrl } from "@/lib/image-url";
import { getPlotStatusPresentation } from "@/modules/castle/domain/plot-presentation";

type TourProperty = {
  id: string;
  name: string;
  propertyCode: string;
  status: "published" | "coming_soon";
};

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
  // 内覧物件が紐づいていない区画ではnull。
  tourProperty: TourProperty | null;
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
  // 代理店が発行した区画の紹介URL(?ref=代理店コード)から来た場合、その代理店が
  // 相談を受け持つ。相談フォームへ引き継ぐためここで読んでおく。
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        setReferralCode(readReferralCode());
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

          {/* ヒーロー画像。画像が無い区画でも枠が崩れないようプレースホルダを置く */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-gold/15 bg-ink shadow-lg shadow-black/30">
            {toDisplayUrl(plot.main_image_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={toDisplayUrl(plot.main_image_url) ?? undefined}
                alt={plot.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-6xl opacity-40">🏞️</div>
            )}
            <div className="absolute left-3 top-3">
              <PlotStatusBadge status={plot.status} />
            </div>
          </div>

          {/* 価格を最も強い要素として見せる(従来は表組みの1行で埋もれていた) */}
          <Card highlight={getPlotStatusPresentation(plot.status).tone === "available"}>
            <p className="text-xs text-parchment-dim">価格</p>
            <p className="mt-0.5 text-3xl font-bold text-gold-soft">
              {plot.price_yen.toLocaleString()}
              <span className="ml-1 text-base font-normal text-parchment-dim">円</span>
            </p>
            {plot.block_label && (
              <div className="mt-3 flex items-center justify-between border-t border-gold/10 pt-2">
                <span className="text-xs text-parchment-dim">街区</span>
                <span className="text-sm text-parchment">{plot.block_label}</span>
              </div>
            )}
          </Card>

          {plot.description && (
            <Card className="text-sm leading-relaxed text-parchment-dim">{plot.description}</Card>
          )}

          {/* 内覧物件が紐づいていれば、既存のメタバース内覧(3Dシーン・ホットスポット)へ送る。
              「見てから相談する」の順にしたいので、相談カードより上に置く */}
          {plot.tourProperty && (
            <Card className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-parchment">この区画を内覧する</p>
                <p className="mt-1 text-xs leading-relaxed text-parchment-dim">
                  {plot.tourProperty.status === "coming_soon"
                    ? "内覧コンテンツを準備中です。現在の公開範囲をご覧いただけます。"
                    : "メタバース上の完成予定イメージを、その場で見て回れます。"}
                </p>
              </div>
              <LinkButton href={`/metaverse-tour/properties/${plot.tourProperty.id}`}>内覧を見る</LinkButton>
            </Card>
          )}

          {plot.status === "available" ? (
            <Card className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-parchment">この区画について相談する</p>
                <p className="mt-1 text-xs leading-relaxed text-parchment-dim">
                  ご購入・お申込みは担当代理店を通じたお手続きとなります。相談内容を送ると、担当代理店から改めてご連絡します。
                </p>
              </div>
              <LinkButton
                href={`/metaverse-tour/inquiries/new?castlePlotId=${plot.id}${
                  referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ""
                }`}
              >
                相談を申し込む
              </LinkButton>
              <div className="text-center">
                <TextLink href="/legal/support">その他のお問い合わせ</TextLink>
              </div>
            </Card>
          ) : (
            <Card className="text-xs leading-relaxed text-parchment-dim">
              現在この区画は{getPlotStatusPresentation(plot.status).label}のため、お申込みいただけません。
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
