"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TourSession = {
  id: string;
  issued_at: string;
  expires_at: string;
  access_count: number;
  status: "active" | "expired" | "revoked";
  users: { display_name: string | null } | null;
  agents: { name: string } | null;
  metaverse_properties: { name: string } | null;
};

const STATUS_LABEL: Record<TourSession["status"], string> = {
  active: "有効",
  expired: "期限切れ",
  revoked: "失効",
};

export default function MetaverseTourSessionsPage() {
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [savingTtl, setSavingTtl] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/metaverse/tour-sessions").then((res) => res.json()),
      fetch("/api/admin/metaverse/settings").then((res) => res.json()),
    ])
      .then(([sessionData, settingsData]) => {
        setSessions(sessionData);
        setTtlMinutes(settingsData.tour_token_ttl_minutes);
        setSettingsId(settingsData.id);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSaveTtl() {
    if (ttlMinutes == null) return;
    setSavingTtl(true);
    try {
      const res = await fetch("/api/admin/metaverse/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: settingsId, tour_token_ttl_minutes: ttlMinutes }),
      });
      const data = await res.json();
      setSettingsId(data.id);
    } finally {
      setSavingTtl(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">外部内覧セッション</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          LIFF内の物件詳細ページで「全画面で内覧する」を押した際に発行される一時トークンの発行状況です。
          個人情報(氏名・LINE ID等)はトークンにもこの画面のレスポンスにも含まれません。有効期限を過ぎたリンクは
          自動的に失効し、下のフォームから既定の有効期限(分)を変更できます。非公開の物件にはトークンを発行できません。
        </p>
      </div>

      <div className="flex items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">内覧トークンの有効期限(分)</span>
          <input
            type="number"
            value={ttlMinutes ?? ""}
            onChange={(e) => setTtlMinutes(Number(e.target.value))}
            className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          onClick={handleSaveTtl}
          disabled={savingTtl}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {savingTtl ? "保存中..." : "保存"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">発行日時</th>
              <th className="px-4 py-2">ユーザー</th>
              <th className="px-4 py-2">紐づく代理店</th>
              <th className="px-4 py-2">物件</th>
              <th className="px-4 py-2">有効期限</th>
              <th className="px-4 py-2">アクセス回数</th>
              <th className="px-4 py-2">状態</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-xs text-zinc-400">{new Date(s.issued_at).toLocaleString("ja-JP")}</td>
                <td className="px-4 py-2">{s.users?.display_name ?? "-"}</td>
                <td className="px-4 py-2">{s.agents?.name ?? "-"}</td>
                <td className="px-4 py-2">{s.metaverse_properties?.name ?? "-"}</td>
                <td className="px-4 py-2 text-xs text-zinc-400">{new Date(s.expires_at).toLocaleString("ja-JP")}</td>
                <td className="px-4 py-2">{s.access_count}</td>
                <td className="px-4 py-2">{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessions.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ内覧セッションがありません。</p>}
      </div>
    </div>
  );
}
