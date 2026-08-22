// 「はじまりの旅」PR5-a。付与要求を作るかどうかの判定。
//
// 2026-08-22のご指示により、付与機能OFF時は learning_journey_reward_requests へ
// 付与要求を作らない。判定結果だけを別テーブル(learning_journey_reward_decisions)へ残す。
//
// これは指示書 禁止2「付与OFF期間の完了を無条件にPENDINGへ溜め、後日すべて自動送信して
// はいけない」への対応でもある。そもそもPENDINGを作らなければ、後日一括送信という
// 事故が起きない。

export type RewardDecisionKind =
  // 付与要求を作る。
  | "REQUESTED"
  // 完了時点で付与制度が無効。
  | "REWARD_DISABLED"
  // 対象者・予算・付与方針が未決定。
  | "DEFERRED_DECISION"
  // 付与対象外のミッション(金額0等)。
  | "NOT_ELIGIBLE";

export type RewardDecision = {
  kind: RewardDecisionKind;
  // 判定時点の金額。後から設定が変わっても、当時いくらと判定したかを追える。
  amount: number;
  reason: string;
};

export type RewardDecisionContext = {
  // learning_journey_settings.rewards_enabled。
  rewardsEnabled: boolean;
  // ミッションに設定された付与額。
  missionRewardAmount: number;
  // 対象者・予算・付与方針が確定しているか。
  //
  // 現時点では常にfalse。旧3,000 OVEの扱い(A-4)と対象者決定が未了のため。
  // 確定したらここをtrueにする運用判断が入る。
  rewardPolicyDecided: boolean;
};

export function decideReward(context: RewardDecisionContext): RewardDecision {
  // 制度が無効なら、金額や方針を見るまでもない。
  if (!context.rewardsEnabled) {
    return {
      kind: "REWARD_DISABLED",
      amount: context.missionRewardAmount,
      reason: "完了時点で付与制度が無効(rewards_enabled=false)",
    };
  }

  if (context.missionRewardAmount <= 0) {
    return {
      kind: "NOT_ELIGIBLE",
      amount: 0,
      reason: "このミッションは付与対象外(付与額が0)",
    };
  }

  // 制度は有効だが、誰にいくら配るかが決まっていない。
  if (!context.rewardPolicyDecided) {
    return {
      kind: "DEFERRED_DECISION",
      amount: context.missionRewardAmount,
      reason: "対象者・予算・付与方針が未決定",
    };
  }

  return {
    kind: "REQUESTED",
    amount: context.missionRewardAmount,
    reason: "付与対象",
  };
}

// 付与要求を作ってよいのは REQUESTED のときだけ。
export function shouldCreateRewardRequest(decision: RewardDecision): boolean {
  return decision.kind === "REQUESTED";
}

// REWARD_DISABLED / DEFERRED_DECISION から PENDING へ変える経路は、このPRでは作らない。
//
// ご指示の6要件(対象者の再判定・予算確認・重複付与確認・管理者の明示承認・操作理由・
// 監査ログ)を満たさない変更経路が先に存在すると、それが抜け道になる。経路を作るのは
// 6要件を同時に実装できる段階(PR5-c以降)。
//
// 「無条件の一括遡及付与は禁止」を、機能の不在によって保証する。
export const DEFERRED_TO_PENDING_REQUIREMENTS = [
  "対象者の再判定",
  "予算確認",
  "重複付与確認",
  "管理者の明示承認",
  "操作理由",
  "監査ログ",
] as const;
