"use client";

import { useEffect, useState } from "react";

type ExternalLink = {
  id: string;
  key: string;
  label: string;
  url: string | null;
};

export default function LinksPage() {
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/links")
      .then((res) => res.json())
      .then((data) => {
        setLinks(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function updateField(id: string, key: "label" | "url", value: string) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }

  async function handleSave(link: ExternalLink) {
    setSavingId(link.id);
    setMessageById((prev) => ({ ...prev, [link.id]: "" }));

    try {
      const res = await fetch(`/api/admin/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: link.label, url: link.url || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [link.id]: "保存しました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [link.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">送客導線</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        URLを空欄のまま保存すると、その項目は戦国パスポート画面に表示されません。
      </p>

      <div className="space-y-3">
        {links.map((link) => (
          <div
            key={link.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="mb-2 text-xs font-mono text-zinc-400">{link.key}</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">表示名</span>
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateField(link.id, "label", e.target.value)}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="block flex-1 min-w-64">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">遷移先URL</span>
                <input
                  type="text"
                  value={link.url ?? ""}
                  placeholder="https://..."
                  onChange={(e) => updateField(link.id, "url", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <button
                onClick={() => handleSave(link)}
                disabled={savingId === link.id}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingId === link.id ? "保存中..." : "保存"}
              </button>
            </div>
            {messageById[link.id] && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{messageById[link.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
