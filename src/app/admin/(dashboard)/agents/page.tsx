"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Agent = {
  id: string;
  name: string;
  rank: string;
  referral_code: string;
  created_at: string;
  external_id: string | null;
  source: "local" | "sengoku-ai";
  status: "active" | "inactive";
};

const RANKS = ["アドバイザー", "ディレクター", "エージェント"] as const;

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function loadAgents() {
    return fetch("/api/admin/agents")
      .then((res) => res.json())
      .then((data) => {
        setAgents(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    loadAgents();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, referral_code: referralCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setName("");
      setReferralCode("");
      await loadAgents();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  async function handleRankChange(agent: Agent, rank: string) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, rank } : a)));
    await fetch(`/api/admin/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rank }),
    });
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">代理店管理</h1>
        <Link href="/admin/agency-integration" className="text-xs text-red-700 hover:underline dark:text-red-400">
          外部代理店システム(sengoku-ai.com)連携設定 →
        </Link>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        紹介リンクは <code>https://liff.line.me/&lt;LIFF ID&gt;?ref=&lt;referral_code&gt;</code>
        の形式で発行してください。新規登録時のみ users.referring_agent_id に記録され、既存ユーザーには影響しません。
        「種別」が sengoku-ai の代理店は外部システムから同期されたデータです(referral_codeは外部の代理店コードと同じ値です)。
        売上集計・ランク自動昇格はPhase2以降です。
      </p>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">代理店名</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            referral_code
          </span>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            required
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {creating ? "作成中..." : "代理店を追加"}
        </button>
        {createError && <p className="w-full text-sm text-red-700 dark:text-red-400">{createError}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">代理店名</th>
              <th className="px-4 py-2">referral_code</th>
              <th className="px-4 py-2">ランク</th>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2">作成日</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{agent.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {agent.referral_code}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={agent.rank}
                    onChange={(e) => handleRankChange(agent, e.target.value)}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {RANKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {agent.source === "sengoku-ai" ? "sengoku-ai同期" : "ローカル"}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {agent.status === "inactive" ? "停止中" : "有効"}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {new Date(agent.created_at).toLocaleDateString("ja-JP")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
