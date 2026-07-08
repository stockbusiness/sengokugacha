import { describe, expect, it } from "vitest";
import { getStreakBonusDraws } from "./login-streak";

describe("getStreakBonusDraws", () => {
  it("returns 0 for a short streak", () => {
    expect(getStreakBonusDraws(0, 1, 2)).toBe(0);
    expect(getStreakBonusDraws(6, 1, 2)).toBe(0);
  });

  it("returns the 7-day bonus once the threshold is reached", () => {
    expect(getStreakBonusDraws(7, 1, 2)).toBe(1);
    expect(getStreakBonusDraws(29, 1, 2)).toBe(1);
  });

  it("returns the 30-day bonus once the threshold is reached", () => {
    expect(getStreakBonusDraws(30, 1, 2)).toBe(2);
    expect(getStreakBonusDraws(365, 1, 2)).toBe(2);
  });
});
