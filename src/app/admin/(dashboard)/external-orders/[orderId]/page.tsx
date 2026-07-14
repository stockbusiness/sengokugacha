"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Order = {
  id: string;
  external_shop_name: string;
  external_order_id: string;
  status: string;
  amount_yen: number;
  buyer_name: string;
  buyer_name_kana: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  linked_user_id: string | null;
  castle_id: string | null;
  agent_name_snapshot: string | null;
  admin_memo: string | null;
  castles: { name: string } | null;
};

type Assignment = {
  id: string;
  plot_id: string;
  status: string;
  castle_plots: { plot_code: string; name: string; price_yen: number; status: string } | null;
};

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price_yen: number;
  assignments: Assignment[];
};

type HistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

type AssignablePlot = { id: string; plot_code: string; name: string; price_yen: number };
type UserSearchResult = { id: string; displayName: string | null; lineUserId: string };

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

export default function ExternalOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fetchDetail() {
    fetch(`/api/admin/external-orders/${orderId}`)
      .then((res) => res.json())
      .then((data) => {
        setOrder(data.order);
        setItems(data.items ?? []);
        setHistory(data.history ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function runAction(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "処理に失敗しました。");
      fetchDetail();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !order) return <p className="text-red-700 dark:text-red-400">注文が見つかりません。</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{order.buyer_name}</h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {order.external_shop_name} / {order.external_order_id} — {order.castles?.name ?? "城未確定"} —{" "}
          {order.amount_yen.toLocaleString()}円
        </p>
        {order.agent_name_snapshot && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">担当代理店: {order.agent_name_snapshot}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {order.status === "draft" && (
            <button
              onClick={() => runAction(`/api/admin/external-orders/${order.id}`, { action: "submit" }).then(() => {})}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              入金待ちにする
            </button>
          )}
          {order.status === "payment_pending" && (
            <button
              onClick={() => runAction(`/api/admin/external-orders/${order.id}/confirm-payment`)}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              入金確認を確定する(本部管理者限定)
            </button>
          )}
          {order.status === "ready_to_grant" && (
            <button
              onClick={() => {
                if (!window.confirm("区画権利を付与します。よろしいですか?")) return;
                runAction(`/api/admin/external-orders/${order.id}/grant-rights`);
              }}
              disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              区画権利を付与する(本部管理者限定)
            </button>
          )}
        </div>
        {actionMessage && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{actionMessage}</p>}
      </div>

      <UserLinkSection order={order} busy={busy} runAction={runAction} />

      <PlotAssignmentSection order={order} items={items} busy={busy} runAction={runAction} />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">連絡先</p>
        <p className="mt-1">メール: {order.buyer_email ?? "未登録"}</p>
        <p>電話番号: {order.buyer_phone ?? "未登録"}</p>
        {order.admin_memo && <p className="mt-2 whitespace-pre-wrap">メモ: {order.admin_memo}</p>}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">状態変更履歴</h2>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">まだ状態変更はありません。</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {h.from_status ? `${STATUS_LABEL[h.from_status] ?? h.from_status} → ` : ""}
                  {STATUS_LABEL[h.to_status] ?? h.to_status}
                </span>
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  {h.changed_by ?? "不明"} / {new Date(h.created_at).toLocaleString("ja-JP")}
                </span>
                {h.reason && <p className="mt-1 text-zinc-600 dark:text-zinc-400">{h.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UserLinkSection({
  order,
  busy,
  runAction,
}: {
  order: Order;
  busy: boolean;
  runAction: (path: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      fetch(`/api/admin/users?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => setResults(data))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">購入者とLINEユーザーの紐付け</p>
      {order.linked_user_id ? (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">紐付け済み(ユーザーID: {order.linked_user_id})</p>
          <button
            onClick={() => {
              const reason = window.prompt("解除理由を入力してください");
              if (!reason) return;
              runAction(`/api/admin/external-orders/${order.id}/unlink-user`, { reason });
            }}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            紐付けを解除
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="LINE表示名またはLINEユーザーIDで検索..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {results.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(`/api/admin/external-orders/${order.id}/link-user`, { user_id: u.id })}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-900"
                >
                  {u.displayName ?? "(表示名未設定)"}
                  <span className="ml-2 text-xs text-zinc-500">{u.lineUserId}</span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">紐付け確定は本部管理者のみ実行できます。</p>
        </div>
      )}
    </div>
  );
}

function PlotAssignmentSection({
  order,
  items,
  busy,
  runAction,
}: {
  order: Order;
  items: OrderItem[];
  busy: boolean;
  runAction: (path: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [assignablePlots, setAssignablePlots] = useState<AssignablePlot[]>([]);

  function openPicker(itemId: string) {
    setPickerItemId(itemId);
    fetch(`/api/admin/external-orders/${order.id}/assignable-plots`)
      .then((res) => res.json())
      .then((data) => setAssignablePlots(data))
      .catch(() => setAssignablePlots([]));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">区画割当</p>
      <div className="mt-2 space-y-3">
        {items.map((item) => {
          const activeAssignments = item.assignments.filter((a) => a.status === "assigned");
          return (
            <div key={item.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-900 dark:text-zinc-50">
                  {item.product_name}({activeAssignments.length}/{item.quantity}区画)
                </p>
                {activeAssignments.length < item.quantity && (
                  <button
                    onClick={() => openPicker(item.id)}
                    disabled={busy}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                  >
                    区画を選ぶ
                  </button>
                )}
              </div>

              {activeAssignments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {activeAssignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                      <span>
                        {a.castle_plots?.plot_code} {a.castle_plots?.name}
                      </span>
                      <button
                        onClick={() =>
                          runAction(`/api/admin/external-order-plot-assignments/${a.id}/unassign`)
                        }
                        disabled={busy}
                        className="text-zinc-500 hover:underline disabled:opacity-50"
                      >
                        解除
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {pickerItemId === item.id && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {assignablePlots.length === 0 && (
                    <p className="p-2 text-xs text-zinc-500 dark:text-zinc-400">割当可能な区画がありません。</p>
                  )}
                  {assignablePlots.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        runAction(`/api/admin/external-order-items/${item.id}/assign-plot`, { plot_id: p.id }).then(
                          () => setPickerItemId(null)
                        );
                      }}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-900"
                    >
                      {p.plot_code} {p.name} — {p.price_yen.toLocaleString()}円
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
