import { describe, expect, it } from "vitest";
import {
  buildReversalIdempotencyKey,
  buildRewardIdempotencyKey,
  isGrantIdempotencyKey,
  isReversalIdempotencyKey,
} from "./reward-idempotency";

describe("buildRewardIdempotencyKey", () => {
  // 固定ルール(指示書§5.3): 再送のたびに新しい値へ変更しない。
  it("同じcompletion_event_idからは常に同じキーになる", () => {
    const a = buildRewardIdempotencyKey("ce-1");
    const b = buildRewardIdempotencyKey("ce-1");
    expect(a).toBe(b);
    expect(a).toBe("learning_journey_reward:ce-1");
  });

  it("completion_event_idが違えばキーも違う", () => {
    expect(buildRewardIdempotencyKey("ce-1")).not.toBe(buildRewardIdempotencyKey("ce-2"));
  });

  // ランダム値やタイムスタンプが混ざっていれば、連続呼び出しで値が変わる。
  it("呼び出しごとに値が変わらない(乱数・時刻を含まない)", () => {
    const keys = new Set(Array.from({ length: 50 }, () => buildRewardIdempotencyKey("ce-1")));
    expect(keys.size).toBe(1);
  });
});

describe("buildReversalIdempotencyKey", () => {
  it("元付与IDと承認IDから決定論的に生成する", () => {
    expect(buildReversalIdempotencyKey("rr-1", "ap-1")).toBe("learning_journey_reversal:rr-1:ap-1");
    expect(buildReversalIdempotencyKey("rr-1", "ap-1")).toBe(buildReversalIdempotencyKey("rr-1", "ap-1"));
  });

  // 2回目の取消申請は承認レコードが変わるため別キーになる。
  it("承認IDが違えば別のキーになる", () => {
    expect(buildReversalIdempotencyKey("rr-1", "ap-1")).not.toBe(buildReversalIdempotencyKey("rr-1", "ap-2"));
  });
});

describe("キーの名前空間", () => {
  // 付与と取消でキーが衝突すると、取消が付与として扱われる等の事故になる。
  it("付与キーと取消キーは衝突しない", () => {
    const grant = buildRewardIdempotencyKey("x");
    const reversal = buildReversalIdempotencyKey("x", "x");
    expect(grant).not.toBe(reversal);
    expect(isGrantIdempotencyKey(grant)).toBe(true);
    expect(isReversalIdempotencyKey(grant)).toBe(false);
    expect(isReversalIdempotencyKey(reversal)).toBe(true);
    expect(isGrantIdempotencyKey(reversal)).toBe(false);
  });

  // 接頭辞が前方一致で紛れないこと(learning_journey_reward と ..._reversal)。
  it("接頭辞が互いの前方一致にならない", () => {
    expect(isGrantIdempotencyKey("learning_journey_reversal:a:b")).toBe(false);
  });
});
