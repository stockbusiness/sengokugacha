"use client";

import { useEffect, useState } from "react";

type GachaConfig = {
  id: string | null;
  base_daily_free_limit: number;
  base_daily_paid_limit: number;
  event_free_limit_override: number | null;
  event_paid_limit_override: number | null;
  event_start_at: string | null;
  event_end_at: string | null;
  preset_name: string | null;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  return new Date(datetimeLocal).toISOString();
}

const PRESETS = {
  通常: { free: 1, paid: 3 },
  小規模イベント: { free: 2, paid: 5 },
  大型イベント: { free: 3, paid: 7 },
} as const;

export default function GachaConfigPage() {
  const [config, setConfig] = useState<GachaConfig | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/gacha-config")
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function applyPreset(name: keyof typeof PRESETS) {
    if (!config) return;
    if (name === "通常") {
      setConfig({
        ...config,
        base_daily_free_limit: PRESETS.通常.free,
        base_daily_paid_limit: PRESETS.通常.paid,
        event_free_limit_override: null,
        event_paid_limit_override: null,
        event_start_at: null,
        event_end_at: null,
        preset_name: "通常",
      });
    } else {
      setConfig({
        ...config,
        event_free_limit_override: PRESETS[name].free,
        event_paid_limit_override: PRESETS[name].paid,
        preset_name: name,
      });
    }
  }

  async function handleSave() {
    if (!config) return;
    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/gacha-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setConfig(data);
      setStatus("ready");
      setMessage("保存しました。");
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    }
  }

  if (status === "loading" || !config) {
    return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">ガチャ設定</h1>

      <div className="flex gap-2">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm font-medium " +
              (config.preset_name === name
                ? "border-red-700 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900")
            }
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field label="無料ガチャ 1日上限(base)">
          <NumberInput
            value={config.base_daily_free_limit}
            onChange={(v) => setConfig({ ...config, base_daily_free_limit: v ?? 0 })}
          />
        </Field>
        <Field label="有料ガチャ 1日上限(base)">
          <NumberInput
            value={config.base_daily_paid_limit}
            onChange={(v) => setConfig({ ...config, base_daily_paid_limit: v ?? 0 })}
          />
        </Field>
        <Field label="無料ガチャ 1日上限(イベント時override)">
          <NumberInput
            value={config.event_free_limit_override}
            onChange={(v) => setConfig({ ...config, event_free_limit_override: v })}
            nullable
          />
        </Field>
        <Field label="有料ガチャ 1日上限(イベント時override)">
          <NumberInput
            value={config.event_paid_limit_override}
            onChange={(v) => setConfig({ ...config, event_paid_limit_override: v })}
            nullable
          />
        </Field>
        <Field label="イベント開始日時(未指定=即時適用)">
          <input
            type="datetime-local"
            value={toDatetimeLocal(config.event_start_at)}
            onChange={(e) => setConfig({ ...config, event_start_at: toIsoOrNull(e.target.value) })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="イベント終了日時(未指定=手動で戻すまで持続)">
          <input
            type="datetime-local"
            value={toDatetimeLocal(config.event_end_at)}
            onChange={(e) => setConfig({ ...config, event_end_at: toIsoOrNull(e.target.value) })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}

      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
      >
        {status === "saving" ? "保存中..." : "保存"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  nullable = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={nullable ? "(未設定)" : undefined}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}
