// 付与額の決定と上限判定。DB非依存の純粋関数だけを置く。
//
// 指示書§8.5「付与総量の上限」「上限に達した要求はWalletへ送らず LIMIT_HELD として
// 保留し、通常の自動再実行対象から除外する」に対応する。
//
// 実際の送信は PR5。この層は「いくら付けるか」「送ってよいか」だけを決める。

import type { CompletionSource } from "./mission-rules";

export type MissionRewardConfig = {
  rewardAmount: number;
  // 自己申告のみで完了した場合の付与額。nullならrewardAmountと同じ
  // (指示書§6「他のミッションより低くする、付与対象外にする、外部実績確認後に
  // 差額を追加する等の選択肢から正式決定する」の受け皿)。
  selfReportRewardAmount: number | null;
};

// 自己申告で完了した場合だけ別の額を使う。0は「付与対象外」として有効な設定値であり、
// 未設定(null)とは区別する。
export function resolveRewardAmount(config: MissionRewardConfig, source: CompletionSource): number {
  if (source === "SELF_REPORTED" && config.selfReportRewardAmount !== null) {
    return config.selfReportRewardAmount;
  }
  return config.rewardAmount;
}

export type RewardCaps = {
  perRequestCap: number;
  courseCap: number;
  courseGranted: number;
  periodCap: number;
  periodGranted: number;
};

export type CapDecision =
  | { allowed: true }
  | { allowed: false; reason: "per_request" | "course" | "period"; cap: number; used: number };

// 上限に触れる要求は送信せず LIMIT_HELD にする。触れているのがどの上限かを返すのは、
// 管理画面で「なぜ保留されたか」を出すため。
//
// 「使用済み + 今回の額 > 上限」で判定する(上限ちょうどまでは通す)。
export function checkRewardCaps(amount: number, caps: RewardCaps): CapDecision {
  if (amount > caps.perRequestCap) {
    return { allowed: false, reason: "per_request", cap: caps.perRequestCap, used: 0 };
  }
  if (caps.courseGranted + amount > caps.courseCap) {
    return { allowed: false, reason: "course", cap: caps.courseCap, used: caps.courseGranted };
  }
  if (caps.periodGranted + amount > caps.periodCap) {
    return { allowed: false, reason: "period", cap: caps.periodCap, used: caps.periodGranted };
  }
  return { allowed: true };
}

// ADR-8。ウォレットはこれをリクエストボディのフィールドとして受け取る(ヘッダーではない)。
// 完了イベントIDを基底にすることで、同じミッションを別のコース登録で完了しても衝突しない。
export function buildRewardIdempotencyKey(completionEventId: string): string {
  return `mission_completion:${completionEventId}`;
}

// ============================================================
// 利用者向けの表示
// ============================================================

// 指示書§4.1「付与対象外のミッションでは、獲得予定OVEを誤解なく表示する
// (「0 OVE」と表示して減額されたように見せず、付与対象外である旨を示すか、
// OVE表示自体を出さない)」。
//
// 付与機能そのものがOFFのとき(ウォレット未稼働の実証期間)は、獲得予定を出すと
// 「もらえるはずなのに来ない」という誤解を生むため何も出さない。
export type RewardDisplay =
  | { kind: "hidden" } // 付与機能OFF。金額に触れない
  | { kind: "not_eligible" } // このミッションは付与対象外
  | { kind: "amount"; amount: number };

export function describeRewardDisplay(amount: number, rewardsEnabled: boolean): RewardDisplay {
  if (!rewardsEnabled) return { kind: "hidden" };
  if (amount <= 0) return { kind: "not_eligible" };
  return { kind: "amount", amount };
}

// 指示書§8.3「利用者画面では『ミッション完了』と『OVE付与済み』を別表示し、
// Wallet障害時に再受講を要求しない」。
export type RewardRequestStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "LIMIT_HELD"
  | "CANCELLED"
  | "REVERSED";

const REWARD_STATUS_LABEL: Record<RewardRequestStatus, string> = {
  // 失敗・保留はいずれも利用者から見れば「手続き中」。エラーや失敗と誤認させない(指示書§12)。
  PENDING: "お手続き中",
  PROCESSING: "お手続き中",
  FAILED: "お手続き中",
  LIMIT_HELD: "お手続き中",
  SUCCEEDED: "付与済み",
  CANCELLED: "取り消し済み",
  REVERSED: "取り消し済み",
};

export function describeRewardStatus(status: RewardRequestStatus): string {
  return REWARD_STATUS_LABEL[status];
}
