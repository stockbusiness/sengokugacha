"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PassportData } from "@/lib/passport";

type Status = "initializing" | "ready" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setErrorMessage(
          "NEXT_PUBLIC_LIFF_ID が設定されていません。.env.local にLIFF IDを設定してください。"
        );
        setStatus("error");
        return;
      }

      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return; // LINEログイン画面へリダイレクトされる
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          throw new Error("LINEのIDトークンを取得できませんでした。");
        }

        const loginRes = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (!loginRes.ok) {
          const body = await loginRes.json().catch(() => ({}));
          throw new Error(body.error ?? "ログインに失敗しました。");
        }

        const meRes = await fetch("/api/me");
        if (!meRes.ok) {
          throw new Error("パスポート情報の取得に失敗しました。");
        }

        const data: PassportData = await meRes.json();
        if (cancelled) return;
        setPassport(data);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "予期しないエラーが発生しました。"
        );
        setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          戦国パスポート
        </h1>

        {status === "initializing" && (
          <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>
        )}

        {status === "error" && (
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </p>
        )}

        {status === "ready" && passport && (
          <dl className="grid grid-cols-2 gap-y-4 text-zinc-900 dark:text-zinc-50">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">城主名</dt>
            <dd className="text-right font-semibold">
              {passport.displayName ?? "(未設定)"}
            </dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">ランク</dt>
            <dd className="text-right font-semibold">{passport.rank}</dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">石高</dt>
            <dd className="text-right font-semibold">{passport.kokudaka.toLocaleString()}</dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">戦功</dt>
            <dd className="text-right font-semibold">{passport.senko.toLocaleString()}</dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">ガチャ券</dt>
            <dd className="text-right font-semibold">{passport.gachaTickets}</dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">所持武将数</dt>
            <dd className="text-right font-semibold">{passport.warlordCount}</dd>

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">制圧国数</dt>
            <dd className="text-right font-semibold">{passport.conqueredProvinceCount} / 66</dd>
          </dl>
        )}

        {status === "ready" && (
          <Link
            href="/gacha"
            className="mt-6 block rounded-lg bg-red-700 px-4 py-3 text-center font-semibold text-white transition hover:bg-red-800"
          >
            ガチャを引く
          </Link>
        )}
      </main>
    </div>
  );
}
