import { describe, expect, it } from "vitest";
import { describeMigrationDrift, detectMigrationDrift, hasMigrationDrift } from "./migration-drift";

describe("detectMigrationDrift", () => {
  it("すべて適用済みならずれなし", () => {
    const drift = detectMigrationDrift(["001", "002"], ["001", "002"]);
    expect(drift).toEqual({ missing: [], unexpected: [] });
    expect(hasMigrationDrift(drift)).toBe(false);
  });

  // 実際に起きた事故: 20260814000001 だけが飛ばされ、20260815000001 は適用されていた。
  it("途中の1本だけが飛ばされていても検知する", () => {
    const drift = detectMigrationDrift(["001", "002", "003"], ["001", "003"]);
    expect(drift.missing).toEqual(["002"]);
    expect(hasMigrationDrift(drift)).toBe(true);
  });

  it("末尾が未適用なら検知する", () => {
    expect(detectMigrationDrift(["001", "002"], ["001"]).missing).toEqual(["002"]);
  });

  it("DBにしか無いversionは unexpected として出す", () => {
    const drift = detectMigrationDrift(["001"], ["001", "999"]);
    expect(drift).toEqual({ missing: [], unexpected: ["999"] });
    expect(hasMigrationDrift(drift)).toBe(true);
  });

  it("両方向のずれを同時に出せる", () => {
    const drift = detectMigrationDrift(["001", "002"], ["001", "999"]);
    expect(drift).toEqual({ missing: ["002"], unexpected: ["999"] });
  });

  it("順序が違っていてもずれとは扱わない", () => {
    expect(detectMigrationDrift(["001", "002"], ["002", "001"])).toEqual({ missing: [], unexpected: [] });
  });

  it("結果は昇順に並べる", () => {
    expect(detectMigrationDrift(["003", "001", "002"], []).missing).toEqual(["001", "002", "003"]);
  });

  // DBが空(新規環境)なら全件が未適用。これは正しい検知結果。
  it("適用済みが0件なら全件を未適用として返す", () => {
    expect(detectMigrationDrift(["001", "002"], []).missing).toEqual(["001", "002"]);
  });

  it("期待する一覧が空なら何も出さない", () => {
    expect(detectMigrationDrift([], ["001"])).toEqual({ missing: [], unexpected: ["001"] });
  });
});

describe("describeMigrationDrift", () => {
  it("ずれが無ければ何も出さない", () => {
    expect(describeMigrationDrift({ missing: [], unexpected: [] })).toEqual([]);
  });

  it("未適用の件数とversionを文言に含める", () => {
    const [message] = describeMigrationDrift({ missing: ["20260814000001"], unexpected: [] });
    expect(message).toContain("1件");
    expect(message).toContain("20260814000001");
    // 次に何をすればよいかまで書く。
    expect(message).toContain("schema_migrations");
  });

  it("コードが先行している危険を明示する", () => {
    const [message] = describeMigrationDrift({ missing: ["001"], unexpected: [] });
    expect(message).toContain("エラーになっている可能性");
  });

  it("両方向のずれを別々の文言で出す", () => {
    expect(describeMigrationDrift({ missing: ["001"], unexpected: ["999"] })).toHaveLength(2);
  });
});
