"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type ItemType = "kokudaka" | "gacha_ticket";

type PurchaseConfig = {
  stripeConfigured: boolean;
  kokudakaPackAmountYen: number;
  kokudakaPackKokudaka: number;
  gachaTicketPackAmountYen: number;
  gachaTicketPackTickets: number;
  monthlySpentYen: number;
  monthlySpendingCapYen: number | null;
};

export default function PurchasePage() {
  const [config, setConfig] = useState<PurchaseConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [purchasingItem, setPurchasingItem] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/purchase/config")
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) return;
            setConfig(data);
            setStatus("ready");
          });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadErrorMessage(error instanceof Error ? error.message : null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePurchase(itemType: ItemType) {
    setPurchasingItem(itemType);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/purchase/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "購入手続きの開始に失敗しました。");

      // LIFF内WebViewのままだとStripe Checkoutが正しく動作しないため、外部ブラウザで開く。
      // ensureLiffSession()で既にliff.init()済みのため、ここでは再初期化不要。
      const { default: liff } = await import("@line/liff");
      if (liff.isInClient()) {
        liff.openWindow({ url: body.url, external: true });
        return;
      }
      window.open(body.url, "_blank");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setPurchasingItem(null);
      setSelectedItem(null);
    }
  }

  const selectedInfo =
    config && selectedItem === "kokudaka"
      ? { label: `石高 ${config.kokudakaPackKokudaka.toLocaleString()}`, amountYen: config.kokudakaPackAmountYen }
      : config && selectedItem === "gacha_ticket"
        ? { label: `ガチャ券 ${config.gachaTicketPackTickets}枚`, amountYen: config.gachaTicketPackAmountYen }
        : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="購入" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {loadErrorMessage ?? "読み込みに失敗しました。"}
        </Card>
      )}

      {status === "ready" && config && !config.stripeConfigured && (
        <Card className="text-center text-sm text-parchment-dim">現在、購入機能は準備中です。</Card>
      )}

      {status === "ready" && config && config.stripeConfigured && (
        <div className="space-y-3">
          <p className="text-center text-xs text-parchment-dim">
            今月のご購入合計: ¥{config.monthlySpentYen.toLocaleString()}
            {config.monthlySpendingCapYen != null && (
              <> / 上限 ¥{config.monthlySpendingCapYen.toLocaleString()}</>
            )}
          </p>

          {errorMessage && (
            <Card className="border-crimson/50 bg-crimson-soft/40 text-sm text-parchment">
              {errorMessage}
            </Card>
          )}

          {selectedInfo && selectedItem ? (
            <Card highlight className="space-y-3 text-center">
              <p className="text-sm text-parchment-dim">以下の内容で購入します。よろしいですか?</p>
              <p className="font-heading text-xl font-bold text-parchment">{selectedInfo.label}</p>
              <p className="text-lg font-semibold text-gold-soft">
                ¥{selectedInfo.amountYen.toLocaleString()}
              </p>
              <p className="text-xs text-parchment-dim">
                デジタルコンテンツの性質上、購入完了後の返品・返金はお受けできません。
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setSelectedItem(null)}
                  disabled={purchasingItem !== null}
                  className="rounded-lg border border-gold/25 px-4 py-2 text-sm font-semibold text-parchment-dim transition hover:border-gold/50 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <Button onClick={() => handlePurchase(selectedItem)} disabled={purchasingItem !== null}>
                  {purchasingItem ? "手続き中..." : "購入する"}
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <button
                onClick={() => setSelectedItem("kokudaka")}
                className="w-full rounded-2xl border border-gold/15 bg-ink-raised/80 p-4 text-left shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-gold/40"
              >
                <p className="font-semibold text-parchment">
                  石高 {config.kokudakaPackKokudaka.toLocaleString()}
                </p>
                <p className="text-sm text-gold-soft">{config.kokudakaPackAmountYen.toLocaleString()}円</p>
              </button>

              <button
                onClick={() => setSelectedItem("gacha_ticket")}
                className="w-full rounded-2xl border border-gold/15 bg-ink-raised/80 p-4 text-left shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-gold/40"
              >
                <p className="font-semibold text-parchment">
                  ガチャ券 {config.gachaTicketPackTickets}枚
                </p>
                <p className="text-sm text-gold-soft">{config.gachaTicketPackAmountYen.toLocaleString()}円</p>
              </button>
            </>
          )}

          <p className="pt-2 text-center text-[11px] text-parchment-dim/70">
            ご購入前に
            <Link href="/legal/tokushoho" className="underline decoration-gold/30 underline-offset-2 hover:text-gold-soft">
              特定商取引法に基づく表記
            </Link>
            ・
            <Link href="/legal/terms" className="underline decoration-gold/30 underline-offset-2 hover:text-gold-soft">
              利用規約
            </Link>
            をご確認ください。
          </p>
        </div>
      )}
    </div>
  );
}
