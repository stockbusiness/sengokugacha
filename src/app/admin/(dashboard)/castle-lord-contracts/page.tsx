"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Contract = {
  id: string;
  applicant_user_id: string;
  status: string;
  contact_name: string | null;
  company_name: string | null;
  created_at: string;
  castles: { name: string } | null;
  desired_castle: { name: string } | null;
};

type UserSearchResult = { id: string; displayName: string | null; lineUserId: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "申込(下書き)",
  screening: "審査中",
  approved: "承認済み",
  payment_pending: "入金待ち",
  training: "研修中",
  active: "有効(正式城主)",
  suspended: "停止中",
  expired: "契約終了(更新待ち)",
  terminated: "解除済み",
};

export default function CastleLordContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [contactName, setContactName] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function fetchContracts() {
    fetch("/api/admin/castle-lord-contracts")
      .then((res) => res.json())
      .then((data) => {
        setContracts(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  function reload() {
    setStatus("loading");
    fetchContracts();
  }

  useEffect(() => {
    fetchContracts();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!userQuery.trim()) {
        setUserResults([]);
        return;
      }
      fetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}`)
        .then((res) => res.json())
        .then((data) => setUserResults(data))
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [userQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/castle-lord-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_user_id: selectedUser.id, contact_name: contactName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setSelectedUser(null);
      setUserQuery("");
      setContactName("");
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">城主契約({contracts.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          城主プランの申込・審査・契約状態を管理します。状態の遷移(審査承認・有効化等)は各契約の詳細画面から行います。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">新規申込を登録</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            申込者(表示名またはLINE User IDで検索)
          </span>
          <input
            type="text"
            value={userQuery}
            onChange={(e) => {
              setUserQuery(e.target.value);
              setSelectedUser(null);
            }}
            placeholder="ユーザーを検索..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {userResults.length > 0 && !selectedUser && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              {userResults.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setUserQuery(u.displayName ?? u.lineUserId);
                    setUserResults([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  {u.displayName ?? "(表示名未設定)"}
                  <span className="ml-2 text-xs text-zinc-500">{u.lineUserId}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">担当者連絡先名</span>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !selectedUser}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {creating ? "登録中..." : "申込を登録"}
        </button>
        {message && <p className="text-xs text-red-700 dark:text-red-400">{message}</p>}
      </form>

      <div className="space-y-2">
        {contracts.map((c) => (
          <Link
            key={c.id}
            href={`/admin/castle-lord-contracts/${c.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                {c.contact_name ?? c.company_name ?? "(担当者名未設定)"}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {c.castles?.name ?? c.desired_castle?.name ?? "城未確定"}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {STATUS_LABEL[c.status] ?? c.status}
            </span>
          </Link>
        ))}
        {contracts.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ申込がありません。</p>
        )}
      </div>
    </div>
  );
}
