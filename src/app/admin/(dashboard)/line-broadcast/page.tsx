"use client";

import { useState } from "react";

const MAX_LENGTH = 5000;

export default function LineBroadcastPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSend() {
    if (!confirm("LINE公式アカウントの友だち全員にこのメッセージを配信します。よろしいですか?")) {
      return;
    }

    setStatus("sending");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/line-broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "配信に失敗しました。");
      setMessage("配信しました。");
      setText("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">LINE一斉配信</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        LINE公式アカウントの友だち全員にテキストメッセージを配信します(ログイン促進・イベント告知等の
        再エンゲージメント施策向け)。配信数はLINE公式アカウントの無料/有料メッセージ数の上限に
        カウントされます。送信後の取り消しはできません。
      </p>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            配信するメッセージ({text.length}/{MAX_LENGTH})
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={MAX_LENGTH}
            placeholder="例: 【戦国パスポート】本日20時から排出率アップイベント開催中!ぜひログインしてガチャを引いてください。"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}

        <button
          onClick={handleSend}
          disabled={status === "sending" || text.trim().length === 0}
          className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
        >
          {status === "sending" ? "配信中..." : "配信する"}
        </button>
      </div>
    </div>
  );
}
