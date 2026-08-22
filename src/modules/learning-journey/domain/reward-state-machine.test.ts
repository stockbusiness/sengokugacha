import { describe, expect, it } from "vitest";
import {
  canHoldForLimit,
  isDispatchable,
  isTerminal,
  transitionReward,
  type RewardTransitionEvent,
} from "./reward-state-machine";
import type { RewardRequestStatus } from "./reward-policy";

const ALL_STATUSES: RewardRequestStatus[] = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "LIMIT_HELD",
  "CANCELLED",
  "REVERSED",
];

const ALL_EVENTS: RewardTransitionEvent["type"][] = [
  "claimed",
  "wallet_succeeded",
  "wallet_failed_transient",
  "wallet_failed_permanent",
  "limit_exceeded",
  "limit_released",
  "cancelled_by_admin",
  "reversed",
  "lease_expired",
];

// 許可する遷移の全量。これ以外はすべて拒否される。
const ALLOWED: [RewardRequestStatus, RewardTransitionEvent["type"], RewardRequestStatus][] = [
  ["PENDING", "claimed", "PROCESSING"],
  ["PENDING", "limit_exceeded", "LIMIT_HELD"],
  ["PENDING", "cancelled_by_admin", "CANCELLED"],
  ["PROCESSING", "wallet_succeeded", "SUCCEEDED"],
  ["PROCESSING", "wallet_failed_transient", "FAILED"],
  ["PROCESSING", "wallet_failed_permanent", "FAILED"],
  ["PROCESSING", "lease_expired", "PENDING"],
  ["FAILED", "claimed", "PROCESSING"],
  ["FAILED", "cancelled_by_admin", "CANCELLED"],
  ["LIMIT_HELD", "limit_released", "PENDING"],
  ["LIMIT_HELD", "cancelled_by_admin", "CANCELLED"],
  ["SUCCEEDED", "reversed", "REVERSED"],
];

describe("transitionReward", () => {
  it.each(ALLOWED)("%s + %s → %s", (from, event, expected) => {
    const result = transitionReward(from, { type: event } as RewardTransitionEvent);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.next).toBe(expected);
  });

  // 表に無い組み合わせを網羅的に拒否する。許可12件以外の 7×9−12 = 51 通り。
  it("許可されていない遷移をすべて拒否する", () => {
    const allowedKeys = new Set(ALLOWED.map(([from, event]) => `${from}:${event}`));
    const accepted: string[] = [];

    for (const from of ALL_STATUSES) {
      for (const event of ALL_EVENTS) {
        if (allowedKeys.has(`${from}:${event}`)) continue;
        const result = transitionReward(from, { type: event } as RewardTransitionEvent);
        if (result.ok) accepted.push(`${from}:${event}`);
      }
    }

    expect(accepted).toEqual([]);
  });

  it("拒否時は理由に元の状態とイベント名が入る", () => {
    const result = transitionReward("SUCCEEDED", { type: "claimed" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("SUCCEEDED");
    expect(result.ok === false && result.reason).toContain("claimed");
  });

  // 送信済みの取引を、Passport側だけで送信前の状態に戻してはいけない。
  it("SUCCEEDED から PROCESSING へ戻せない", () => {
    expect(transitionReward("SUCCEEDED", { type: "claimed" }).ok).toBe(false);
    expect(transitionReward("SUCCEEDED", { type: "lease_expired" }).ok).toBe(false);
  });

  it("終端状態からはどのイベントでも動かない", () => {
    for (const terminal of ["CANCELLED", "REVERSED"] as const) {
      for (const event of ALL_EVENTS) {
        expect(transitionReward(terminal, { type: event } as RewardTransitionEvent).ok).toBe(false);
      }
    }
  });
});

describe("canHoldForLimit", () => {
  // 指示書§2「LIMIT_HELDは外部送信前に判定し、上限保留中の要求をoutboxへ投入しない」。
  it("PENDING からのみ LIMIT_HELD にできる", () => {
    expect(canHoldForLimit("PENDING")).toBe(true);
    for (const other of ALL_STATUSES.filter((s) => s !== "PENDING")) {
      expect(canHoldForLimit(other), other).toBe(false);
    }
  });

  // PROCESSING を経由してから上限判定すると、外部送信を試みた後になってしまう。
  it("PROCESSING から LIMIT_HELD へは遷移できない", () => {
    expect(transitionReward("PROCESSING", { type: "limit_exceeded" }).ok).toBe(false);
  });
});

describe("isDispatchable / isTerminal", () => {
  it("送信を試みてよいのは PENDING と FAILED だけ", () => {
    expect(isDispatchable("PENDING")).toBe(true);
    expect(isDispatchable("FAILED")).toBe(true);
    for (const other of ["PROCESSING", "SUCCEEDED", "LIMIT_HELD", "CANCELLED", "REVERSED"] as const) {
      expect(isDispatchable(other), other).toBe(false);
    }
  });

  it("終端は CANCELLED と REVERSED", () => {
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("REVERSED")).toBe(true);
    expect(isTerminal("SUCCEEDED")).toBe(false);
  });
});
