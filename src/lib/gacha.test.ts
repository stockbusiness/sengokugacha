import { afterEach, describe, expect, it, vi } from "vitest";
import { calcContributionPoints, didJustUnlockMino, isEventWindowActive, pickSlot, type ProvinceRow } from "./gacha";
import type { GachaRateTier } from "./gacha-rate-tiers";

const TIERS: GachaRateTier[] = [{ id: "1", tier_order: 1, max_conquered_count: null, rare_rate: 0.1, mid_rate: 0.3 }];

describe("pickSlot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns rare when the roll falls under the rare threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    expect(pickSlot(0, TIERS)).toBe("rare");
  });

  it("returns mid when the roll falls between rare and rare+mid", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    expect(pickSlot(0, TIERS)).toBe("mid");
  });

  it("returns common when the roll is above rare+mid", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(pickSlot(0, TIERS)).toBe("common");
  });
});

describe("isEventWindowActive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active when both bounds are unset", () => {
    expect(isEventWindowActive(null, null)).toBe(true);
  });

  it("is inactive before the start time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(isEventWindowActive("2026-01-02T00:00:00Z", null)).toBe(false);
  });

  it("is inactive after the end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));
    expect(isEventWindowActive(null, "2026-01-02T00:00:00Z")).toBe(false);
  });

  it("is active within the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(isEventWindowActive("2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z")).toBe(true);
  });
});

describe("didJustUnlockMino", () => {
  const provincesWithMino: ProvinceRow[] = [
    { id: "mino", region: "中部", is_final_province: true, unlock_condition_count: 55 },
    { id: "other", region: "中部", is_final_province: false, unlock_condition_count: null },
  ];

  it("returns true when the new count first reaches the threshold", () => {
    expect(didJustUnlockMino(54, 55, provincesWithMino)).toBe(true);
  });

  it("returns false when already past the threshold before this draw", () => {
    expect(didJustUnlockMino(55, 56, provincesWithMino)).toBe(false);
  });

  it("returns false when still below the threshold", () => {
    expect(didJustUnlockMino(10, 11, provincesWithMino)).toBe(false);
  });

  it("returns false when no final province is configured", () => {
    const provincesWithoutMino: ProvinceRow[] = [{ id: "other", region: "中部", is_final_province: false, unlock_condition_count: null }];
    expect(didJustUnlockMino(54, 55, provincesWithoutMino)).toBe(false);
  });
});

describe("calcContributionPoints", () => {
  it("returns the base points for the slot type", () => {
    expect(calcContributionPoints("common", false)).toBe(5);
    expect(calcContributionPoints("mid", false)).toBe(15);
    expect(calcContributionPoints("rare", false)).toBe(40);
  });

  it("adds the new-card bonus when applicable", () => {
    expect(calcContributionPoints("common", true)).toBe(15);
    expect(calcContributionPoints("rare", true)).toBe(50);
  });

  it("returns just the new-card bonus for an unknown slot type", () => {
    expect(calcContributionPoints("unknown", true)).toBe(10);
    expect(calcContributionPoints("unknown", false)).toBe(0);
  });
});
