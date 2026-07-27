"use client";

import { useEffect, useState } from "react";

type Finding = {
  category: "purchase" | "entitlement" | "integration";
  checkName: string;
  count: number;
  detail: string;
};

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  purchase: "購入",
  entitlement: "Entitlement",
  integration: "連携",
};

export default function OperationsHealthPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState("");

  function load() {
    fetch("/api/admin/operations-health")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
        return data as { findings: Finding[]; checkedAt: string };
      })
      .then((data) => {
        setFindings(data.findings);
        setCheckedAt(data.checkedAt);
        setStatus("ready");
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "読み込みに失敗しました");
        setStatus("error");
      });
  }

  useEffect(() => {
    load();
  }, []);

  const anomalies = findings.filter((f) => f.count > 0);
  const healthy = findings.filter((f) => f.count === 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">運用監視</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            購入・entitlement・連携基盤の静かな不整合を検知する読み取り専用の照合結果です。ここでの表示だけで自動修正は行いません。異常が見つかった場合は「連携復旧管理」「購入履歴」画面から個別に対応してください。
          </p>
        </div>
        <button
          onClick={() => {
            setStatus("loading");
            load();
          }}
          disabled={status === "loading"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          再チェック
        </button>
      </div>

      {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
      {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>}

      {status === "ready" && (
        <>
          {checkedAt && <p className="text-xs text-zinc-400">最終チェック: {new Date(checkedAt).toLocaleString("ja-JP")}</p>}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">要対応({anomalies.length}件)</h2>
            {anomalies.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">異常は検出されていません。</p>
            ) : (
              <div className="space-y-2">
                {anomalies.map((f) => (
                  <div
                    key={`${f.category}.${f.checkName}`}
                    className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <p className="font-semibold">
                      [{CATEGORY_LABEL[f.category]}] {f.checkName} — {f.count}件
                    </p>
                    <p className="mt-1">{f.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">正常({healthy.length}件)</h2>
            <div className="grid grid-cols-1 gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
              {healthy.map((f) => (
                <p key={`${f.category}.${f.checkName}`}>
                  [{CATEGORY_LABEL[f.category]}] {f.checkName}: 0件
                </p>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
