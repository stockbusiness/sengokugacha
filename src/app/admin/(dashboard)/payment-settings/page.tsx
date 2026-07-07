"use client";

import { useEffect, useState } from "react";

type PaymentSettingsView = {
  id: string | null;
  stripe_publishable_key: string | null;
  stripe_secret_key_set: boolean;
  stripe_secret_key_last4: string | null;
  stripe_webhook_secret_set: boolean;
  stripe_webhook_secret_last4: string | null;
  kokudaka_pack_amount_yen: number;
  kokudaka_pack_kokudaka: number;
  gacha_ticket_pack_amount_yen: number;
  gacha_ticket_pack_tickets: number;
};

export default function PaymentSettingsPage() {
  const [data, setData] = useState<PaymentSettingsView | null>(null);
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/payment-settings")
      .then((res) => res.json())
      .then((body: PaymentSettingsView) => {
        setData(body);
        setPublishableKey(body.stripe_publishable_key ?? "");
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!data) return;
    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripe_publishable_key: publishableKey,
          stripe_secret_key: secretKey,
          stripe_webhook_secret: webhookSecret,
          kokudaka_pack_amount_yen: data.kokudaka_pack_amount_yen,
          kokudaka_pack_kokudaka: data.kokudaka_pack_kokudaka,
          gacha_ticket_pack_amount_yen: data.gacha_ticket_pack_amount_yen,
          gacha_ticket_pack_tickets: data.gacha_ticket_pack_tickets,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "保存に失敗しました。");
      setSecretKey("");
      setWebhookSecret("");
      await load();
      setMessage("保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setStatus("ready");
    }
  }

  if (status === "loading" || !data) return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Stripe決済設定</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        シークレット系の項目は空欄のまま保存すると変更されません(値の確認・表示はセキュリティ上できません)。
        Webhookのエンドポイントは <code>/api/stripe/webhook</code> です。Stripeダッシュボードでこのパスを登録し、
        発行された signing secret をここに設定してください。
      </p>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field label="Publishable Key">
          <input
            type="text"
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
            placeholder="pk_live_..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field
          label={`Secret Key ${data.stripe_secret_key_set ? `(設定済み: ****${data.stripe_secret_key_last4})` : "(未設定)"}`}
        >
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="sk_live_..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field
          label={`Webhook Signing Secret ${data.stripe_webhook_secret_set ? `(設定済み: ****${data.stripe_webhook_secret_last4})` : "(未設定)"}`}
        >
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="whsec_..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">購入パック</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="石高パック 価格(円)">
            <NumberInput
              value={data.kokudaka_pack_amount_yen}
              onChange={(v) => setData({ ...data, kokudaka_pack_amount_yen: v })}
            />
          </Field>
          <Field label="石高パック 付与量">
            <NumberInput
              value={data.kokudaka_pack_kokudaka}
              onChange={(v) => setData({ ...data, kokudaka_pack_kokudaka: v })}
            />
          </Field>
          <Field label="ガチャ券パック 価格(円)">
            <NumberInput
              value={data.gacha_ticket_pack_amount_yen}
              onChange={(v) => setData({ ...data, gacha_ticket_pack_amount_yen: v })}
            />
          </Field>
          <Field label="ガチャ券パック 付与枚数">
            <NumberInput
              value={data.gacha_ticket_pack_tickets}
              onChange={(v) => setData({ ...data, gacha_ticket_pack_tickets: v })}
            />
          </Field>
        </div>
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

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}
