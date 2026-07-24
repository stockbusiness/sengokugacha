"use client";

import { useEffect, useState } from "react";

type MergeConflict = {
  id: string;
  source_common_user_id: string;
  target_common_user_id: string;
  source_user_id: string;
  conflicting_target_user_id: string;
  created_at: string;
};

type UnresolvedAgentAssignment = {
  id: string;
  common_user_id: string;
  reason: string;
  created_at: string;
  updated_at: string;
};

type UnresolvedCommonUserMerge = {
  id: string;
  source_common_user_id: string;
  target_common_user_id: string;
  reason: string;
  attempt_count: number;
  created_at: string;
  updated_at: string;
};

type OutboxEvent = {
  id: string;
  source_type: string;
  source_id: string;
  event_type: string;
  target_system_key: string;
  status: "pending" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  table: "integration_outbox_events" | "notification_outbox_events";
};

const REASON_LABEL: Record<string, string> = {
  agent_code_undetermined: "担当代理店コードを特定できず",
  agent_not_found: "該当代理店が未同期",
  user_not_found: "該当ユーザーが未同期",
  source_user_not_found: "統合元ユーザーが未同期",
};

export default function IntegrationRecoveryPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
  const [unresolvedAssignments, setUnresolvedAssignments] = useState<UnresolvedAgentAssignment[]>([]);
  const [unresolvedMerges, setUnresolvedMerges] = useState<UnresolvedCommonUserMerge[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<OutboxEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return Promise.all([
      fetch("/api/admin/integrations/sen-no-kuni-hub/merge-conflicts"),
      fetch("/api/admin/integrations/sen-no-kuni-hub/unresolved-agent-assignments"),
      fetch("/api/admin/integrations/sen-no-kuni-hub/unresolved-common-user-merges"),
      fetch("/api/admin/integration-outbox"),
    ])
      .then(([conflictsRes, unresolvedRes, unresolvedMergesRes, outboxRes]) => {
        if (!conflictsRes.ok || !unresolvedRes.ok || !unresolvedMergesRes.ok || !outboxRes.ok) {
          throw new Error("読み込みに失敗しました");
        }
        return Promise.all([conflictsRes.json(), unresolvedRes.json(), unresolvedMergesRes.json(), outboxRes.json()]);
      })
      .then(([conflicts, unresolved, unresolvedMergesData, outboxData]) => {
        setMergeConflicts(conflicts);
        setUnresolvedAssignments(unresolved);
        setUnresolvedMerges(unresolvedMergesData);
        setOutboxEvents([...outboxData.integrationEvents, ...outboxData.notificationEvents]);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCleanupNonces() {
    setMessage("");
    setBusyId("cleanup-nonces");
    try {
      const res = await fetch("/api/admin/integrations/sen-no-kuni-hub/cleanup-nonces", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      setMessage(`期限切れnonceを${data.deletedCount}件削除しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "削除に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResolveMergeConflict(id: string) {
    setMessage("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/integrations/sen-no-kuni-hub/merge-conflicts/${id}/resolve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解決済みへの更新に失敗しました。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解決済みへの更新に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismissUnresolvedAssignment(id: string) {
    setMessage("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/integrations/sen-no-kuni-hub/unresolved-agent-assignments/${id}/dismiss`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "却下に失敗しました。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "却下に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryAllUnresolvedAssignments() {
    setMessage("");
    setBusyId("retry-all");
    try {
      const res = await fetch("/api/admin/integrations/sen-no-kuni-hub/retry-agent-assignments", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "再解決に失敗しました");
      setMessage(`${data.retriedCount}件を再試行し、${data.resolvedCount}件解決しました。`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "再解決に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryAllUnresolvedMerges() {
    setMessage("");
    setBusyId("retry-merges-all");
    try {
      const res = await fetch("/api/admin/integrations/sen-no-kuni-hub/retry-common-user-merges", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "再解決に失敗しました");
      setMessage(`${data.retriedCount}件を再試行し、${data.resolvedCount}件解決しました。`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "再解決に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDrainOutbox() {
    setMessage("");
    setBusyId("drain-outbox");
    try {
      const res = await fetch("/api/admin/integration-outbox/drain", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "再送に失敗しました");
      setMessage(
        `外部連携: ${data.integration.retried}件を再試行し${data.integration.sent}件送信、` +
          `通知: ${data.notification.retried}件を再試行し${data.notification.sent}件送信しました。`
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "再送に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">千ノ国連携 復旧管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          新規HMAC連携(/api/integrations/sen-no-kuni-hub)で自動処理できなかったイベントの確認・再解決を行います。
        </p>
      </div>

      {message && <p className="rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{message}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">nonceクリーンアップ</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          HMACリプレイ防止用のnonce記録は自動削除されません。24時間より前のものを手動で削除できます。
        </p>
        <button
          onClick={handleCleanupNonces}
          disabled={busyId === "cleanup-nonces"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          期限切れnonceを削除
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">common_user.merged 競合</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          統合先common_user_idが既に別のローカルユーザーへ割当済みのため、自動統合をスキップしたケースです。ローカルアカウントの統合は本画面からは行いません。
        </p>
        {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}
        {status === "ready" && mergeConflicts.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">競合はありません。</p>
        )}
        {status === "ready" && mergeConflicts.length > 0 && (
          <div className="space-y-2">
            {mergeConflicts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  <p>
                    source: {c.source_common_user_id}(user_id={c.source_user_id}) → target: {c.target_common_user_id}(競合先user_id=
                    {c.conflicting_target_user_id})
                  </p>
                  <p>{new Date(c.created_at).toLocaleString("ja-JP")}</p>
                </div>
                <button
                  onClick={() => handleResolveMergeConflict(c.id)}
                  disabled={busyId === c.id}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  解決済みにする
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">未解決の担当代理店割当</h2>
          <button
            onClick={handleRetryAllUnresolvedAssignments}
            disabled={busyId === "retry-all" || unresolvedAssignments.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            全件再解決を試行
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          担当代理店コードを特定できない、または代理店マスタが未同期で解決できなかったイベントです。代理店の同期が進んだ後に「全件再解決を試行」で再処理できます。
        </p>
        {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}
        {status === "ready" && unresolvedAssignments.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">未解決の割当はありません。</p>
        )}
        {status === "ready" && unresolvedAssignments.length > 0 && (
          <div className="space-y-2">
            {unresolvedAssignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  <p>
                    common_user_id: {a.common_user_id} —{" "}
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{REASON_LABEL[a.reason] ?? a.reason}</span>
                  </p>
                  <p>更新: {new Date(a.updated_at).toLocaleString("ja-JP")}</p>
                </div>
                <button
                  onClick={() => handleDismissUnresolvedAssignment(a.id)}
                  disabled={busyId === a.id}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  却下
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">未解決のcommon_user統合イベント</h2>
          <button
            onClick={handleRetryAllUnresolvedMerges}
            disabled={busyId === "retry-merges-all" || unresolvedMerges.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            全件再解決を試行
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          common_user.mergedイベント受信時に統合元(source)のユーザーがまだ同期されておらず処理できなかったケースです。該当ユーザーの登録・common_user_id同期が進んだ後に「全件再解決を試行」で再処理できます。
        </p>
        {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}
        {status === "ready" && unresolvedMerges.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">未解決の統合イベントはありません。</p>
        )}
        {status === "ready" && unresolvedMerges.length > 0 && (
          <div className="space-y-2">
            {unresolvedMerges.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
              >
                <p>
                  source: {m.source_common_user_id} → target: {m.target_common_user_id} —{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{REASON_LABEL[m.reason] ?? m.reason}</span>
                </p>
                <p>
                  試行回数: {m.attempt_count} / 更新: {new Date(m.updated_at).toLocaleString("ja-JP")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">購入イベント外部送信(未送信・失敗)</h2>
          <button
            onClick={handleDrainOutbox}
            disabled={busyId === "drain-outbox" || outboxEvents.length === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            全件再送を試行
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          紹介confirm(sengoku-ai.com宛)・区画購入LINE通知のうち、未送信または送信失敗のイベントです。「全件再送を試行」で再送できます。
        </p>
        {status === "loading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && <p className="text-sm text-red-700 dark:text-red-400">読み込みに失敗しました。</p>}
        {status === "ready" && outboxEvents.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">未送信・失敗のイベントはありません。</p>
        )}
        {status === "ready" && outboxEvents.length > 0 && (
          <div className="space-y-2">
            {outboxEvents.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
              >
                <p>
                  [{e.table === "integration_outbox_events" ? "外部連携" : "通知"}] {e.event_type} —{" "}
                  {e.source_type}:{e.source_id} —{" "}
                  <span className={e.status === "failed" ? "font-semibold text-red-700 dark:text-red-400" : "font-semibold text-amber-700 dark:text-amber-400"}>
                    {e.status === "failed" ? "送信失敗" : "未送信"}
                  </span>
                </p>
                {e.last_error && <p>直近エラー: {e.last_error}</p>}
                <p>
                  試行回数: {e.attempt_count} / 登録: {new Date(e.created_at).toLocaleString("ja-JP")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
