// 「はじまりの旅」PR5-a。冪等性キーの生成(指示書§5.3)。
//
// 固定ルール: 付与のキーは completion_event_id から決定論的に生成し、再送のたびに
// 新しい値へ変更しない。ランダム値・タイムスタンプを含めない。
//
// completion_event_id は unique (enrollment_id, mission_id) に紐づくため、
// 1利用者1ミッションにつき常に同じキーになる。

const GRANT_PREFIX = "learning_journey_reward";
const REVERSAL_PREFIX = "learning_journey_reversal";

export function buildRewardIdempotencyKey(completionEventId: string): string {
  return `${GRANT_PREFIX}:${completionEventId}`;
}

// 取消は「元付与ID＋取消理由の承認レコード」から別キーを生成する(指示書§5.3)。
//
// 付与キーとは別の名前空間にする。同じ付与に対する2回目の取消申請は approval_id が
// 変わるため別キーになるが、元取引の二重取消はWalletの冪等性ではなく、Passport側の
// 状態機械(SUCCEEDEDからのみREVERSEDへ)で防ぐ。
export function buildReversalIdempotencyKey(rewardRequestId: string, approvalId: string): string {
  return `${REVERSAL_PREFIX}:${rewardRequestId}:${approvalId}`;
}

// 付与キーと取消キーが衝突しないことを、呼び出し側からも確認できるようにしておく。
export function isGrantIdempotencyKey(key: string): boolean {
  return key.startsWith(`${GRANT_PREFIX}:`);
}

export function isReversalIdempotencyKey(key: string): boolean {
  return key.startsWith(`${REVERSAL_PREFIX}:`);
}
