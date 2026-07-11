"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  id: string | null;
  outbound_endpoint_url: string | null;
  outbound_api_key_set: boolean;
  outbound_api_key_last4: string | null;
  bidirectional_sync_enabled: boolean;
  sso_enabled: boolean;
  sso_issuer_url: string;
  sso_jwks_url: string;
  sso_audience: string;
  inbound_api_key_last4: string | null;
};

export default function AgencyIntegrationPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [outboundApiKeyInput, setOutboundApiKeyInput] = useState("");
  const [newInboundKey, setNewInboundKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/agency-integration/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/admin/agency-integration/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outbound_endpoint_url: settings.outbound_endpoint_url,
          outbound_api_key: outboundApiKeyInput || undefined,
          bidirectional_sync_enabled: settings.bidirectional_sync_enabled,
          sso_enabled: settings.sso_enabled,
          sso_issuer_url: settings.sso_issuer_url,
          sso_jwks_url: settings.sso_jwks_url,
          sso_audience: settings.sso_audience,
        }),
      });
      if (!res.ok) throw new Error();
      setOutboundApiKeyInput("");
      setSaveMessage("保存しました");
      await load();
    } catch {
      setSaveMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateInboundKey() {
    if (!confirm("受信用APIキーを再発行します。旧キーは無効になり、sengoku-ai.com側の設定変更が必要です。よろしいですか?")) return;
    const res = await fetch("/api/admin/agency-integration/inbound-key", { method: "POST" });
    const data = await res.json();
    setNewInboundKey(data.raw_key);
    await load();
  }

  async function handleTestOutbound() {
    setTestResult("テスト中...");
    const res = await fetch("/api/admin/agency-integration/test-outbound", { method: "POST" });
    const data = await res.json();
    setTestResult(data.ok ? `接続に成功しました(status=${data.status})` : `接続に失敗しました: ${data.message ?? data.status}`);
  }

  async function handleSyncHierarchy() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/admin/agency-integration/sync-hierarchy", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "同期に失敗しました。");
      setSyncMessage(`${data.synced}件の代理店を同期しました。`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同期に失敗しました。");
    } finally {
      setSyncing(false);
    }
  }

  if (status === "loading" || !settings) return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/agents" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← 代理店管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">外部代理店システム(sengoku-ai.com)連携設定</h1>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">受信設定(sengoku-ai.com → このアプリ)</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          受信エンドポイント: <code>POST https://（このアプリのドメイン）/api/integrations/agencies</code>
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          受信用APIキー: {settings.inbound_api_key_last4 ? `•••• ${settings.inbound_api_key_last4}` : "未発行"}
        </p>
        <button
          onClick={handleRegenerateInboundKey}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {settings.inbound_api_key_last4 ? "再発行する" : "発行する"}
        </button>
        {newInboundKey && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">この画面を離れると二度と表示されません。sengoku-ai.com側の管理画面に控えてください。</p>
            <p className="mt-1 break-all font-mono">{newInboundKey}</p>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">送信設定(このアプリ → sengoku-ai.com)</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">送信先URL</span>
          <input
            type="text"
            placeholder="https://sengoku-ai.com"
            value={settings.outbound_endpoint_url ?? ""}
            onChange={(e) => setSettings({ ...settings, outbound_endpoint_url: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            sengoku-ai.com受信用APIキー
            {settings.outbound_api_key_set && ` (設定済み: •••• ${settings.outbound_api_key_last4})`}
          </span>
          <input
            type="password"
            placeholder={settings.outbound_api_key_set ? "変更する場合のみ入力" : "sengoku-ai.comが発行したキーを入力"}
            value={outboundApiKeyInput}
            onChange={(e) => setOutboundApiKeyInput(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={settings.bidirectional_sync_enabled}
            onChange={(e) => setSettings({ ...settings, bidirectional_sync_enabled: e.target.checked })}
          />
          双方向同期を有効にする(このアプリで作成・編集した代理店をsengoku-ai.comへ送信)
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestOutbound}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            接続テスト
          </button>
          {testResult && <span className="text-xs text-zinc-500 dark:text-zinc-400">{testResult}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncHierarchy}
            disabled={syncing}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {syncing ? "同期中..." : "階層を手動で全件同期"}
          </button>
          {syncMessage && <span className="text-xs text-zinc-500 dark:text-zinc-400">{syncMessage}</span>}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">SSOログイン(代理店ポータル)</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          代理店ポータル: <code>/agency</code>(sengoku-ai.comの代理店マイページから <code>client={settings.sso_audience}</code> 付きでSSO起動)
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={settings.sso_enabled}
            onChange={(e) => setSettings({ ...settings, sso_enabled: e.target.checked })}
          />
          SSOログインを有効にする
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">IdP(発行者)URL</span>
          <input
            type="text"
            value={settings.sso_issuer_url}
            onChange={(e) => setSettings({ ...settings, sso_issuer_url: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">JWKS URL</span>
          <input
            type="text"
            value={settings.sso_jwks_url}
            onChange={(e) => setSettings({ ...settings, sso_jwks_url: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">audience(このアプリの識別子)</span>
          <input
            type="text"
            value={settings.sso_audience}
            onChange={(e) => setSettings({ ...settings, sso_audience: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {saveMessage && <span className="text-sm text-zinc-500 dark:text-zinc-400">{saveMessage}</span>}
      </div>
    </div>
  );
}
