import { describe, expect, it } from "vitest";
import { pickTierRates, type GachaRateTier } from "./gacha-rate-tiers";

const TIERS: GachaRateTier[] = [
  { id: "1", tier_order: 1, max_conquered_count: 5, rare_rate: 0.15, mid_rate: 0.3 },
  { id: "2", tier_order: 2, max_conquered_count: 15, rare_rate: 0.1, mid_rate: 0.3 },
  { id: "3", tier_order: 3, max_conquered_count: null, rare_rate: 0.015, mid_rate: 0.2 },
];

describe("pickTierRates", () => {
  it("picks the first tier whose upper bound covers the conquered count", () => {
    expect(pickTierRates(TIERS, 0)).toEqual({ rare: 0.15, mid: 0.3 });
    expect(pickTierRates(TIERS, 5)).toEqual({ rare: 0.15, mid: 0.3 });
  });

  it("moves to the next tier just past the previous boundary", () => {
    expect(pickTierRates(TIERS, 6)).toEqual({ rare: 0.1, mid: 0.3 });
    expect(pickTierRates(TIERS, 15)).toEqual({ rare: 0.1, mid: 0.3 });
  });

  it("falls back to the null (catch-all) tier beyond all bounded tiers", () => {
    expect(pickTierRates(TIERS, 16)).toEqual({ rare: 0.015, mid: 0.2 });
    expect(pickTierRates(TIERS, 1000)).toEqual({ rare: 0.015, mid: 0.2 });
  });

  it("falls back to a safe default when given an empty tier list", () => {
    expect(pickTierRates([], 10)).toEqual({ rare: 0.015, mid: 0.2 });
  });
});
