"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type MyPlot = {
  id: string;
  castle_id: string;
  plot_code: string;
  name: string;
  price_yen: number;
  sold_price_yen: number | null;
  sold_at: string | null;
  castles: { name: string } | null;
};

type Status = "loading" | "ready" | "error";

export default function MyLandPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plots, setPlots] = useState<MyPlot[]>([]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/me/plots")
          .then((res) => res.json())
          .then((data: MyPlot[]) => {
            if (cancelled) return;
            setPlots(data);
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
      <PageHeader title="所有区画" subtitle="あなたが購入した土地区画の一覧です。" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          {plots.map((plot) => (
            <Card key={plot.id}>
              <p className="text-sm font-semibold text-parchment">{plot.name}</p>
              <p className="text-xs text-parchment-dim">
                {plot.castles?.name ?? ""} / {plot.plot_code}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-parchment-dim">
                  {plot.sold_at ? new Date(plot.sold_at).toLocaleDateString("ja-JP") : ""}購入
                </span>
                <span className="text-sm font-bold text-gold-soft">
                  {(plot.sold_price_yen ?? plot.price_yen).toLocaleString()}円
                </span>
              </div>
            </Card>
          ))}
          {plots.length === 0 && <p className="text-center text-sm text-parchment-dim">まだ所有している区画はありません。</p>}

          <div className="pt-4 text-center">
            <TextLink href="/castles">城一覧から区画を探す</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
