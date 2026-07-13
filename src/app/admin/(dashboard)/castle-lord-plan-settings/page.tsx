"use client";

import { useEffect, useState } from "react";

type Settings = {
  plan_price_yen: number;
  min_agent_rank_for_lord: string;
  min_agent_rank_for_commission: string;
  retroactive_payout_enabled: boolean;
  contract_term_months: number;
  initial_plot_capacity: number;
  stage2_plot_capacity: number;
  stage3_plot_capacity: number;
  land_plot_standard_price_yen: number;
  reservation_expiry_minutes: number;
  commission_confirmation_grace_days: number;
};

const DEFAULTS: Settings = {
  plan_price_yen: 1_000_000,
  min_agent_rank_for_lord: "アドバイザー",
  min_agent_rank_for_commission: "アドバイザー",
  retroactive_payout_enabled: false,
  contract_term_months: 12,
  initial_plot_capacity: 30,
  stage2_plot_capacity: 60,
  stage3_plot_capacity: 100,
  land_plot_standard_price_yen: 300_000,
  reservation_expiry_minutes: 1440,
  commission_confirmation_grace_days: 8,
};

const RANK_OPTIONS = ["代理店候補", "アドバイザー", "ディレクター", "エージェント"];

export default function CastleLordPlanSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/castle-lord-plan-settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings({ ...DEFAULTS, ...(data ?? {}) });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/castle-lord-plan-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessage("保存しました");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">城主プラン設定</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          城主プランのプラン価格・区画価格・最低資格等。ここでの変更は本部管理者のみ可能です(実際の販売開始は法務確定後)。
        </p>
      </div>

      <NumField
        label="城主プラン価格(円)"
        value={settings.plan_price_yen}
        onChange={(v) => setSettings({ ...settings, plan_price_yen: v })}
      />
      <NumField
        label="区画標準価格(円)"
        value={settings.land_plot_standard_price_yen}
        onChange={(v) => setSettings({ ...settings, land_plot_standard_price_yen: v })}
      />
      <NumField
        label="初期契約期間(月)"
        value={settings.contract_term_months}
        onChange={(v) => setSettings({ ...settings, contract_term_months: v })}
      />
      <NumField
        label="初期販売枠(区画数)"
        value={settings.initial_plot_capacity}
        onChange={(v) => setSettings({ ...settings, initial_plot_capacity: v })}
      />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          城主の最低代理店資格
        </span>
        <select
          value={settings.min_agent_rank_for_lord}
          onChange={(e) => setSettings({ ...settings, min_agent_rank_for_lord: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {RANK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          区画販売報酬を受け取れる最低代理店資格
        </span>
        <select
          value={settings.min_agent_rank_for_commission}
          onChange={(e) => setSettings({ ...settings, min_agent_rank_for_commission: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {RANK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={settings.retroactive_payout_enabled}
          onChange={(e) => setSettings({ ...settings, retroactive_payout_enabled: e.target.checked })}
        />
        資格未達の代理店候補にも遡及して報酬を支払う
      </label>
      <NumField
        label="区画予約の有効期限(分)"
        value={settings.reservation_expiry_minutes}
        onChange={(v) => setSettings({ ...settings, reservation_expiry_minutes: v })}
      />
      <NumField
        label="報酬確定までの猶予日数(取消・返金期間)"
        value={settings.commission_confirmation_grace_days}
        onChange={(v) => setSettings({ ...settings, commission_confirmation_grace_days: v })}
      />

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        {message && <span className="text-xs text-zinc-500 dark:text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
