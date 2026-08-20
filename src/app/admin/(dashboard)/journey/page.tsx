"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 「はじまりの旅」管理トップ。機能フラグ・付与上限・使用状況・要対応の件数をここに集める。
//
// 指示書§11: 付与上限変更・LIMIT_HELD解除・取消訂正・緊急停止は本部管理者(manager)限定で、
// 実行者名と操作理由を必須とする。権限の判定はサーバー側で行い、画面はエラーを表示するだけ。

type Settings = {
  missions_enabled: boolean;
  rewards_enabled: boolean;
  consultation_sync_enabled: boolean;
  line_notifications_enabled: boolean;
  course_reward_cap: number;
  period_reward_cap: number;
  per_request_reward_cap: number;
  stale_reward_minutes: number;
  resume_window_days: number;
  reward_window_days: number;
};

type RewardSummary = {
  succeededTotal: number;
  inFlightTotal: number;
  limitHeldTotal: number;
  courseCap: number;
  periodCap: number;
  capReached: boolean;
  staleCount: number;
};

const FLAGS: { key: keyof Settings; label: string; note: string }[] = [
  { key: "missions_enabled", label: "はじまりの旅を公開する", note: "OFFにすると参加者側の入口ごと消えます（緊急停止）" },
  { key: "rewards_enabled", label: "特典の付与を有効にする", note: "OFFの間、付与要求は作られますが送信されません" },
  { key: "consultation_sync_enabled", label: "相談希望を代理店へ連携する", note: "PR6で使用します" },
  { key: "line_notifications_enabled", label: "LINE通知を送る", note: "PR6で使用します" },
];

const NUMBERS: { key: keyof Settings; label: string; note: string }[] = [
  { key: "course_reward_cap", label: "コース単位の付与総量上限", note: "0のままだと1件も付与されません" },
  { key: "period_reward_cap", label: "期間単位の付与総量上限", note: "0のままだと1件も付与されません" },
  { key: "per_request_reward_cap", label: "1件あたりの上限", note: "設定ミスの最後の砦" },
  { key: "stale_reward_minutes", label: "滞留とみなす分数", note: "この時間を超えたPENDINGを要対応として出します" },
  { key: "resume_window_days", label: "再開できる日数", note: "" },
  { key: "reward_window_days", label: "特典の対象期間（日）", note: "再開できる日数とは別に設定できます" },
];

export default function AdminJourneyPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    return Promise.all([
      fetch("/api/admin/journey/settings").then((res) => res.json()),
      fetch("/api/admin/journey/rewards").then((res) => res.json()),
    ]).then(([settingsData, rewardsData]: [Settings, { summary: RewardSummary }]) => {
      setSettings(settingsData);
      setDraft(settingsData);
      setSummary(rewardsData.summary);
      setStatus("ready");
    });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
  }, []);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/journey/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setReason("");
      setMessage("保存しました");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !settings || !draft) {
    return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;
  }

  const changed = JSON.stringify(settings) !== JSON.stringify(draft);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">はじまりの旅</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          学び・体験型のオンボーディング機能です。機能の公開停止と特典の付与停止はここから行います。
          既存の「本日の任務」とは別の機能で、互いに影響しません。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/journey/courses" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
          コース・教材の管理
        </Link>
        <Link href="/admin/journey/enrollments" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
          ユーザー別進捗
        </Link>
        <Link href="/admin/journey/rewards" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
          特典の付与状況
        </Link>
      </div>

      {/* 付与総量の使用状況(指示書§4.2) */}
      {summary && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">特典の使用状況</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="付与済み" value={summary.succeededTotal} />
            <Stat label="送信中・待ち" value={summary.inFlightTotal} />
            <Stat label="上限保留中" value={summary.limitHeldTotal} />
            <Stat label="要対応（滞留）" value={summary.staleCount} highlight={summary.staleCount > 0} />
          </div>
          {summary.capReached && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              付与総量が上限に達しています。新しい付与は保留されます（回答・進捗・完了の記録は残ります）。
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">公開設定</h2>
        <div className="mt-3 space-y-3">
          {FLAGS.map((flag) => (
            <label key={flag.key} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={draft[flag.key] as boolean}
                onChange={(e) => setDraft({ ...draft, [flag.key]: e.target.checked })}
                className="mt-1"
              />
              <span>
                <span className="block text-sm text-zinc-900 dark:text-zinc-50">{flag.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{flag.note}</span>
              </span>
            </label>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-bold text-zinc-900 dark:text-zinc-50">数値設定</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {NUMBERS.map((item) => (
            <label key={item.key} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{item.label}</span>
              <input
                type="number"
                value={draft[item.key] as number}
                onChange={(e) => setDraft({ ...draft, [item.key]: Number(e.target.value) })}
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              {item.note && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{item.note}</span>}
            </label>
          ))}
        </div>

        {/* 指示書§11「実行者名と操作理由を必須とする」 */}
        <label className="mt-6 block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            操作理由（必須。監査ログに残ります）
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 実証開始のため公開、上限を運営決定値へ変更"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !changed || reason.trim().length === 0}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
          {message && <span className="text-xs text-zinc-600 dark:text-zinc-400">{message}</span>}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          この設定の変更は本部管理者のみ行えます。担当者権限では保存時にエラーになります。
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-800"}`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">{value.toLocaleString()}</p>
    </div>
  );
}
