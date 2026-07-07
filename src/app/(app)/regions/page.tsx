"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type RegionProgress = {
  region: string;
  title: string;
  totalProvinces: number;
  conqueredProvinces: number;
  isComplete: boolean;
  kokudakaBonus: number;
};

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionProgress[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/regions")
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) return;
            setRegions(data);
            setStatus("ready");
          });
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader
        title="地方コンプ"
        subtitle="コンプ達成で石高ボーナスを自動付与します。称号・クーポン等の追加特典は今後の対応です。"
      />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage ?? "読み込みに失敗しました。"}
        </Card>
      )}

      {status === "ready" && (
        <div className="space-y-3">
          {regions.map((r) => (
            <Card key={r.region} highlight={r.isComplete}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-parchment">{r.region}地方</p>
                  <p className="text-xs text-parchment-dim">
                    称号: {r.title} / 石高+{r.kokudakaBonus.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-parchment">
                    {r.conqueredProvinces} / {r.totalProvinces}
                  </p>
                  {r.isComplete && <p className="text-xs font-semibold text-gold-soft">達成済み</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
