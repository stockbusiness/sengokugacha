"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    <div className="min-h-screen bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-2xl">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          地方コンプ
        </h1>
        <p className="mb-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          コンプ達成で石高ボーナスを自動付与します。称号・クーポン等の追加特典は今後の対応です。
        </p>

        {status === "loading" && <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && (
          <p className="text-center text-sm text-red-700 dark:text-red-400">
            {errorMessage ?? "読み込みに失敗しました。"}
          </p>
        )}

        {status === "ready" && (
          <div className="space-y-3">
            {regions.map((r) => (
              <div
                key={r.region}
                className={
                  "rounded-xl border p-4 " +
                  (r.isComplete
                    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950")
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{r.region}地方</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      称号: {r.title} / 石高+{r.kokudakaBonus.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {r.conqueredProvinces} / {r.totalProvinces}
                    </p>
                    {r.isComplete && (
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">達成済み</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/"
          className="mt-8 block text-center text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          戦国パスポートに戻る
        </Link>
      </main>
    </div>
  );
}
