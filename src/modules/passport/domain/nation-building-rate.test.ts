import { describe, expect, it } from "vitest";
import { calcNationBuildingRate } from "./nation-building-rate";

describe("calcNationBuildingRate", () => {
  it("returns 0 when nothing has been achieved and all totals are 0", () => {
    expect(
      calcNationBuildingRate({
        conqueredProvinceCount: 0,
        totalProvinceCount: 0,
        warlordCount: 0,
        totalWarlordCount: 0,
        loginStreak: 0,
        completedMissionCount: 0,
        totalMissionCount: 0,
      })
    ).toBe(0);
  });

  it("returns 100 when every ratio is maxed out", () => {
    expect(
      calcNationBuildingRate({
        conqueredProvinceCount: 10,
        totalProvinceCount: 10,
        warlordCount: 5,
        totalWarlordCount: 5,
        loginStreak: 30,
        completedMissionCount: 3,
        totalMissionCount: 3,
      })
    ).toBe(100);
  });

  it("caps the login streak ratio at 30 days", () => {
    const withCap = calcNationBuildingRate({
      conqueredProvinceCount: 0,
      totalProvinceCount: 0,
      warlordCount: 0,
      totalWarlordCount: 0,
      loginStreak: 30,
      completedMissionCount: 0,
      totalMissionCount: 0,
    });
    const beyondCap = calcNationBuildingRate({
      conqueredProvinceCount: 0,
      totalProvinceCount: 0,
      warlordCount: 0,
      totalWarlordCount: 0,
      loginStreak: 90,
      completedMissionCount: 0,
      totalMissionCount: 0,
    });
    expect(withCap).toBe(beyondCap);
  });

  it("weights province conquest the heaviest (40%)", () => {
    const rate = calcNationBuildingRate({
      conqueredProvinceCount: 1,
      totalProvinceCount: 1,
      warlordCount: 0,
      totalWarlordCount: 0,
      loginStreak: 0,
      completedMissionCount: 0,
      totalMissionCount: 0,
    });
    expect(rate).toBe(40);
  });
});
