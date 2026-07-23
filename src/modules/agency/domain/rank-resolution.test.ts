import { describe, expect, it } from "vitest";
import { resolveRank } from "./rank-resolution";

describe("resolveRank", () => {
  it("prefers a valid role_label over role_level", () => {
    expect(resolveRank(1, "エージェント")).toBe("エージェント");
  });

  it("falls back to role_level when role_label is invalid", () => {
    expect(resolveRank(2, "不明なラベル")).toBe("ディレクター");
    expect(resolveRank(3, null)).toBe("エージェント");
  });

  it("defaults to アドバイザー when neither is resolvable", () => {
    expect(resolveRank(null, null)).toBe("アドバイザー");
    expect(resolveRank(99, undefined)).toBe("アドバイザー");
  });
});
