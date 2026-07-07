"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type PurchaseConfig = {
  stripeConfigured: boolean;
  kokudakaPackAmountYen: number;
  kokudakaPackKokudaka: number;
  gachaTicketPackAmountYen: number;
  gachaTicketPackTickets: number;
};

export default function PurchasePage() {
  const [config, setConfig] = useState<PurchaseConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
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

  async function handlePurchase(itemType: "kokudaka" | "gacha_ticket") {
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
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="購入" />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}
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
          {errorMessage && (
            <Card className="border-crimson/50 bg-crimson-soft/40 text-sm text-parchment">
              {errorMessage}
            </Card>
          )}

          <button
            onClick={() => handlePurchase("kokudaka")}
            disabled={purchasingItem !== null}
            className="w-full rounded-2xl border border-gold/15 bg-ink-raised/80 p-4 text-left shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-gold/40 disabled:opacity-50"
          >
            <p className="font-semibold text-parchment">
              石高 {config.kokudakaPackKokudaka.toLocaleString()}
            </p>
            <p className="text-sm text-gold-soft">
              {purchasingItem === "kokudaka" ? "手続き中..." : `${config.kokudakaPackAmountYen.toLocaleString()}円`}
            </p>
          </button>

          <button
            onClick={() => handlePurchase("gacha_ticket")}
            disabled={purchasingItem !== null}
            className="w-full rounded-2xl border border-gold/15 bg-ink-raised/80 p-4 text-left shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-gold/40 disabled:opacity-50"
          >
            <p className="font-semibold text-parchment">
              ガチャ券 {config.gachaTicketPackTickets}枚
            </p>
            <p className="text-sm text-gold-soft">
              {purchasingItem === "gacha_ticket"
                ? "手続き中..."
                : `${config.gachaTicketPackAmountYen.toLocaleString()}円`}
            </p>
          </button>
        </div>
      )}
    </div>
  );
}
