"use client";

import { useEffect, useState } from "react";

type Faq = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
};

export default function FaqsAdminPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    return fetch("/api/admin/faqs")
      .then((res) => res.json())
      .then((data: Faq[]) => {
        setFaqs(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  function updateField<K extends keyof Faq>(id: string, key: K, value: Faq[K]) {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  }

  async function handleSave(faq: Faq) {
    setSavingId(faq.id);
    setMessageById((prev) => ({ ...prev, [faq.id]: "" }));

    try {
      const res = await fetch(`/api/admin/faqs/${faq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: faq.question,
          answer: faq.answer,
          display_order: faq.display_order,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [faq.id]: "保存しました。" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [faq.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(faq: Faq) {
    if (!confirm(`「${faq.question}」を削除しますか?`)) return;
    setSavingId(faq.id);

    try {
      const res = await fetch(`/api/admin/faqs/${faq.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "削除に失敗しました。");
      }
      await load();
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [faq.id]: error instanceof Error ? error.message : "削除に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const nextOrder = faqs.length > 0 ? Math.max(...faqs.map((f) => f.display_order)) + 1 : 1;
      const res = await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestion, answer: newAnswer, display_order: nextOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setNewQuestion("");
      setNewAnswer("");
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">FAQ設定</h1>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          ここで設定した内容がそのまま「遊び方」画面から遷移するFAQページ(/faq)に表示されます。
        </p>
      </div>

      <div className="space-y-3">
        {faqs
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((faq) => (
            <div key={faq.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">質問</span>
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) => updateField(faq.id, "question", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">回答</span>
                  <textarea
                    value={faq.answer}
                    onChange={(e) => updateField(faq.id, "answer", e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <label className="block w-32">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">表示順</span>
                  <input
                    type="number"
                    value={faq.display_order}
                    onChange={(e) => updateField(faq.id, "display_order", Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => handleSave(faq)}
                  disabled={savingId === faq.id}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {savingId === faq.id ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => handleDelete(faq)}
                  disabled={savingId === faq.id}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                >
                  削除
                </button>
                {messageById[faq.id] && <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[faq.id]}</span>}
              </div>
            </div>
          ))}
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">FAQを追加</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">質問</span>
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">回答</span>
          <textarea
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            rows={3}
            required
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {creating ? "作成中..." : "追加"}
        </button>
        {createError && <p className="text-xs text-red-700 dark:text-red-400">{createError}</p>}
      </form>
    </div>
  );
}
