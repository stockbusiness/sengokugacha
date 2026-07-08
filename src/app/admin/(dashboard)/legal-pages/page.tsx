"use client";

import { useEffect, useState } from "react";

type LegalPage = {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
};

const SLUG_LABELS: Record<string, string> = {
  tokushoho: "特定商取引法に基づく表記",
  terms: "利用規約",
  privacy: "プライバシーポリシー",
  support: "お問い合わせ",
};

const SLUG_ORDER = ["tokushoho", "terms", "privacy", "support"];

export default function LegalPagesAdminPage() {
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [messageBySlug, setMessageBySlug] = useState<Record<string, string>>({});

  function load() {
    return fetch("/api/admin/legal-pages")
      .then((res) => res.json())
      .then((data: LegalPage[]) => {
        setPages(
          [...data].sort((a, b) => SLUG_ORDER.indexOf(a.slug) - SLUG_ORDER.indexOf(b.slug))
        );
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  function updateField(slug: string, key: "title" | "body", value: string) {
    setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, [key]: value } : p)));
  }

  async function handleSave(page: LegalPage) {
    setSavingSlug(page.slug);
    setMessageBySlug((prev) => ({ ...prev, [page.slug]: "" }));

    try {
      const res = await fetch(`/api/admin/legal-pages/${page.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: page.title, body: page.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageBySlug((prev) => ({ ...prev, [page.slug]: "保存しました。" }));
    } catch (error) {
      setMessageBySlug((prev) => ({
        ...prev,
        [page.slug]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingSlug(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">法的ページ管理</h1>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          ここで編集した内容がそのままアプリ内の公開ページ(/legal/tokushoho, /legal/terms,
          /legal/privacy)に反映されます。初期値はひな形です。事業者名・所在地・連絡先等の
          【 】で囲まれた箇所は必ず実際の情報に差し替えてください。内容の法的な妥当性については
          専門家への確認を推奨します。
        </p>
      </div>

      <div className="space-y-6">
        {pages.map((page) => (
          <div
            key={page.slug}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {SLUG_LABELS[page.slug] ?? page.slug}
            </h2>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                ページタイトル
              </span>
              <input
                type="text"
                value={page.title}
                onChange={(e) => updateField(page.slug, "title", e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">本文</span>
              <textarea
                value={page.body}
                onChange={(e) => updateField(page.slug, "body", e.target.value)}
                rows={14}
                className="w-full whitespace-pre-wrap rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => handleSave(page)}
                disabled={savingSlug === page.slug}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingSlug === page.slug ? "保存中..." : "保存"}
              </button>
              {messageBySlug[page.slug] && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageBySlug[page.slug]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
