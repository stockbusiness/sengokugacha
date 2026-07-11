"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Inquiry = {
  id: string;
  inquiry_type: string;
  preferred_contact: string;
  status: "new" | "contacted" | "in_progress" | "closed";
  memo: string | null;
  created_at: string;
  users: { display_name: string | null } | null;
  agents: { name: string } | null;
  metaverse_properties: { name: string } | null;
  metaverse_inquiry_histories: { id: string; note: string; created_at: string }[];
};

const STATUS_LABEL: Record<Inquiry["status"], string> = {
  new: "新規",
  contacted: "連絡済み",
  in_progress: "対応中",
  closed: "完了",
};

export default function MetaverseInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function load() {
    return fetch("/api/admin/metaverse/inquiries")
      .then((res) => res.json())
      .then((data) => {
        setInquiries(data);
        setStatus("ready");
      });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
  }, []);

  async function handleStatusChange(id: string, next: Inquiry["status"]) {
    await fetch(`/api/admin/metaverse/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  async function handleAddNote(id: string) {
    if (!noteDraft.trim()) return;
    await fetch(`/api/admin/metaverse/inquiries/${id}/histories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteDraft.trim() }),
    });
    setNoteDraft("");
    await load();
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/metaverse" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← メタバース内覧管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">問い合わせ管理({inquiries.length}件)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          LIFF内の相談申込フォームから送られた問い合わせの一覧です。ユーザーの紹介元代理店(登録済みの場合)へ自動で紐づきます。
          対応状況はここから更新できます。
        </p>
      </div>

      <div className="space-y-3">
        {inquiries.map((inquiry) => (
          <div key={inquiry.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {inquiry.users?.display_name ?? "(未設定)"} — {inquiry.inquiry_type}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {inquiry.metaverse_properties?.name ?? "物件未指定"} / 紹介元代理店: {inquiry.agents?.name ?? "-"} /
                  希望連絡方法: {inquiry.preferred_contact}
                </p>
                <p className="text-xs text-zinc-400">{new Date(inquiry.created_at).toLocaleString("ja-JP")}</p>
              </div>
              <select
                value={inquiry.status}
                onChange={(e) => handleStatusChange(inquiry.id, e.target.value as Inquiry["status"])}
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {(Object.keys(STATUS_LABEL) as Inquiry["status"][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {inquiry.memo && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{inquiry.memo}</p>}

            <button
              onClick={() => setExpandedId((prev) => (prev === inquiry.id ? null : inquiry.id))}
              className="mt-2 text-xs text-red-700 hover:underline dark:text-red-400"
            >
              対応履歴({inquiry.metaverse_inquiry_histories.length}件){expandedId === inquiry.id ? " ▾" : " ▸"}
            </button>

            {expandedId === inquiry.id && (
              <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                {inquiry.metaverse_inquiry_histories
                  .slice()
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((h) => (
                    <p key={h.id} className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(h.created_at).toLocaleString("ja-JP")}: {h.note}
                    </p>
                  ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="対応メモを追加"
                    className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <button
                    onClick={() => handleAddNote(inquiry.id)}
                    className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    追加
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {inquiries.length === 0 && <p className="text-sm text-zinc-400">まだ問い合わせがありません。</p>}
      </div>
    </div>
  );
}
