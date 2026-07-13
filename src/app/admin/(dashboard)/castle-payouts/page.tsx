"use client";

import { useEffect, useState } from "react";

type PayableRecipient = {
  recipientType: string;
  recipientUserId: string | null;
  recipientAgentId: string | null;
  totalAmountYen: number;
  displayName: string;
};

type Payout = {
  id: string;
  recipient_type: string;
  total_amount_yen: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};

const RECIPIENT_LABEL: Record<string, string> = {
  lord: "城主",
  agency: "販売代理店",
  organization: "上位代理店・組織",
  hq: "本部",
  development_fund: "開発積立",
  regional_activity: "地域活動",
};

export default function CastlePayoutsPage() {
  const [recipients, setRecipients] = useState<PayableRecipient[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function fetchAll() {
    Promise.all([
      fetch("/api/admin/commission-ledger/payable-recipients").then((res) => res.json()),
      fetch("/api/admin/payouts").then((res) => res.json()),
    ])
      .then(([recipientData, payoutData]) => {
        setRecipients(recipientData);
        setPayouts(payoutData);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handlePay(recipient: PayableRecipient) {
    const key = `${recipient.recipientType}:${recipient.recipientUserId ?? recipient.recipientAgentId}`;
    if (!window.confirm(`${recipient.displayName}さんへ${recipient.totalAmountYen.toLocaleString()}円を支払済みにしますか?(実際の振込は別途行ってください)`)) {
      return;
    }
    setPayingKey(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_type: recipient.recipientType,
          recipient_user_id: recipient.recipientUserId,
          recipient_agent_id: recipient.recipientAgentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "支払処理に失敗しました。");
      setStatus("loading");
      fetchAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "支払処理に失敗しました。");
    } finally {
      setPayingKey(null);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">土地報酬の支払処理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          「土地報酬元帳」ページで確定済みにした報酬を、受取者単位でまとめて支払済みにします。
          <strong>このボタンは実際の振込を行いません</strong>。銀行振込等で実際に支払った後、記録としてこのボタンを押してください。
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">支払待ち(確定済み・未払い)</h2>
        {message && <p className="mb-2 text-xs text-red-700 dark:text-red-400">{message}</p>}
        <div className="space-y-1">
          {recipients.map((r) => {
            const key = `${r.recipientType}:${r.recipientUserId ?? r.recipientAgentId}`;
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span>
                  {r.displayName}
                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {RECIPIENT_LABEL[r.recipientType] ?? r.recipientType}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{r.totalAmountYen.toLocaleString()}円</span>
                  <button
                    onClick={() => handlePay(r)}
                    disabled={payingKey === key}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {payingKey === key ? "処理中..." : "支払済みにする"}
                  </button>
                </span>
              </div>
            );
          })}
          {recipients.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">支払待ちの確定済み報酬はありません。</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">支払履歴</h2>
        <div className="space-y-1">
          {payouts.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span>{RECIPIENT_LABEL[p.recipient_type] ?? p.recipient_type}</span>
              <span className="flex items-center gap-3">
                <span>{p.total_amount_yen.toLocaleString()}円</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString("ja-JP") : ""}
                </span>
              </span>
            </div>
          ))}
          {payouts.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ支払記録がありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}
