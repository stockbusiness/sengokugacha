"use client";

import Link from "next/link";
import { useState } from "react";

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
  remainingFreeDrawsToday: number;
};

type Status = "idle" | "drawing" | "done" | "error";

export default function GachaPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDraw() {
    setStatus("drawing");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/gacha/draw", { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? "ガチャの実行に失敗しました。");
      }

      setResult(body as DrawResult);
      setStatus("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          無料ガチャ
        </h1>

        {status !== "done" && (
          <button
            onClick={handleDraw}
            disabled={status === "drawing"}
            className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            {status === "drawing" ? "抽選中..." : "ガチャを引く"}
          </button>
        )}

        {status === "error" && errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </p>
        )}

        {status === "done" && result && (
          <div className="mt-2 space-y-4">
            {result.provinceConquered && (
              <p className="rounded-lg bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {result.province.name}国を制圧しました!
              </p>
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
              本日の無料ガチャ残り回数: {result.remainingFreeDrawsToday}
            </p>

            <button
              onClick={handleDraw}
              disabled={result.remainingFreeDrawsToday <= 0}
              className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
            >
              もう一度引く
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
