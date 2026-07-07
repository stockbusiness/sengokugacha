"use client";

import { useEffect, useState } from "react";

type LineSettings = {
  id: string | null;
  liff_id: string | null;
  channel_id: string | null;
};

export default function LineSettingsPage() {
  const [settings, setSettings] = useState<LineSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/line-settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liff_id: settings.liff_id, channel_id: settings.channel_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "保存に失敗しました。");
      setMessage("保存しました。反映には数秒かかる場合があります。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setStatus("ready");
    }
  }

  if (status === "loading" || !settings) return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">LIFF / LINEログイン設定</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        LINE Developersコンソールで発行したLIFF IDと、そのLIFFが属するLINEログインチャネルのチャネルIDを設定してください。
        これらは機密情報ではないため、値の閲覧・編集ともに可能です。
      </p>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">LIFF ID</span>
          <input
            type="text"
            value={settings.liff_id ?? ""}
            onChange={(e) => setSettings({ ...settings, liff_id: e.target.value })}
            placeholder="1234567890-xxxxxxxx"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            LINEログイン チャネルID
          </span>
          <input
            type="text"
            value={settings.channel_id ?? ""}
            onChange={(e) => setSettings({ ...settings, channel_id: e.target.value })}
            placeholder="1234567890"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}

      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
      >
        {status === "saving" ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
