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

// マイグレーションの適用漏れ。手動適用運用のため、SQLを流し忘れるとコードだけが
// 先に本番へ出て「列が無い」というエラーが利用者側で起きる。CIの migration-test は
// まっさらなDBへ全件を適用するので、この状態は構造上検知できない。
type MigrationStatus =
  | {
      available: true;
      expectedCount: number;
      appliedCount: number;
      drift: { missing: string[]; unexpected: string[] };
      hasDrift: boolean;
      messages: string[];
    }
  | { available: false; reason: string };

// PR-P1b。停止中に報酬計上が呼ばれた件数。
type CommissionWriteBlocked = { last24h: number; last7d: number; lastBlockedAt: string | null };

export default function OperationsHealthPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [migrations, setMigrations] = useState<MigrationStatus | null>(null);
  const [blocked, setBlocked] = useState<CommissionWriteBlocked | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState("");

  function load() {
    fetch("/api/admin/operations-health")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
        return data as {
          findings: Finding[];
          migrations: MigrationStatus | null;
          commissionWriteBlocked: CommissionWriteBlocked | null;
          checkedAt: string;
        };
      })
      .then((data) => {
        setFindings(data.findings);
        setMigrations(data.migrations ?? null);
        setBlocked(data.commissionWriteBlocked ?? null);
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

          {/* 適用漏れは他の異常の原因になりうるので最上部に置く */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">マイグレーションの適用状況</h2>
            {migrations === null && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">確認していません。</p>
            )}
            {migrations && !migrations.available && (
              <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <p className="font-semibold">確認できませんでした</p>
                <p className="mt-1">{migrations.reason}</p>
                <p className="mt-1">
                  20260816000001 がこのDBへ未適用の場合もここに出ます。適用すると確認できるようになります。
                </p>
              </div>
            )}
            {migrations?.available && !migrations.hasDrift && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {migrations.expectedCount}件すべて適用済みです。
              </p>
            )}
            {migrations?.available &&
              migrations.hasDrift &&
              migrations.messages.map((message) => (
                <div
                  key={message}
                  className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  <p className="font-semibold">
                    リポジトリ {migrations.expectedCount}件 / DB {migrations.appliedCount}件
                  </p>
                  <p className="mt-1 leading-relaxed">{message}</p>
                </div>
              ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">報酬計上の停止状況</h2>
            {blocked === null ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">確認できませんでした。</p>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                <p>
                  停止中に報酬計上が呼ばれた回数: 直近24時間 <strong>{blocked.last24h}</strong>件 / 直近7日{" "}
                  <strong>{blocked.last7d}</strong>件
                </p>
                <p className="mt-1">
                  最終: {blocked.lastBlockedAt ? new Date(blocked.lastBlockedAt).toLocaleString("ja-JP") : "なし"}
                </p>
                <p className="mt-2 leading-relaxed text-zinc-500 dark:text-zinc-400">
                  報酬計算はAgencyへ移管済みです。土地が売れるたびにここが増えるのが正常な状態です。
                  土地販売が動いているのに0件のままなら、ガードを通らない別経路が生まれている疑いがあります。
                </p>
              </div>
            )}
          </section>

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
