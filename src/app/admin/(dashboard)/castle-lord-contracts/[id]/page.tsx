"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Contract = {
  id: string;
  status: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_plan_text: string | null;
  screening_notes: string | null;
  desired_castle_id: string | null;
  castles: { name: string } | null;
  desired_castle: { name: string } | null;
};

type ContractEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

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

// src/lib/castle-lord-contracts.tsのCONTRACT_TRANSITIONSと同じ内容(サーバー専用の
// Supabaseクライアントを読み込むlibファイルはクライアントコンポーネントから
// importできないため、表示用にここへ複製している)。
const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  draft: ["screening", "terminated"],
  screening: ["approved", "terminated"],
  approved: ["payment_pending", "terminated"],
  payment_pending: ["approved", "training", "terminated"],
  training: ["active", "terminated"],
  active: ["suspended", "expired", "terminated"],
  suspended: ["active", "expired", "terminated"],
  expired: ["active", "terminated"],
  terminated: [],
};

export default function CastleLordContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function fetchContract() {
    fetch(`/api/admin/castle-lord-contracts/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setContract(data.contract);
        setEvents(data.events ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [transitioning, setTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);

  async function handleTransition(toStatus: string) {
    if (!contract) return;
    const reason = window.prompt("遷移理由(任意)を入力してください") ?? "";
    setTransitioning(true);
    setTransitionMessage(null);
    try {
      const res = await fetch(`/api/admin/castle-lord-contracts/${contract.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_status: toStatus, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "遷移に失敗しました。");
      fetchContract();
    } catch (error) {
      setTransitionMessage(error instanceof Error ? error.message : "遷移に失敗しました。");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleSave() {
    if (!contract) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/castle-lord-contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: contract.company_name,
          contact_name: contract.contact_name,
          contact_email: contract.contact_email,
          contact_phone: contract.contact_phone,
          business_plan_text: contract.business_plan_text,
          screening_notes: contract.screening_notes,
        }),
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
  if (status === "error" || !contract) return <p className="text-red-700 dark:text-red-400">契約が見つかりません。</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {contract.contact_name ?? contract.company_name ?? "(担当者名未設定)"}
          </h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {STATUS_LABEL[contract.status] ?? contract.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {contract.castles?.name ?? contract.desired_castle?.name ?? "城未確定"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(NEXT_STATUS_OPTIONS[contract.status] ?? []).map((next) => (
            <button
              key={next}
              onClick={() => handleTransition(next)}
              disabled={transitioning}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {STATUS_LABEL[next] ?? next}へ遷移
            </button>
          ))}
        </div>
        {transitionMessage && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">{transitionMessage}</p>
        )}
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          「入金待ち」以降の遷移は本部管理者のみ実行できます。本部担当者が実行するとエラーになります。
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">法人名(任意)</span>
          <input
            type="text"
            value={contract.company_name ?? ""}
            onChange={(e) => setContract({ ...contract, company_name: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">担当者名</span>
          <input
            type="text"
            value={contract.contact_name ?? ""}
            onChange={(e) => setContract({ ...contract, contact_name: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">連絡先メール</span>
          <input
            type="text"
            value={contract.contact_email ?? ""}
            onChange={(e) => setContract({ ...contract, contact_email: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">連絡先電話番号</span>
          <input
            type="text"
            value={contract.contact_phone ?? ""}
            onChange={(e) => setContract({ ...contract, contact_phone: e.target.value || null })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">活動計画</span>
          <textarea
            value={contract.business_plan_text ?? ""}
            onChange={(e) => setContract({ ...contract, business_plan_text: e.target.value || null })}
            rows={4}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">審査メモ(社内用)</span>
          <textarea
            value={contract.screening_notes ?? ""}
            onChange={(e) => setContract({ ...contract, screening_notes: e.target.value || null })}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
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

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">状態変更履歴</h2>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">まだ状態変更はありません。</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {ev.from_status ? `${STATUS_LABEL[ev.from_status] ?? ev.from_status} → ` : ""}
                  {STATUS_LABEL[ev.to_status] ?? ev.to_status}
                </span>
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  {ev.changed_by ?? "不明"} / {new Date(ev.created_at).toLocaleString("ja-JP")}
                </span>
                {ev.reason && <p className="mt-1 text-zinc-600 dark:text-zinc-400">{ev.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
