"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { LordRecruitmentCard, type LordRecruitment } from "@/components/castle/LordRecruitmentCard";
import { PlotCard, type PlotCardData } from "@/components/castle/PlotCard";
import { PlotScarcityPanel } from "@/components/castle/PlotScarcityPanel";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";
import { groupPlotsByBlock, summarizePlotScarcity } from "@/modules/castle/domain/plot-presentation";

type OfficialLordPartner = {
  contactName: string | null;
  companyName: string | null;
  applicantType: "individual" | "corporate";
};

type CastleDetail = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  description?: string | null;
  main_image_url?: string | null;
  historical_lord_summary?: string | null;
  officialLordPartner?: OfficialLordPartner | null;
  lordRecruitment?: LordRecruitment | null;
  unlocked: boolean;
};

type Plot = PlotCardData & {
  block_label: string | null;
};

type Status = "loading" | "ready" | "error";

export default function CastleDetailPage() {
  const { castleId } = useParams<{ castleId: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [castle, setCastle] = useState<CastleDetail | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);

  const scarcity = useMemo(() => summarizePlotScarcity(plots), [plots]);
  const blockGroups = useMemo(() => groupPlotsByBlock(plots), [plots]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return Promise.all([
          fetch(`/api/castles/${castleId}`).then((res) => {
            if (!res.ok) throw new Error("城情報の取得に失敗しました。");
            return res.json();
          }),
          fetch(`/api/castles/${castleId}/plots`).then((res) => {
            if (!res.ok) throw new Error("区画一覧の取得に失敗しました。");
            return res.json();
          }),
        ]).then(([castleData, plotsData]: [CastleDetail, Plot[]]) => {
          if (cancelled) return;
          setCastle(castleData);
          setPlots(plotsData);
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
  }, [castleId]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && castle && (
        <div className="space-y-4">
          <PageHeader title={castle.name} subtitle={castle.prefecture ?? castle.region ?? undefined} />

          {!castle.unlocked && (
            <Card className="border-gold/40 bg-ink-raised/90 text-center text-sm text-parchment">
              🔒 この城はまだ解放されていません。国取りを進めると詳細が解放されます。
            </Card>
          )}

          {castle.unlocked && castle.main_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={toDisplayUrl(castle.main_image_url) ?? undefined}
              alt={castle.name}
              className="w-full rounded-2xl border border-gold/15 object-cover shadow-lg shadow-black/30"
            />
          )}

          {castle.unlocked && castle.description && (
            <Card className="text-sm leading-relaxed text-parchment-dim">{castle.description}</Card>
          )}

          {/* 城主枠の販売は区画販売とは別商材のため、区画一覧より前に独立したカードで出す */}
          {castle.unlocked && castle.lordRecruitment && (
            <LordRecruitmentCard recruitment={castle.lordRecruitment} />
          )}

          {castle.unlocked && (castle.historical_lord_summary || castle.officialLordPartner) && (
            <Card className="space-y-3 text-sm">
              {castle.historical_lord_summary && (
                <div>
                  <h2 className="mb-1 text-xs font-semibold text-parchment-dim">史実城主</h2>
                  <p className="text-parchment">{castle.historical_lord_summary}</p>
                </div>
              )}
              {castle.officialLordPartner && (
                <div>
                  <h2 className="mb-1 text-xs font-semibold text-gold-soft">公式城主パートナー</h2>
                  <p className="text-parchment">
                    {castle.officialLordPartner.companyName ?? castle.officialLordPartner.contactName ?? "非公開"}
                  </p>
                  <p className="mt-0.5 text-xs text-parchment-dim">
                    現在の運営参加パートナーです。史実上の城主とは異なります。
                  </p>
                </div>
              )}
            </Card>
          )}

          {castle.unlocked && (
            <div className="space-y-4">
              <PlotScarcityPanel summary={scarcity} />

              <div className="space-y-4">
                {blockGroups.map((group) => (
                  <div key={group.blockLabel ?? "__all__"}>
                    {group.blockLabel && (
                      <h2 className="mb-2 text-sm font-semibold text-gold-soft">{group.blockLabel}</h2>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {group.plots.map((plot) => (
                        <PlotCard key={plot.id} plot={plot} href={`/castles/${castle.id}/plots/${plot.id}`} />
                      ))}
                    </div>
                  </div>
                ))}
                {plots.length === 0 && (
                  <p className="text-center text-sm text-parchment-dim">現在公開中の区画はありません。</p>
                )}
              </div>
            </div>
          )}

          <div className="pt-4 text-center">
            <TextLink href="/castles">← 城一覧に戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
