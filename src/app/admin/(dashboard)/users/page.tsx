"use client";

import { useState } from "react";

type UserRow = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  rank: string;
  kokudaka: number;
  senko: number;
  gachaTickets: number;
  referringAgentName: string | null;
  createdAt: string;
};

export default function UsersSearchPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setUsers(data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">ユーザー検索</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="表示名 または LINEユーザーIDで検索(空欄で最新50件)"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          検索
        </button>
      </form>

      {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">検索に失敗しました。</p>}

      {status === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2">城主名</th>
                <th className="px-4 py-2">LINEユーザーID</th>
                <th className="px-4 py-2">ランク</th>
                <th className="px-4 py-2">石高</th>
                <th className="px-4 py-2">戦功</th>
                <th className="px-4 py-2">ガチャ券</th>
                <th className="px-4 py-2">紹介元代理店</th>
                <th className="px-4 py-2">登録日</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{u.displayName ?? "(未設定)"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500">{u.lineUserId}</td>
                  <td className="px-4 py-2">{u.rank}</td>
                  <td className="px-4 py-2">{u.kokudaka.toLocaleString()}</td>
                  <td className="px-4 py-2">{u.senko.toLocaleString()}</td>
                  <td className="px-4 py-2">{u.gachaTickets}</td>
                  <td className="px-4 py-2">{u.referringAgentName ?? "-"}</td>
                  <td className="px-4 py-2 text-xs text-zinc-400">
                    {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="p-4 text-sm text-zinc-400">該当するユーザーがいません。</p>}
        </div>
      )}
    </div>
  );
}
