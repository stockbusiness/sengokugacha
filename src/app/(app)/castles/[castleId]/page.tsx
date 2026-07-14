"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type CastleDetail = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  description: string | null;
  main_image_url: string | null;
};

type Plot = {
  id: string;
  plot_code: string;
  name: string;
  price_yen: number;
  status: string;
  main_image_url: string | null;
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

export default function CastleDetailPage() {
  const { castleId } = useParams<{ castleId: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [castle, setCastle] = useState<CastleDetail | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);

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

          {castle.main_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={toDisplayUrl(castle.main_image_url) ?? undefined}
              alt={castle.name}
              className="w-full rounded-2xl border border-gold/15 object-cover shadow-lg shadow-black/30"
            />
          )}

          {castle.description && (
            <Card className="text-sm leading-relaxed text-parchment-dim">{castle.description}</Card>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gold-soft">区画一覧({plots.length}件)</h2>
            <div className="space-y-2">
              {plots.map((plot) => (
                <Link key={plot.id} href={`/castles/${castle.id}/plots/${plot.id}`} className="block">
                  <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-parchment">{plot.name}</p>
                        <p className="text-xs text-parchment-dim">{plot.plot_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gold-soft">{plot.price_yen.toLocaleString()}円</p>
                        <span className="text-xs text-parchment-dim">
                          {PLOT_STATUS_LABEL[plot.status] ?? plot.status}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
              {plots.length === 0 && (
                <p className="text-center text-sm text-parchment-dim">現在公開中の区画はありません。</p>
              )}
            </div>
          </div>

          <div className="pt-4 text-center">
            <TextLink href="/castles">← 城一覧に戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
