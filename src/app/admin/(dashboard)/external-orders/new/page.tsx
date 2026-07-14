"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Castle = { id: string; name: string };
type ItemForm = { productName: string; quantity: number; unitPriceYen: number };

function emptyItem(): ItemForm {
  return { productName: "", quantity: 1, unitPriceYen: 300_000 };
}

export default function NewExternalOrderPage() {
  const router = useRouter();
  const [castles, setCastles] = useState<Castle[]>([]);

  const [externalShopName, setExternalShopName] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerNameKana, setBuyerNameKana] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [castleId, setCastleId] = useState("");
  const [agentNameSnapshot, setAgentNameSnapshot] = useState("");
  const [externalAgentId, setExternalAgentId] = useState("");
  const [adminMemo, setAdminMemo] = useState("");
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/castles")
      .then((res) => res.json())
      .then((data) => setCastles(data))
      .catch(() => setCastles([]));
  }, []);

  const amountYen = items.reduce((sum, item) => sum + item.quantity * item.unitPriceYen, 0);

  function updateItem(index: number, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/external-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_shop_name: externalShopName,
          external_order_id: externalOrderId,
          buyer_name: buyerName,
          buyer_name_kana: buyerNameKana || null,
          buyer_email: buyerEmail || null,
          buyer_phone: buyerPhone || null,
          castle_id: castleId || null,
          agent_name_snapshot: agentNameSnapshot || null,
          external_agent_id: externalAgentId || null,
          admin_memo: adminMemo || null,
          amount_yen: amountYen,
          items: items.map((item) => ({
            product_name: item.productName,
            quantity: item.quantity,
            unit_price_yen: item.unitPriceYen,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登録に失敗しました。");
      router.push(`/admin/external-orders/${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登録に失敗しました。");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">外部注文の新規登録</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          外部ショップで代理店がクロージングした注文の情報を登録します。同一ショップ・同一注文IDは重複登録できません。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">外部ショップ名 *</span>
            <input
              required
              type="text"
              value={externalShopName}
              onChange={(e) => setExternalShopName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">外部注文ID *</span>
            <input
              required
              type="text"
              value={externalOrderId}
              onChange={(e) => setExternalOrderId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">購入者氏名 *</span>
            <input
              required
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">氏名カナ</span>
            <input
              type="text"
              value={buyerNameKana}
              onChange={(e) => setBuyerNameKana(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">メールアドレス</span>
            <input
              type="text"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">電話番号</span>
            <input
              type="text"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">対象城(確定していれば)</span>
          <select
            value={castleId}
            onChange={(e) => setCastleId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">未確定</option>
            {castles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">担当代理店名(販売記録用)</span>
            <input
              type="text"
              value={agentNameSnapshot}
              onChange={(e) => setAgentNameSnapshot(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">外部代理店ID</span>
            <input
              type="text"
              value={externalAgentId}
              onChange={(e) => setExternalAgentId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          代理店情報は販売記録として保持するのみです。報酬計算は外部システム側で行うため、この登録では報酬は一切計上されません。
        </p>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">注文明細(区画ごとに1行)</span>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-500 dark:text-zinc-400">商品名</span>
                <input
                  required
                  type="text"
                  value={item.productName}
                  onChange={(e) => updateItem(index, { productName: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-500 dark:text-zinc-400">数量(区画数)</span>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-500 dark:text-zinc-400">単価(円)</span>
                <input
                  type="number"
                  min={0}
                  value={item.unitPriceYen}
                  onChange={(e) => updateItem(index, { unitPriceYen: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                disabled={items.length <= 1}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            + 明細を追加
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">合計金額: {amountYen.toLocaleString()}円</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">運営メモ</span>
          <textarea
            value={adminMemo}
            onChange={(e) => setAdminMemo(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {submitting ? "登録中..." : "注文を登録"}
          </button>
          {message && <span className="text-xs text-red-700 dark:text-red-400">{message}</span>}
        </div>
      </form>
    </div>
  );
}
