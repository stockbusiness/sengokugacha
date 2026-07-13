import { describe, expect, it } from "vitest";
import { meetsMinimumRank } from "./agent-rank";

describe("meetsMinimumRank", () => {
  it("returns true when rank is exactly the minimum", () => {
    expect(meetsMinimumRank("アドバイザー", "アドバイザー")).toBe(true);
  });

  it("returns true when rank is above the minimum", () => {
    expect(meetsMinimumRank("エージェント", "アドバイザー")).toBe(true);
    expect(meetsMinimumRank("ディレクター", "アドバイザー")).toBe(true);
  });

  it("returns false when rank is below the minimum", () => {
    expect(meetsMinimumRank("代理店候補", "アドバイザー")).toBe(false);
  });

  it("returns false for unknown ranks", () => {
    expect(meetsMinimumRank("不明", "アドバイザー")).toBe(false);
    expect(meetsMinimumRank("アドバイザー", "不明")).toBe(false);
  });
});
