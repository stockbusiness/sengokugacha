import { describe, expect, it } from "vitest";
import { getRegionKokudakaBonus, regionCompleteAchievementType } from "./regions";

describe("regionCompleteAchievementType", () => {
  it("maps known regions to their slug", () => {
    expect(regionCompleteAchievementType("関東")).toBe("region_complete_kanto");
    expect(regionCompleteAchievementType("九州")).toBe("region_complete_kyushu");
  });

  it("falls back to the raw region name for unknown regions", () => {
    expect(regionCompleteAchievementType("未知の地方")).toBe("region_complete_未知の地方");
  });
});

describe("getRegionKokudakaBonus", () => {
  it("scales linearly with the province count", () => {
    expect(getRegionKokudakaBonus(0)).toBe(0);
    expect(getRegionKokudakaBonus(1)).toBe(100);
    expect(getRegionKokudakaBonus(6)).toBe(600);
  });
});
