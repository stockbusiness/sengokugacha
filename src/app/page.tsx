"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PassportData } from "@/lib/passport";

type Status = "initializing" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

export default function Home() {
  const [status, setStatus] = useState<Status>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

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
        // 代理店紹介リンク(?ref=AGENT_CODE)を保持しておく。liff.login()はLINEの
        // 認証画面を経由してこのページへ戻ってくるため、sessionStorageに退避して
        // リダイレクト後も参照できるようにする(新規登録時のみ users.referring_agent_id
        // に反映され、既存ユーザーには影響しない)。
        const refFromUrl = new URLSearchParams(window.location.search).get("ref");
        if (refFromUrl) {
          sessionStorage.setItem("sengoku_ref_code", refFromUrl);
        }
        const refCode = refFromUrl ?? sessionStorage.getItem("sengoku_ref_code");

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
          body: JSON.stringify({ idToken, refCode }),
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

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    fetch("/api/links")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ExternalLink[]) => {
        if (!cancelled) setExternalLinks(data);
      })
      .catch(() => {
        /* 送客導線はおまけ機能のため、取得失敗してもパスポート表示自体は継続する */
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

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

            <dt className="text-sm text-zinc-500 dark:text-zinc-400">連続登城</dt>
            <dd className="text-right font-semibold">{passport.loginStreak}日</dd>
          </dl>
        )}

        {status === "ready" && (
          <div className="mt-6 space-y-2">
            <Link
              href="/gacha"
              className="block rounded-lg bg-red-700 px-4 py-3 text-center font-semibold text-white transition hover:bg-red-800"
            >
              ガチャを引く
            </Link>
            <Link
              href="/collection"
              className="block rounded-lg border border-zinc-300 px-4 py-3 text-center font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              図鑑
            </Link>
            <Link
              href="/map"
              className="block rounded-lg border border-zinc-300 px-4 py-3 text-center font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              日本地図(国盗り進捗)
            </Link>
            <Link
              href="/regions"
              className="block rounded-lg border border-zinc-300 px-4 py-3 text-center font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              地方コンプ
            </Link>
            <Link
              href="/tenka-toitsu"
              className="block rounded-lg border border-zinc-300 px-4 py-3 text-center font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              天下統一
            </Link>
            <Link
              href="/purchase"
              className="block rounded-lg border border-zinc-300 px-4 py-3 text-center font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              石高・ガチャ券を購入する
            </Link>
          </div>
        )}

        {externalLinks.length > 0 && (
          <div className="mt-6 space-y-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            {externalLinks.map((link) => (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
