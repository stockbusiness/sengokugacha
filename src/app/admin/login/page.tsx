"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [actorName, setActorName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, actorName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "ログインに失敗しました。");
      router.push("/admin");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-4 font-sans text-zinc-900"
      style={{ colorScheme: "light" }}
    >
      <main className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-2 text-center text-xl font-bold text-zinc-900 dark:text-zinc-50">管理画面ログイン</h1>
        <p className="mb-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          全担当者共通のパスワードでログインします。「担当者名」は本人確認ではなく、誰が操作したか操作ログに
          記録するための任意項目です。入力しておくと、後から履歴を追いやすくなります。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="担当者名(任意・操作ログに記録されます)"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            autoFocus
          />
          {errorMessage && <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {submitting ? "確認中..." : "ログイン"}
          </button>
        </form>
      </main>
    </div>
  );
}
