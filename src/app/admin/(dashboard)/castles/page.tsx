"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CsvPanel, type CsvColumnHelp } from "@/components/admin/CsvPanel";

type CastleStatus = "draft" | "recruiting" | "published" | "hidden";

// CSVにはコメントを書けないため、列の意味と取りうる値は画面側で示す。
const CASTLE_CSV_COLUMNS: CsvColumnHelp[] = [
  { name: "id", required: false, note: "空欄なら新規作成。値があるとその城の更新。ダウンロードしたCSVには自動で入っています" },
  { name: "name", required: true, note: "城名" },
  { name: "prefecture", required: false, note: "都道府県（例: 岐阜県）" },
  { name: "region", required: false, note: "地方（例: 中部）" },
  {
    name: "status",
    required: false,
    note: "draft(下書き) / recruiting(城主募集中) / published(公開中) / hidden(非公開)。空欄ならdraft",
  },
  {
    name: "unlock_level",
    required: false,
    note: "PUBLIC(常に公開) / PROVINCE_CONQUEST_REQUIRED(主要国の制圧で解放) / REGION_CONQUEST_REQUIRED(地方コンプで解放) / UNPUBLISHED(未解放固定)。空欄ならPUBLIC",
  },
  { name: "historical_review_status", required: false, note: "unreviewed(未監修) / reviewed(監修済み)。空欄ならunreviewed" },
  { name: "display_order", required: false, note: "並び順。0以上の整数。空欄なら0" },
  { name: "lord_plan_price_yen", required: false, note: "この城だけの城主プラン料金（円）。空欄なら「城主プラン設定」の共通金額を使う" },
  { name: "description", required: false, note: "城の説明文。改行やカンマを含めるときは値全体を \"…\" で囲む" },
  { name: "historical_lord_summary", required: false, note: "史実の城主。公式城主パートナーとは別枠で表示されます" },
  { name: "main_image_url", required: false, note: "画像のパス。通常は空欄のままにし、画像は各城の編集画面から差し替えてください" },
];

type Castle = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  status: CastleStatus;
  display_order: number;
};

const STATUS_LABEL: Record<CastleStatus, string> = {
  draft: "下書き",
  recruiting: "城主募集中",
  published: "公開中",
  hidden: "非公開",
};

export default function CastlesPage() {
  const [castles, setCastles] = useState<Castle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [newName, setNewName] = useState("");
  const [newPrefecture, setNewPrefecture] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function fetchCastles() {
    fetch("/api/admin/castles")
      .then((res) => res.json())
      .then((data) => {
        setCastles(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  function reload() {
    setStatus("loading");
    fetchCastles();
  }

  useEffect(() => {
    fetchCastles();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/castles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, prefecture: newPrefecture }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setNewName("");
      setNewPrefecture("");
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">城マスタ({castles.length}城)</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          城主プランの対象となる城を登録します。詳細な情報(説明・画像)や区画・城主契約は各城の編集画面で管理します。
        </p>
      </div>

      <CsvPanel
        endpoint="/api/admin/castles/csv"
        title="CSVで一括登録・更新"
        description="城を数十件まとめて登録したり、公開状態や城主プラン料金をまとめて書き換えたいときに使います。ダウンロードしたCSVをExcelで編集して取り込み直せます。"
        columns={CASTLE_CSV_COLUMNS}
        onImported={reload}
      />

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">城名</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 岐阜城"
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">都道府県</span>
          <input
            type="text"
            value={newPrefecture}
            onChange={(e) => setNewPrefecture(e.target.value)}
            placeholder="例: 岐阜県"
            className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {creating ? "作成中..." : "城を追加"}
        </button>
        {message && <span className="text-xs text-red-700 dark:text-red-400">{message}</span>}
      </form>

      <div className="space-y-2">
        {castles.map((c) => (
          <Link
            key={c.id}
            href={`/admin/castles/${c.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.prefecture ?? "都道府県未設定"}</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {STATUS_LABEL[c.status]}
            </span>
          </Link>
        ))}
        {castles.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">まだ城が登録されていません。</p>
        )}
      </div>
    </div>
  );
}
