"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  published_at: string;
};

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AnnouncementsAdminPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    return fetch("/api/admin/announcements")
      .then((res) => res.json())
      .then((data: Announcement[]) => {
        setItems(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  function updateField<K extends keyof Announcement>(id: string, key: K, value: Announcement[K]) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)));
  }

  async function handleSave(item: Announcement) {
    setSavingId(item.id);
    setMessageById((prev) => ({ ...prev, [item.id]: "" }));

    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          body: item.body,
          published_at: new Date(item.published_at).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [item.id]: "保存しました。" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [item.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(item: Announcement) {
    if (!confirm(`「${item.title}」を削除しますか?`)) return;
    setSavingId(item.id);

    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "削除に失敗しました。");
      }
      await load();
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [item.id]: error instanceof Error ? error.message : "削除に失敗しました。",
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
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setNewTitle("");
      setNewBody("");
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
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">お知らせ設定</h1>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
          ここで追加した内容が、公開日時の新しい順で「遊び方」画面から遷移するお知らせページ(/announcements)に表示されます。
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">タイトル</span>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateField(item.id, "title", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">本文</span>
                <textarea
                  value={item.body}
                  onChange={(e) => updateField(item.id, "body", e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="block w-56">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開日時</span>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(item.published_at)}
                  onChange={(e) => updateField(item.id, "published_at", new Date(e.target.value).toISOString())}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => handleSave(item)}
                disabled={savingId === item.id}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingId === item.id ? "保存中..." : "保存"}
              </button>
              <button
                onClick={() => handleDelete(item)}
                disabled={savingId === item.id}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                削除
              </button>
              {messageById[item.id] && <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[item.id]}</span>}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">お知らせを追加(公開日時は現在時刻)</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">タイトル</span>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">本文</span>
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={4}
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
