// 「はじまりの旅」PR5-a。付与要求の状態遷移(指示書§5.2)。
//
// 状態は現行7つのまま。REWARD_DISABLED / DEFERRED_DECISION は送信状態ではないため
// ここには現れない(付与要求が作られる前の判定であり、reward-decision.ts の担当)。

import type { RewardRequestStatus } from "./reward-policy";

export type RewardTransitionEvent =
  // PENDING → PROCESSING。送信権を獲得した。
  | { type: "claimed" }
  // PROCESSING → SUCCEEDED。
  | { type: "wallet_succeeded" }
  // PROCESSING → FAILED。再試行できる一時障害。
  | { type: "wallet_failed_transient" }
  // PROCESSING → FAILED。自動再試行を止める恒久エラー。
  | { type: "wallet_failed_permanent" }
  // PENDING → LIMIT_HELD。外部送信の前に判定する。
  | { type: "limit_exceeded" }
  // LIMIT_HELD → PENDING。管理者が上限保留を解除した。
  | { type: "limit_released" }
  // PENDING / LIMIT_HELD → CANCELLED。未送信の要求を管理者が取消した。
  | { type: "cancelled_by_admin" }
  // SUCCEEDED → REVERSED。Wallet取消が成功した。
  | { type: "reversed" }
  // PROCESSING → PENDING。リース期限切れの回収。
  | { type: "lease_expired" };

export type RewardTransitionResult =
  | { ok: true; next: RewardRequestStatus }
  | { ok: false; reason: string };

// 遷移表。ここに無い組み合わせはすべて拒否する。
const TRANSITIONS: Record<RewardRequestStatus, Partial<Record<RewardTransitionEvent["type"], RewardRequestStatus>>> = {
  PENDING: {
    claimed: "PROCESSING",
    limit_exceeded: "LIMIT_HELD",
    cancelled_by_admin: "CANCELLED",
  },
  PROCESSING: {
    wallet_succeeded: "SUCCEEDED",
    wallet_failed_transient: "FAILED",
    wallet_failed_permanent: "FAILED",
    lease_expired: "PENDING",
  },
  FAILED: {
    // 一時障害からの再試行。バックオフ経過後に再claimされる。
    claimed: "PROCESSING",
    cancelled_by_admin: "CANCELLED",
  },
  LIMIT_HELD: {
    limit_released: "PENDING",
    cancelled_by_admin: "CANCELLED",
  },
  // 終端。SUCCEEDED からは承認済み取消だけが出ていける。
  SUCCEEDED: {
    reversed: "REVERSED",
  },
  CANCELLED: {},
  REVERSED: {},
};

export function transitionReward(
  current: RewardRequestStatus,
  event: RewardTransitionEvent
): RewardTransitionResult {
  const next = TRANSITIONS[current]?.[event.type];
  if (!next) {
    return { ok: false, reason: `${current} から ${event.type} への遷移は許可されていません` };
  }
  return { ok: true, next };
}

// 上限判定は外部送信の前に行う(指示書§2「LIMIT_HELDは外部送信前に判定し、上限保留中の
// 要求をoutboxへ投入しない」)。PENDING からしか LIMIT_HELD へ行けないことを、
// 遷移表とは別にここでも明示しておく。
export function canHoldForLimit(current: RewardRequestStatus): boolean {
  return current === "PENDING";
}

// 外部送信を試みてよい状態か。
export function isDispatchable(current: RewardRequestStatus): boolean {
  return current === "PENDING" || current === "FAILED";
}

// 終端状態。以後どのイベントでも動かない。
export function isTerminal(current: RewardRequestStatus): boolean {
  return current === "CANCELLED" || current === "REVERSED";
}
