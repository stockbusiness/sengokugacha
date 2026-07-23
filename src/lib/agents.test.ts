import { describe, expect, it } from "vitest";
import { flattenHierarchy, resolveRank, type HierarchyNode } from "./agents";

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

describe("flattenHierarchy", () => {
  it("flattens a nested tree into a parent-first list with resolved parent_external_id", () => {
    const tree: HierarchyNode[] = [
      {
        external_id: "A",
        name: "Agent A",
        children: [{ external_id: "B", name: "Agent B", children: [{ external_id: "C", name: "Agent C" }] }],
      },
    ];

    const flat = flattenHierarchy(tree);
    expect(flat.map((n) => n.external_id)).toEqual(["A", "B", "C"]);
    expect(flat.find((n) => n.external_id === "B")?.parent_external_id).toBe("A");
    expect(flat.find((n) => n.external_id === "C")?.parent_external_id).toBe("B");
  });

  it("skips nodes without an external_id or agent_code", () => {
    const tree: HierarchyNode[] = [{ name: "no id" }, { external_id: "A", name: "Agent A" }];
    expect(flattenHierarchy(tree).map((n) => n.external_id)).toEqual(["A"]);
  });

  it("falls back to agent_code and parent_code when external_id/parent_external_id are absent", () => {
    const tree: HierarchyNode[] = [{ agent_code: "AGT1", parent_code: "AGT0" }];
    const flat = flattenHierarchy(tree);
    expect(flat[0].external_id).toBe("AGT1");
    expect(flat[0].parent_external_id).toBe("AGT0");
  });
});
