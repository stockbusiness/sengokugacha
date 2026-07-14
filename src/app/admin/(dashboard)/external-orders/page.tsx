"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ExternalOrder = {
  id: string;
  external_shop_name: string;
  external_order_id: string;
  status: string;
  buyer_name: string;
  amount_yen: number;
  linked_user_id: string | null;
  created_at: string;
  castles: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  payment_pending: "入金待ち",
  payment_confirmed: "入金確認済み",
  user_link_pending: "ユーザー紐付け待ち",
  plot_assignment_pending: "区画割当待ち",
  partially_assigned: "一部割当済み",
  ready_to_grant: "権利付与準備完了",
  rights_granted: "権利付与済み",
  cancel_pending: "取消処理中",
  cancelled: "取消済み",
  refunded: "返金済み",
  on_hold: "保留中",
};

export default function ExternalOrdersPage() {
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);

  function fetchOrders() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (unresolvedOnly) params.set("unresolved_only", "1");
    fetch(`/api/admin/external-orders?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus("loading");
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, unresolvedOnly]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">外部購入(注文)一覧</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            代理店が外部ショップでクロージングした注文を登録し、購入者とLINEユーザーの紐付け・区画割当・権利付与までを管理します。
          </p>
        </div>
        <Link
          href="/admin/external-orders/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          新規注文を登録
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="外部注文ID・購入者氏名で検索..."
          className="w-72 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />
          未処理のみ(権利付与・取消・返金が完了していないもの)
        </label>
      </div>

      {status === "loading" && <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
      {status === "error" && <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}

      {status === "ready" && (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/external-orders/${o.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {o.buyer_name}
                  {!o.linked_user_id && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      未紐付け
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {o.external_shop_name} / {o.external_order_id} — {o.castles?.name ?? "城未確定"} —{" "}
                  {o.amount_yen.toLocaleString()}円
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            </Link>
          ))}
          {orders.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">該当する注文がありません。</p>}
        </div>
      )}
    </div>
  );
}
