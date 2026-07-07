"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          購入
        </h1>

        {status === "loading" && <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && (
          <p className="text-center text-sm text-red-700 dark:text-red-400">
            {loadErrorMessage ?? "読み込みに失敗しました。"}
          </p>
        )}

        {status === "ready" && config && !config.stripeConfigured && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            現在、購入機能は準備中です。
          </p>
        )}

        {status === "ready" && config && config.stripeConfigured && (
          <div className="space-y-3">
            {errorMessage && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {errorMessage}
              </p>
            )}

            <button
              onClick={() => handlePurchase("kokudaka")}
              disabled={purchasingItem !== null}
              className="w-full rounded-lg border border-zinc-300 p-4 text-left transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                石高 {config.kokudakaPackKokudaka.toLocaleString()}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {purchasingItem === "kokudaka" ? "手続き中..." : `${config.kokudakaPackAmountYen.toLocaleString()}円`}
              </p>
            </button>

            <button
              onClick={() => handlePurchase("gacha_ticket")}
              disabled={purchasingItem !== null}
              className="w-full rounded-lg border border-zinc-300 p-4 text-left transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                ガチャ券 {config.gachaTicketPackTickets}枚
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {purchasingItem === "gacha_ticket"
                  ? "手続き中..."
                  : `${config.gachaTicketPackAmountYen.toLocaleString()}円`}
              </p>
            </button>
          </div>
        )}

        <Link
          href="/"
          className="mt-6 block text-center text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          戦国パスポートに戻る
        </Link>
      </main>
    </div>
  );
}
