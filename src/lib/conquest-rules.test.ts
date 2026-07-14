import { describe, expect, it } from "vitest";
import { isConquestSatisfied } from "@/lib/conquest-rules";

describe("isConquestSatisfied", () => {
  it("全ての必須武将を所持していればtrue", () => {
    expect(isConquestSatisfied(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("所持数が多くても必須武将を全部満たしていればtrue", () => {
    expect(isConquestSatisfied(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("必須武将が1つでも欠けていればfalse", () => {
    expect(isConquestSatisfied(["a", "b", "c"], ["a", "b"])).toBe(false);
  });

  it("何も所持していなければfalse", () => {
    expect(isConquestSatisfied(["a", "b"], [])).toBe(false);
  });

  it("必須武将が0件(条件未設定)なら常にfalse", () => {
    expect(isConquestSatisfied([], ["a", "b"])).toBe(false);
  });
});
