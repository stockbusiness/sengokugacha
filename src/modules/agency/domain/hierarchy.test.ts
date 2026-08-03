import { describe, expect, it } from "vitest";
import { extractProjectKeys, flattenHierarchy, type HierarchyNode } from "./hierarchy";

// 2026-08-03にsengoku-ai.com開発者から提示された、GET /api/hierarchy.php の
// 現行レスポンス1件分(個人情報はマスク済みの実例)。
const CURRENT_RESPONSE_NODE: HierarchyNode = {
  agency_id: "agent_7_8573",
  code: "agent_7_8573",
  name: "代理店名",
  person_name: "担当者名",
  level: 3,
  role_label: "エージェント",
  parent_agency_id: null,
  parent_code: null,
  status: "active",
  lp_urls: [
    {
      project_id: 1,
      project_key: "sengoku-influencer",
      project_slug: "sengoku-influencer",
      project_name: "戦国インフルエンサー",
      url: "https://sengoku-ai.com/a/agent_7_8573?project=sengoku-influencer",
    },
  ],
  contact: {
    email: "masked@example.com",
    phone: "090****0000",
    line_url: "https://lin.ee/example",
  },
  children: [],
};

describe("flattenHierarchy: 現行レスポンス形式", () => {
  it("codeを外部IDとして取り込む(この対応が無いと1件も同期されない)", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.external_id).toBe("agent_7_8573");
  });

  it("levelを階層レベルとして取り込む", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.role_level).toBe(3);
    expect(row.role_label).toBe("エージェント");
  });

  it("入れ子のcontactから連絡先を取り込む", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.contact_email).toBe("masked@example.com");
    expect(row.phone).toBe("090****0000");
    expect(row.line_url).toBe("https://lin.ee/example");
  });

  it("person_nameを担当者名として取り込む", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.contact_name).toBe("担当者名");
  });

  it("ルート要素のparent_*がnullなら親なしとして扱う", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.parent_external_id).toBeNull();
  });

  it("lp_urlsをそのまま持ち回る", () => {
    const [row] = flattenHierarchy([CURRENT_RESPONSE_NODE]);
    expect(row.lp_urls).toEqual(CURRENT_RESPONSE_NODE.lp_urls);
  });
});

describe("flattenHierarchy: 旧名・別名との互換", () => {
  it("agency_idしか無い場合もそれを外部IDにする", () => {
    expect(flattenHierarchy([{ agency_id: "a1", name: "A" }])[0].external_id).toBe("a1");
  });

  it("external_id / agent_code(旧名)でも取り込める", () => {
    expect(flattenHierarchy([{ external_id: "a1", name: "A" }])[0].external_id).toBe("a1");
    expect(flattenHierarchy([{ agent_code: "a2", name: "A" }])[0].external_id).toBe("a2");
  });

  it("role_level / contact_email(旧名)でも取り込める", () => {
    const [row] = flattenHierarchy([{ code: "a1", name: "A", role_level: 2, contact_email: "x@example.com" }]);
    expect(row.role_level).toBe(2);
    expect(row.contact_email).toBe("x@example.com");
  });

  it("入れ子のcontactが最上位の旧名より優先される", () => {
    const [row] = flattenHierarchy([
      { code: "a1", name: "A", contact: { email: "new@example.com" }, contact_email: "old@example.com" },
    ]);
    expect(row.contact_email).toBe("new@example.com");
  });

  it("agent_code / parent_code(旧名)の組み合わせでも親を解決する", () => {
    const [row] = flattenHierarchy([{ agent_code: "AGT1", parent_code: "AGT0" }]);
    expect(row.external_id).toBe("AGT1");
    expect(row.parent_external_id).toBe("AGT0");
  });

  it("識別子がどれも無いノードは飛ばす", () => {
    expect(flattenHierarchy([{ name: "識別子なし" }, { code: "A", name: "A" }]).map((r) => r.external_id)).toEqual([
      "A",
    ]);
  });

  it("空文字の識別子は未設定として扱う", () => {
    expect(flattenHierarchy([{ code: "", agency_id: "", name: "A" }])).toEqual([]);
  });
});

describe("flattenHierarchy: 階層の平坦化", () => {
  it("親を先に並べ、子のparent_external_idを解決する", () => {
    const rows = flattenHierarchy([
      {
        code: "parent",
        name: "親",
        children: [{ code: "child", name: "子", parent_code: null, children: [{ code: "grand", name: "孫" }] }],
      },
    ]);
    expect(rows.map((r) => r.external_id)).toEqual(["parent", "child", "grand"]);
    expect(rows[1].parent_external_id).toBe("parent");
    expect(rows[2].parent_external_id).toBe("child");
  });

  it("明示されたparent_codeはツリー上の親より優先される", () => {
    const rows = flattenHierarchy([
      { code: "p1", name: "P1", children: [{ code: "c1", name: "C1", parent_code: "other" }] },
    ]);
    expect(rows[1].parent_external_id).toBe("other");
  });

  it("statusが無ければactiveを既定にする", () => {
    expect(flattenHierarchy([{ code: "a1", name: "A" }])[0].status).toBe("active");
  });

  it("nameが無ければ外部IDを名前として使う", () => {
    expect(flattenHierarchy([{ code: "a1" }])[0].name).toBe("a1");
  });
});

describe("extractProjectKeys", () => {
  it("lp_urlsからproject_keyを取り出す", () => {
    expect(extractProjectKeys(CURRENT_RESPONSE_NODE.lp_urls)).toEqual(["sengoku-influencer"]);
  });

  it("project_keyが無ければproject_slug(互換名)を使う", () => {
    expect(extractProjectKeys([{ project_slug: "ai-art-school" }])).toEqual(["ai-art-school"]);
  });

  it("重複を除く", () => {
    expect(extractProjectKeys([{ project_key: "a" }, { project_key: "a" }, { project_key: "b" }])).toEqual(["a", "b"]);
  });

  it("空・未指定は空配列を返す", () => {
    expect(extractProjectKeys(null)).toEqual([]);
    expect(extractProjectKeys([{}])).toEqual([]);
  });
});
