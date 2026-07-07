"use client";

import { useEffect, useState } from "react";

type Achievement = {
  id: string;
  achievementType: string;
  userDisplayName: string;
  referringAgentName: string | null;
  selectedWarlordName: string | null;
  achievedAt: string;
};

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/admin/achievements")
      .then((res) => res.json())
      .then((data) => {
        setAchievements(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">実績ログ({achievements.length}件)</h1>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">達成日時</th>
              <th className="px-4 py-2">城主名</th>
              <th className="px-4 py-2">実績種別</th>
              <th className="px-4 py-2">代表武将</th>
              <th className="px-4 py-2">紐付け代理店</th>
            </tr>
          </thead>
          <tbody>
            {achievements.map((a) => (
              <tr key={a.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                <td className="px-4 py-2 text-xs text-zinc-400">
                  {new Date(a.achievedAt).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{a.userDisplayName}</td>
                <td className="px-4 py-2">{a.achievementType}</td>
                <td className="px-4 py-2">{a.selectedWarlordName ?? "-"}</td>
                <td className="px-4 py-2">{a.referringAgentName ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {achievements.length === 0 && <p className="p-4 text-sm text-zinc-400">まだ実績がありません。</p>}
      </div>
    </div>
  );
}
