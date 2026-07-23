// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 5(§8・§15 PR12、commerce)。
// src/app/api/stripe/webhook/route.tsに埋め込まれていたStripe event inbox(冪等性判定)の
// うち、DB非依存の判定部分を抽出。stripe_event_idのunique制約による二重処理防止
// (全体統合対応 実装計画PR1)を、既存のstripe_webhook_events行の状態から判定する。

export type StripeInboxAction =
  | { type: "skip_duplicate" }
  | { type: "process"; attemptCount: number };

export function decideStripeInboxAction(
  existing: { status: string; attempt_count: number | null } | null
): StripeInboxAction {
  if (existing?.status === "succeeded") return { type: "skip_duplicate" };
  return { type: "process", attemptCount: (existing?.attempt_count ?? 0) + 1 };
}
