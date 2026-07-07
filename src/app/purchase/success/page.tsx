"use client";

import { useEffect, useState } from "react";

export default function PurchaseSuccessPage() {
  const [liffUrl, setLiffUrl] = useState("/");

  useEffect(() => {
    fetch("/api/app-config")
      .then((res) => res.json())
      .then((config) => {
        if (config.liffId) setLiffUrl(`https://liff.line.me/${config.liffId}`);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">ご購入ありがとうございました</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-300">
          ご購入内容は数秒〜数分以内に戦国パスポートへ反映されます。反映されない場合は、しばらくしてから再度ご確認ください。
        </p>
        <a
          href={liffUrl}
          className="block rounded-lg bg-red-700 px-4 py-3 font-semibold text-white transition hover:bg-red-800"
        >
          LINEに戻る
        </a>
      </main>
    </div>
  );
}
