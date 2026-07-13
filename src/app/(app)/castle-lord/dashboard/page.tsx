"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type LordDashboardSummary = {
  contract: { id: string; status: string; castleName: string | null } | null;
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
          .then((res) => res.json())
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
            <Card className="text-center text-sm text-parchment-dim">
              城主契約がありません。城主プランへのお申込みは運営にお問い合わせください。
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
