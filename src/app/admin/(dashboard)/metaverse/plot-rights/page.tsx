"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PlotRight = {
  id: string;
  right_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  order_reference: string | null;
  metaverse_properties: { id: string; property_code: string; name: string } | null;
  users: { id: string; display_name: string | null } | null;
  agents: { id: string; name: string } | null;
};

type Property = { id: string; property_code: string; name: string };
type Agent = { id: string; name: string };
type UserResult = { id: string; displayName: string | null; lineUserId: string };

const RIGHT_TYPE_LABEL: Record<string, string> = {
  ownership: "所有権",
  special_usage_right: "特別利用権",
  rental: "賃貸",
  management: "管理委託",
  reserved: "予約",
};

export default function PlotRightsPage() {
  const [rights, setRights] = useState<PlotRight[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [propertyId, setPropertyId] = useState("");
  const [rightType, setRightType] = useState("ownership");
  const [agencyId, setAgencyId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function loadAll() {
    return Promise.all([
      fetch("/api/admin/metaverse/plot-rights").then((res) => res.json()),
      fetch("/api/admin/metaverse/properties").then((res) => res.json()),
      fetch("/api/admin/agents").then((res) => res.json()),
    ]).then(([rightsData, propertyData, agentData]) => {
      setRights(rightsData);
      setProperties(propertyData);
      setAgents(agentData);
      if (!propertyId && propertyData[0]) setPropertyId(propertyData[0].id);
      setStatus("ready");
    });
  }

  useEffect(() => {
    loadAll().catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (userQuery.trim().length < 1) {
        setUserResults([]);
        return;
      }
      fetch(`/api/admin/users?q=${encodeURIComponent(userQuery.trim())}`)
        .then((res) => res.json())
        .then((data: UserResult[]) => setUserResults(data.slice(0, 5)));
    }, 300);
    return () => clearTimeout(timer);
  }, [userQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/metaverse/plot-rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          right_type: rightType,
          agency_id: agencyId || null,
          user_id: selectedUser?.id ?? null,
          start_date: startDate || null,
          end_date: endDate || null,
          order_reference: orderReference || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録に失敗しました。");
      setSelectedUser(null);
      setUserQuery("");
      setAgencyId("");
      setStartDate("");
      setEndDate("");
      setOrderReference("");
      await loadAll();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setCreating(false);
    }
  }

  async function handleEndRight(id: string) {
    if (!confirm("この権利を終了(ended)にしますか?")) return;
    await fetch(`/api/admin/metaverse/plot-rights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    await loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("この権利レコードを削除しますか?")) return;
    await fetch(`/api/admin/metaverse/plot-rights/${id}`, { method: "DELETE" });
    await loadAll();
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">区画の所有権・利用権管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          区画(物件)ごとの所有権・代理店特別利用権・賃貸・管理委託の記録です。土地・建物の購入注文データの自動取込みは行わず、
          このページから手動で登録する運用とします。「所有者本人」がLIFF側で自分の区画を確認できる機能は、ここでuser(城主)を
          紐づけると有効になります。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">区画(物件)</span>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.property_code} / {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">権利種別</span>
            <select
              value={rightType}
              onChange={(e) => setRightType(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {Object.entries(RIGHT_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">代理店(特別利用権の場合)</span>
            <select
              value={agencyId}
              onChange={(e) => setAgencyId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">(なし)</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="relative block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">城主(ユーザー)を検索</span>
            <input
              type="text"
              value={selectedUser ? (selectedUser.displayName ?? selectedUser.lineUserId) : userQuery}
              onChange={(e) => {
                setSelectedUser(null);
                setUserQuery(e.target.value);
              }}
              placeholder="表示名またはLINE IDで検索"
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            {!selectedUser && userResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setUserResults([]);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {u.displayName ?? "(表示名なし)"}({u.lineUserId})
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">開始日</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">終了日</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">注文参照番号(任意)</span>
            <input
              type="text"
              value={orderReference}
              onChange={(e) => setOrderReference(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating || !propertyId}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {creating ? "登録中..." : "権利を登録"}
        </button>
        {createError && <p className="text-sm text-red-700 dark:text-red-400">{createError}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">区画</th>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">城主/代理店</th>
              <th className="px-4 py-2">期間</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rights.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                  {r.metaverse_properties?.property_code} / {r.metaverse_properties?.name}
                </td>
                <td className="px-4 py-2">{RIGHT_TYPE_LABEL[r.right_type] ?? r.right_type}</td>
                <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {r.users?.display_name ?? "-"} / {r.agents?.name ?? "-"}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {r.start_date ?? "-"} 〜 {r.end_date ?? "-"}
                </td>
                <td className="px-4 py-2 text-xs">{r.status}</td>
                <td className="px-4 py-2 text-xs">
                  {r.status === "active" && (
                    <button onClick={() => handleEndRight(r.id)} className="mr-2 text-zinc-500 hover:underline dark:text-zinc-400">
                      終了
                    </button>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="text-red-700 hover:underline dark:text-red-400">
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rights.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ登録がありません。</p>}
      </div>
    </div>
  );
}
