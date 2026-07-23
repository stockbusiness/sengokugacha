import { afterEach, describe, expect, it, vi } from "vitest";
import { pickSlot } from "./draw-policy";
import type { GachaRateTier } from "./rate-tiers";

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
