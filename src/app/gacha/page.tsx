"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type DrawResult = {
  warlord: {
    id: string;
    name: string;
    rarity: string;
    slotType: string;
    lore: string | null;
    imageUrl: string | null;
  };
  province: { id: string; name: string };
  provinceConquered: boolean;
  regionCompleted: string | null;
  regionCompletionBonus: number;
  minoUnlocked: boolean;
  tenkaToitsuTriggered: boolean;
  remainingFreeDrawsToday?: number;
  remainingPaidDrawsToday?: number;
  remainingGachaTickets?: number;
};

type Mode = "free" | "paid";
type Status = "initializing" | "idle" | "drawing" | "done" | "error";

export default function GachaPage() {
  const [status, setStatus] = useState<Status>("initializing");
  const [mode, setMode] = useState<Mode>("free");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsTickets, setNeedsTickets] = useState(false);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        setStatus("idle");
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

  async function handleDraw(drawMode: Mode) {
    setStatus("drawing");
    setMode(drawMode);
    setErrorMessage(null);
    setNeedsTickets(false);

    try {
      const endpoint = drawMode === "free" ? "/api/gacha/draw" : "/api/gacha/draw-paid";
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        if (res.status === 402) setNeedsTickets(true);
        throw new Error(body.error ?? "ガチャの実行に失敗しました。");
      }

      setResult(body as DrawResult);
      setStatus("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("error");
    }
  }

  const remaining =
    mode === "free" ? result?.remainingFreeDrawsToday ?? 0 : result?.remainingPaidDrawsToday ?? 0;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          ガチャ
        </h1>

        {status === "initializing" && (
          <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>
        )}

        {(status === "idle" || status === "drawing") && (
          <div className="space-y-2">
            <button
              onClick={() => handleDraw("free")}
              disabled={status === "drawing"}
              className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
            >
              {status === "drawing" && mode === "free" ? "抽選中..." : "無料ガチャを引く"}
            </button>
            <button
              onClick={() => handleDraw("paid")}
              disabled={status === "drawing"}
              className="w-full rounded-lg border border-red-700 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
            >
              {status === "drawing" && mode === "paid" ? "抽選中..." : "有料ガチャを引く(ガチャ券1枚消費)"}
            </button>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {errorMessage}
            </p>
            {needsTickets && (
              <Link
                href="/purchase"
                className="block rounded-lg bg-red-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-red-800"
              >
                ガチャ券を購入する
              </Link>
            )}
          </div>
        )}

        {status === "done" && result && (
          <div className="mt-2 space-y-4">
            {result.provinceConquered && (
              <p className="rounded-lg bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {result.province.name}国を制圧しました!
              </p>
            )}

            {result.regionCompleted && (
              <p className="rounded-lg bg-purple-50 p-4 text-center text-sm font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                {result.regionCompleted}地方コンプリート!石高+{result.regionCompletionBonus.toLocaleString()}
              </p>
            )}

            {result.minoUnlocked && (
              <p className="rounded-lg bg-red-50 p-4 text-center text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
                美濃国(岐阜)への挑戦権が解放されました!
              </p>
            )}

            {result.tenkaToitsuTriggered && (
              <Link
                href="/tenka-toitsu"
                className="block rounded-lg bg-gradient-to-r from-amber-500 to-red-700 p-4 text-center text-sm font-bold text-white shadow"
              >
                天下統一達成!代表武将を選ぶ →
              </Link>
            )}

            <div className="rounded-xl border border-zinc-200 p-5 text-center dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{result.province.name}国</p>
              <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{result.warlord.name}</p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{result.warlord.rarity}</p>
              {result.warlord.lore && (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{result.warlord.lore}</p>
              )}
            </div>

            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {mode === "free"
                ? `本日の無料ガチャ残り回数: ${remaining}`
                : `本日の有料ガチャ残り回数: ${remaining}(ガチャ券残り: ${result.remainingGachaTickets ?? 0}枚)`}
            </p>

            <button
              onClick={() => handleDraw(mode)}
              disabled={remaining <= 0}
              className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
            >
              もう一度引く
            </button>
          </div>
        )}

        <div className="mt-6 space-y-2 text-center text-sm">
          <Link
            href="/collection"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            図鑑を見る
          </Link>
          <Link
            href="/map"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            日本地図(国盗り進捗)を見る
          </Link>
          <Link
            href="/regions"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            地方コンプ状況を見る
          </Link>
          <Link
            href="/tenka-toitsu"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            天下統一の状況を見る
          </Link>
          <Link
            href="/purchase"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            石高・ガチャ券を購入する
          </Link>
          <Link
            href="/"
            className="block text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            戦国パスポートに戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
