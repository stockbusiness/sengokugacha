import { describe, expect, it } from "vitest";
import { calcContributionPoints } from "./rarity";

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
