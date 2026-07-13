"use client";

import { useEffect, useState } from "react";

type RuleSet = {
  id: string;
  name: string;
  lord_rate: number;
  agency_rate: number;
  organization_rate: number;
  regional_activity_rate: number;
  development_fund_rate: number;
  hq_rate: number;
  status: "draft" | "published";
  effective_from: string | null;
};

const RATE_FIELDS: { key: keyof RuleSet; label: string }[] = [
  { key: "lord_rate", label: "城主" },
  { key: "agency_rate", label: "販売代理店" },
  { key: "organization_rate", label: "上位代理店・組織" },
  { key: "regional_activity_rate", label: "地域活動予算" },
  { key: "development_fund_rate", label: "メタバース開発積立" },
  { key: "hq_rate", label: "本部" },
];

const DEFAULT_FORM = {
  name: "",
  lord_rate: 20,
  agency_rate: 15,
  organization_rate: 15,
  regional_activity_rate: 5,
  development_fund_rate: 15,
  hq_rate: 30,
};

export default function CastleCommissionRulesPage() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  function fetchRuleSets() {
    fetch("/api/admin/commission-rule-sets")
      .then((res) => res.json())
      .then((data) => {
        setRuleSets(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchRuleSets();
  }, []);

  const total = RATE_FIELDS.reduce((sum, f) => sum + Number(form[f.key as keyof typeof form]), 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/commission-rule-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          lord_rate: form.lord_rate / 100,
          agency_rate: form.agency_rate / 100,
          organization_rate: form.organization_rate / 100,
          regional_activity_rate: form.regional_activity_rate / 100,
          development_fund_rate: form.development_fund_rate / 100,
          hq_rate: form.hq_rate / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setForm(DEFAULT_FORM);
      setStatus("loading");
      fetchRuleSets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish(id: string) {
    if (!window.confirm("このルールセットを公開しますか?公開後は編集できません(新しいルールセットの作成が必要です)。")) return;
    setPublishingId(id);
    try {
      const res = await fetch(`/api/admin/commission-rule-sets/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "公開に失敗しました。");
      setStatus("loading");
      fetchRuleSets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公開に失敗しました。");
    } finally {
      setPublishingId(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">土地販売報酬ルール</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          公開されたルールセットのうち、最新のものが土地区画購入時の報酬計算に適用されます。公開後のルールは編集できません(新しいルールセットを作成してください)。公開は本部管理者のみ実行できます。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">ルールセット名</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{f.label}(%)</span>
              <input
                type="number"
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          ))}
        </div>
        <p className={`text-sm font-semibold ${total === 100 ? "text-emerald-600" : "text-red-700 dark:text-red-400"}`}>
          合計: {total}%{total !== 100 && "(100%になるよう調整してください)"}
        </p>
        <button
          type="submit"
          disabled={creating || total !== 100 || !form.name.trim()}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {creating ? "作成中..." : "下書きとして作成"}
        </button>
        {message && <p className="text-xs text-red-700 dark:text-red-400">{message}</p>}
      </form>

      <div className="space-y-2">
        {ruleSets.map((rs) => (
          <div
            key={rs.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{rs.name}</p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  rs.status === "published"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {rs.status === "published" ? "公開中" : "下書き"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              城主{Math.round(rs.lord_rate * 100)}% / 販売代理店{Math.round(rs.agency_rate * 100)}% / 組織
              {Math.round(rs.organization_rate * 100)}% / 地域活動{Math.round(rs.regional_activity_rate * 100)}% /
              開発積立{Math.round(rs.development_fund_rate * 100)}% / 本部{Math.round(rs.hq_rate * 100)}%
            </p>
            {rs.status === "draft" && (
              <button
                onClick={() => handlePublish(rs.id)}
                disabled={publishingId === rs.id}
                className="mt-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {publishingId === rs.id ? "公開中..." : "公開する"}
              </button>
            )}
          </div>
        ))}
        {ruleSets.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだルールセットがありません。</p>
        )}
      </div>
    </div>
  );
}
