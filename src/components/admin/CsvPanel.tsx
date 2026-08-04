"use client";

import { useRef, useState } from "react";

type ImportError = { lineNumber: number; column: string; message: string };

// 列の意味と取りうる値の一覧。CSVにはコメントを書けないため、画面側で示す。
export type CsvColumnHelp = { name: string; required: boolean; note: string };

// 管理画面のCSVエクスポート・取り込みパネル。城マスタと区画で共通に使う。
// エクスポートと取り込みで同じ列順にしてあるため、「出力 → Excelで編集 → 取り込み」
// という往復が成立する。
export function CsvPanel({
  endpoint,
  title,
  description,
  columns,
  onImported,
}: {
  // GETでエクスポート、POSTで取り込みを行う同一URL。?sample=1 で記入例。
  endpoint: string;
  title: string;
  description: string;
  columns?: CsvColumnHelp[];
  onImported?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);

  async function handleFile(file: File) {
    setImporting(true);
    setMessage(null);
    setErrors([]);
    try {
      // Excelが書き出すShift_JISには対応しない。UTF-8で保存してもらう前提のため、
      // 文字化けした場合は「城名は必須です」等の検証エラーとして表れる。
      const text = await file.text();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error ?? "取り込みに失敗しました。");
        setErrors(Array.isArray(data.errors) ? data.errors : []);
        return;
      }

      setMessage(`取り込みました(新規 ${data.created}件 / 更新 ${data.updated}件)`);
      onImported?.();
    } catch {
      setMessage("ファイルを読み込めませんでした。");
    } finally {
      setImporting(false);
      // 同じファイルを選び直したときにもchangeが発火するようクリアする。
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={endpoint}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-200"
        >
          CSVをダウンロード
        </a>
        {/* まだ1件も登録が無いと現物をエクスポートできず、列の並びが分からない。
            記入例があれば、そこから書き始められる。 */}
        <a
          href={`${endpoint}${endpoint.includes("?") ? "&" : "?"}sample=1`}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-200"
        >
          記入例をダウンロード
        </a>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {importing ? "取り込み中..." : "CSVを取り込む"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        id列が空の行は新規作成、値がある行はその行の更新になります。1行でも誤りがあると
        何も書き込まずに中断します。ファイルはUTF-8で保存してください。
      </p>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
        記入例は書き方の見本です。中身を書き換えずに取り込むと「(記入例)〜」がそのまま登録され、
        管理画面からは削除できません(非公開にするしかありません)。必ず自分のデータに置き換えてください。
      </p>

      {columns && columns.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            列の説明を見る
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">列名</th>
                  <th className="py-1 pr-3 font-medium">必須</th>
                  <th className="py-1 font-medium">内容</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-300">
                {columns.map((column) => (
                  <tr key={column.name} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3 align-top font-mono">{column.name}</td>
                    <td className="py-1 pr-3 align-top whitespace-nowrap">{column.required ? "必須" : "任意"}</td>
                    <td className="py-1 align-top">{column.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {message && (
        <p
          className={`mt-3 text-sm ${
            errors.length > 0 || message.includes("失敗") || message.includes("誤り")
              ? "text-red-700 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {errors.map((error, index) => (
            <li key={`${error.lineNumber}-${error.column}-${index}`}>
              {error.lineNumber}行目「{error.column}」: {error.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
