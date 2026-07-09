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
  isFoundingMember: boolean;
  foundingMemberNumber: number | null;
  developmentPlotId: string | null;
  developmentArea: string | null;
  isNationBuilder: boolean;
  nationBuilderPlan: string | null;
};

type MemberTypeFilter = "all" | "founding" | "builder" | "general";

const MEMBER_TYPE_OPTIONS: { value: MemberTypeFilter; label: string }[] = [
  { value: "all", label: "全員" },
  { value: "founding", label: "創設メンバーのみ" },
  { value: "builder", label: "建国メンバーのみ" },
  { value: "general", label: "一般国民のみ" },
];

type EditForm = {
  isFoundingMember: boolean;
  foundingMemberNumber: string;
  developmentPlotId: string;
  developmentArea: string;
  isNationBuilder: boolean;
  nationBuilderPlan: string;
};

function toEditForm(u: UserRow): EditForm {
  return {
    isFoundingMember: u.isFoundingMember,
    foundingMemberNumber: u.foundingMemberNumber?.toString() ?? "",
    developmentPlotId: u.developmentPlotId ?? "",
    developmentArea: u.developmentArea ?? "",
    isNationBuilder: u.isNationBuilder,
    nationBuilderPlan: u.nationBuilderPlan ?? "",
  };
}

export default function UsersSearchPage() {
  const [query, setQuery] = useState("");
  const [memberType, setMemberType] = useState<MemberTypeFilter>("all");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function runSearch(nextMemberType: MemberTypeFilter = memberType) {
    setStatus("loading");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (nextMemberType !== "all") params.set("memberType", nextMemberType);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setUsers(data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    runSearch();
  }

  function handleMemberTypeChange(value: MemberTypeFilter) {
    setMemberType(value);
    runSearch(value);
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditForm(toEditForm(u));
    setSaveError(null);
  }

  async function handleSave(id: string) {
    if (!editForm) return;
    setSavingId(id);
    setSaveError(null);

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_founding_member: editForm.isFoundingMember,
          founding_member_number: editForm.foundingMemberNumber ? Number(editForm.foundingMemberNumber) : null,
          development_plot_id: editForm.developmentPlotId || null,
          development_area: editForm.developmentArea || null,
          is_nation_builder: editForm.isNationBuilder,
          nation_builder_plan: editForm.nationBuilderPlan || null,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      setEditForm(null);
      await runSearch();
    } catch {
      setSaveError("保存に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">ユーザー検索</h1>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="表示名 または LINEユーザーIDで検索(空欄で最新50件)"
          className="min-w-[16rem] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <select
          value={memberType}
          onChange={(e) => handleMemberTypeChange(e.target.value as MemberTypeFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {MEMBER_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
                <th className="px-4 py-2">会員区分</th>
                <th className="px-4 py-2">登録日</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <>
                  <tr key={u.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{u.displayName ?? "(未設定)"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-500">{u.lineUserId}</td>
                    <td className="px-4 py-2">{u.rank}</td>
                    <td className="px-4 py-2">{u.kokudaka.toLocaleString()}</td>
                    <td className="px-4 py-2">{u.senko.toLocaleString()}</td>
                    <td className="px-4 py-2">{u.gachaTickets}</td>
                    <td className="px-4 py-2">{u.referringAgentName ?? "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.isFoundingMember && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            創設
                          </span>
                        )}
                        {u.isNationBuilder && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            建国
                          </span>
                        )}
                        {!u.isFoundingMember && !u.isNationBuilder && (
                          <span className="text-[11px] text-zinc-400">一般</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                        className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
                      >
                        {editingId === u.id ? "閉じる" : "編集"}
                      </button>
                    </td>
                  </tr>
                  {editingId === u.id && editForm && (
                    <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-900 dark:bg-zinc-900/40">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={editForm.isFoundingMember}
                              onChange={(e) => setEditForm({ ...editForm, isFoundingMember: e.target.checked })}
                            />
                            創設メンバー
                          </label>
                          <input
                            type="text"
                            value={editForm.foundingMemberNumber}
                            onChange={(e) => setEditForm({ ...editForm, foundingMemberNumber: e.target.value })}
                            placeholder="創設メンバー番号(数値)"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                          <input
                            type="text"
                            value={editForm.developmentPlotId}
                            onChange={(e) => setEditForm({ ...editForm, developmentPlotId: e.target.value })}
                            placeholder="国家開発区画ID"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                          <input
                            type="text"
                            value={editForm.developmentArea}
                            onChange={(e) => setEditForm({ ...editForm, developmentArea: e.target.value })}
                            placeholder="所属エリア"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={editForm.isNationBuilder}
                              onChange={(e) => setEditForm({ ...editForm, isNationBuilder: e.target.checked })}
                            />
                            建国メンバー
                          </label>
                          <input
                            type="text"
                            value={editForm.nationBuilderPlan}
                            onChange={(e) => setEditForm({ ...editForm, nationBuilderPlan: e.target.value })}
                            placeholder="建国メンバープラン名"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </div>
                        {saveError && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{saveError}</p>}
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => handleSave(u.id)}
                          className="mt-3 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          {savingId === u.id ? "保存中..." : "保存"}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="p-4 text-sm text-zinc-400">該当するユーザーがいません。</p>}
        </div>
      )}
    </div>
  );
}
