import { describe, expect, it } from "vitest";
import {
  DEFERRED_TO_PENDING_REQUIREMENTS,
  decideReward,
  shouldCreateRewardRequest,
  type RewardDecisionContext,
} from "./reward-decision";

const ENABLED_AND_DECIDED: RewardDecisionContext = {
  rewardsEnabled: true,
  missionRewardAmount: 300,
  rewardPolicyDecided: true,
};

describe("decideReward", () => {
  // 禁止2への対応。OFF期間の完了をPENDINGへ溜めないよう、そもそも要求を作らせない。
  it("付与機能OFFなら REWARD_DISABLED", () => {
    const decision = decideReward({ ...ENABLED_AND_DECIDED, rewardsEnabled: false });
    expect(decision.kind).toBe("REWARD_DISABLED");
    expect(shouldCreateRewardRequest(decision)).toBe(false);
  });

  it("付与機能OFFなら、方針が決まっていても要求を作らない", () => {
    const decision = decideReward({
      rewardsEnabled: false,
      missionRewardAmount: 3000,
      rewardPolicyDecided: true,
    });
    expect(decision.kind).toBe("REWARD_DISABLED");
  });

  it("付与額0なら NOT_ELIGIBLE", () => {
    const decision = decideReward({ ...ENABLED_AND_DECIDED, missionRewardAmount: 0 });
    expect(decision.kind).toBe("NOT_ELIGIBLE");
    expect(decision.amount).toBe(0);
    expect(shouldCreateRewardRequest(decision)).toBe(false);
  });

  it("方針未決なら DEFERRED_DECISION", () => {
    const decision = decideReward({ ...ENABLED_AND_DECIDED, rewardPolicyDecided: false });
    expect(decision.kind).toBe("DEFERRED_DECISION");
    expect(shouldCreateRewardRequest(decision)).toBe(false);
  });

  it("有効・対象・方針確定のときだけ REQUESTED", () => {
    const decision = decideReward(ENABLED_AND_DECIDED);
    expect(decision.kind).toBe("REQUESTED");
    expect(decision.amount).toBe(300);
    expect(shouldCreateRewardRequest(decision)).toBe(true);
  });

  // 判定時点の金額を残す。後から設定が変わっても、当時いくらと判定したかを追える。
  it("要求を作らない場合も判定時点の金額を残す", () => {
    const decision = decideReward({ ...ENABLED_AND_DECIDED, rewardsEnabled: false });
    expect(decision.amount).toBe(300);
  });

  it("判定理由が空でない", () => {
    for (const context of [
      { ...ENABLED_AND_DECIDED, rewardsEnabled: false },
      { ...ENABLED_AND_DECIDED, missionRewardAmount: 0 },
      { ...ENABLED_AND_DECIDED, rewardPolicyDecided: false },
      ENABLED_AND_DECIDED,
    ]) {
      expect(decideReward(context).reason.length).toBeGreaterThan(0);
    }
  });

  // 現在の本番設定(rewards_enabled=false 相当)では、必ず要求が作られない。
  it("現状の設定では付与要求が1件も作られない", () => {
    for (const amount of [0, 1, 300, 3000]) {
      const decision = decideReward({
        rewardsEnabled: false,
        missionRewardAmount: amount,
        rewardPolicyDecided: false,
      });
      expect(shouldCreateRewardRequest(decision)).toBe(false);
    }
  });
});

describe("DEFERRED_TO_PENDING_REQUIREMENTS", () => {
  // ご指示の6要件。PENDINGへ変える経路を作る際に、これらを満たす必要がある。
  // このPRでは経路そのものを実装しないため、要件だけを記録として残す。
  it("6要件が揃っている", () => {
    expect(DEFERRED_TO_PENDING_REQUIREMENTS).toEqual([
      "対象者の再判定",
      "予算確認",
      "重複付与確認",
      "管理者の明示承認",
      "操作理由",
      "監査ログ",
    ]);
  });
});
