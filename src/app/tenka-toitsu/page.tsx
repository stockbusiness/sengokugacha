"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type OwnedWarlordOption = {
  id: string;
  name: string;
  rarity: string;
  imageUrl: string | null;
};

type TenkaToitsuStatus = {
  minoConquered: boolean;
  achieved: boolean;
  selectedWarlordName: string | null;
  ownedWarlords: OwnedWarlordOption[];
};

type Status = "loading" | "ready" | "submitting" | "error";

export default function TenkaToitsuPage() {
  const [data, setData] = useState<TenkaToitsuStatus | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function loadData() {
    return fetch("/api/tenka-toitsu")
      .then((res) => res.json())
      .then((body: TenkaToitsuStatus) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return loadData();
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

  async function handleSubmit() {
    if (!selectedId) return;
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/tenka-toitsu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warlordId: selectedId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "登録に失敗しました。");
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("ready");
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          天下統一
        </h1>

        {status === "loading" && (
          <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>
        )}

        {status === "error" && (
          <p className="text-center text-sm text-red-700 dark:text-red-400">
            {errorMessage ?? "読み込みに失敗しました。"}
          </p>
        )}

        {status !== "loading" && data && !data.minoConquered && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            まだ美濃国は制圧されていません。全国を巡り、美濃国の3武将を集めましょう。
          </p>
        )}

        {status !== "loading" && data && data.minoConquered && data.achieved && (
          <div className="space-y-4 text-center">
            <p className="rounded-lg bg-amber-50 p-4 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              称号「天下人」を獲得しました!
            </p>
            {data.selectedWarlordName && (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                代表武将: <span className="font-semibold">{data.selectedWarlordName}</span>
              </p>
            )}
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              記念NFT画像・特典クーポンは準備が整い次第、追ってお届けします。
            </p>
          </div>
        )}

        {status !== "loading" &&
          data &&
          data.minoConquered &&
          !data.achieved &&
          (data.ownedWarlords.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              代表武将を選ぶには、まず武将を1体以上所持している必要があります。
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                天下統一を記念する代表武将を1体選んでください。
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.ownedWarlords.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={
                      "rounded-lg border p-3 text-left text-sm transition " +
                      (selectedId === w.id
                        ? "border-red-700 bg-red-50 dark:bg-red-950"
                        : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800")
                    }
                  >
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{w.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{w.rarity}</p>
                  </button>
                ))}
              </div>

              {errorMessage && (
                <p className="text-center text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedId || status === "submitting"}
                className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
              >
                {status === "submitting" ? "登録中..." : "この武将で天下統一を宣言する"}
              </button>
            </div>
          ))}

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
