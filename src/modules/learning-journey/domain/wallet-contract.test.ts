import { describe, expect, it } from "vitest";
import { classifyHttpStatus, computeRetryDelaySeconds, isRetryable } from "./wallet-contract";

describe("classifyHttpStatus", () => {
  // 指示書§5.4の表をそのまま写す。PR5-bでHTTPアダプタを書くときの根拠になる。
  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "transient"],
    [500, "transient"],
    [502, "transient"],
    [503, "transient"],
    [504, "transient"],
    [400, "permanent"],
    [404, "permanent"],
    [409, "permanent"],
    [422, "permanent"],
  ])("%i → %s", (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected);
  });

  // 認証・権限は 4xx だが、人手対応が要る点で他の4xxと扱いが違う。
  it("401/403 は permanent ではなく auth として分ける", () => {
    expect(classifyHttpStatus(401)).not.toBe("permanent");
    expect(classifyHttpStatus(403)).not.toBe("permanent");
  });

  // 429 は 4xx だが再試行してよい。ここを permanent にすると再送されなくなる。
  it("429 は transient", () => {
    expect(classifyHttpStatus(429)).toBe("transient");
  });
});

describe("isRetryable", () => {
  it("自動再試行するのは transient だけ", () => {
    expect(isRetryable("transient")).toBe(true);
    for (const kind of ["permanent", "auth", "limit"] as const) {
      expect(isRetryable(kind), kind).toBe(false);
    }
  });
});

describe("computeRetryDelaySeconds", () => {
  it("試行回数が増えるほど待ち時間が伸びる", () => {
    const noJitter = () => 0;
    expect(computeRetryDelaySeconds(0, noJitter)).toBe(1);
    expect(computeRetryDelaySeconds(1, noJitter)).toBe(2);
    expect(computeRetryDelaySeconds(2, noJitter)).toBe(4);
    expect(computeRetryDelaySeconds(5, noJitter)).toBe(32);
  });

  // ジッターが無いと、同時に失敗した要求が同じ時刻に再試行してWallet側へ波を作る。
  it("ジッターで値がばらつく", () => {
    expect(computeRetryDelaySeconds(5, () => 0)).toBeLessThan(computeRetryDelaySeconds(5, () => 1));
  });

  it("ジッターを入れても基準値を下回らない", () => {
    for (const r of [0, 0.3, 0.7, 1]) {
      expect(computeRetryDelaySeconds(4, () => r)).toBeGreaterThanOrEqual(16);
    }
  });

  // 上限が無いと、試行回数が伸びたときに現実的でない待ち時間になる。
  it("待ち時間に上限がある", () => {
    expect(computeRetryDelaySeconds(100, () => 0)).toBe(3600);
    expect(computeRetryDelaySeconds(100, () => 1)).toBeLessThanOrEqual(4500);
  });

  it("負の試行回数でも壊れない", () => {
    expect(computeRetryDelaySeconds(-5, () => 0)).toBe(1);
  });
});
