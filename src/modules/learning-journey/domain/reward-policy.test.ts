import { describe, expect, it } from "vitest";
import {
  buildRewardIdempotencyKey,
  checkRewardCaps,
  describeRewardDisplay,
  describeRewardStatus,
  resolveRewardAmount,
} from "./reward-policy";

describe("resolveRewardAmount", () => {
  it("通常完了は rewardAmount を使う", () => {
    expect(resolveRewardAmount({ rewardAmount: 1000, selfReportRewardAmount: 300 }, "ANSWERED")).toBe(1000);
  });

  it("自己申告完了は selfReportRewardAmount を使う", () => {
    expect(resolveRewardAmount({ rewardAmount: 1000, selfReportRewardAmount: 300 }, "SELF_REPORTED")).toBe(300);
  });

  it("自己申告用が未設定(null)なら通常の額を使う", () => {
    expect(resolveRewardAmount({ rewardAmount: 1000, selfReportRewardAmount: null }, "SELF_REPORTED")).toBe(1000);
  });

  // 0は「付与対象外」という有効な設定値であり、未設定(null)とは区別する
  // (指示書§6「付与対象外にする」という選択肢を表現できる必要がある)。
  it("自己申告用に0が設定されていれば0を返す(未設定と区別する)", () => {
    expect(resolveRewardAmount({ rewardAmount: 1000, selfReportRewardAmount: 0 }, "SELF_REPORTED")).toBe(0);
  });
});

describe("checkRewardCaps", () => {
  const caps = {
    perRequestCap: 5000,
    courseCap: 100000,
    courseGranted: 0,
    periodCap: 200000,
    periodGranted: 0,
  };

  it("すべての上限内なら許可する", () => {
    expect(checkRewardCaps(1000, caps)).toEqual({ allowed: true });
  });

  it("1リクエスト上限を超えたら拒否する", () => {
    expect(checkRewardCaps(5001, caps)).toEqual({
      allowed: false,
      reason: "per_request",
      cap: 5000,
      used: 0,
    });
  });

  it("1リクエスト上限ちょうどは通す", () => {
    expect(checkRewardCaps(5000, caps)).toEqual({ allowed: true });
  });

  it("コース上限を超えたら拒否する", () => {
    expect(checkRewardCaps(1000, { ...caps, courseGranted: 99_500 })).toEqual({
      allowed: false,
      reason: "course",
      cap: 100_000,
      used: 99_500,
    });
  });

  it("コース上限ちょうどまでは通す", () => {
    expect(checkRewardCaps(500, { ...caps, courseGranted: 99_500 })).toEqual({ allowed: true });
  });

  it("期間上限を超えたら拒否する", () => {
    expect(checkRewardCaps(1000, { ...caps, periodGranted: 199_500 })).toEqual({
      allowed: false,
      reason: "period",
      cap: 200_000,
      used: 199_500,
    });
  });

  // 上限が0(既定値)のままだと1円も付与できない。実証前に必ず設定させるための設計。
  it("上限が0のままなら正の額はすべて拒否する", () => {
    const zero = { perRequestCap: 0, courseCap: 0, courseGranted: 0, periodCap: 0, periodGranted: 0 };
    expect(checkRewardCaps(1, zero)).toMatchObject({ allowed: false, reason: "per_request" });
  });

  it("付与対象外(0円)の要求は上限0でも通る", () => {
    const zero = { perRequestCap: 0, courseCap: 0, courseGranted: 0, periodCap: 0, periodGranted: 0 };
    expect(checkRewardCaps(0, zero)).toEqual({ allowed: true });
  });

  // どの上限に当たったかを管理画面で出せるよう、判定の順序を固定しておく。
  it("複数の上限に当たる場合は1リクエスト上限を先に返す", () => {
    const tight = { perRequestCap: 100, courseCap: 100, courseGranted: 100, periodCap: 100, periodGranted: 100 };
    expect(checkRewardCaps(200, tight)).toMatchObject({ reason: "per_request" });
  });
});

describe("buildRewardIdempotencyKey", () => {
  it("完了イベントIDを基底にする", () => {
    expect(buildRewardIdempotencyKey("11111111-2222-3333-4444-555555555555")).toBe(
      "mission_completion:11111111-2222-3333-4444-555555555555"
    );
  });

  // ウォレット側の idempotency_key は255文字まで。
  it("ウォレットの長さ制限(255)に収まる", () => {
    expect(buildRewardIdempotencyKey("11111111-2222-3333-4444-555555555555").length).toBeLessThanOrEqual(255);
  });
});

// 指示書§4.1「付与対象外のミッションでは、獲得予定OVEを誤解なく表示する
// (「0 OVE」と表示して減額されたように見せない)」。
describe("describeRewardDisplay", () => {
  it("付与機能がOFFなら金額に触れない", () => {
    expect(describeRewardDisplay(1000, false)).toEqual({ kind: "hidden" });
  });

  it("付与対象外は0円ではなく「対象外」として示す", () => {
    expect(describeRewardDisplay(0, true)).toEqual({ kind: "not_eligible" });
  });

  it("付与対象なら金額を出す", () => {
    expect(describeRewardDisplay(1000, true)).toEqual({ kind: "amount", amount: 1000 });
  });
});

// 指示書§8.3「利用者画面では『ミッション完了』と『OVE付与済み』を別表示し、
// Wallet障害時に再受講を要求しない」。§12「OVE付与待ちをエラーや失敗と誤認させない」。
describe("describeRewardStatus", () => {
  it("失敗・保留を利用者にはエラーとして見せない", () => {
    expect(describeRewardStatus("FAILED")).toBe("お手続き中");
    expect(describeRewardStatus("LIMIT_HELD")).toBe("お手続き中");
    expect(describeRewardStatus("PENDING")).toBe("お手続き中");
    expect(describeRewardStatus("PROCESSING")).toBe("お手続き中");
  });

  it("成功と取消は区別して見せる", () => {
    expect(describeRewardStatus("SUCCEEDED")).toBe("付与済み");
    expect(describeRewardStatus("CANCELLED")).toBe("取り消し済み");
    expect(describeRewardStatus("REVERSED")).toBe("取り消し済み");
  });
});
