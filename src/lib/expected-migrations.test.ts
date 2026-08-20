import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { EXPECTED_MIGRATION_VERSIONS } from "./expected-migrations";

// EXPECTED_MIGRATION_VERSIONS は実行時の適用漏れ検知の基準になる。
// 実際の supabase/migrations/ とずれると検知が意味を失うため、CIで固定する。
//
// マイグレーションを追加したのにここが落ちた場合は、
// src/lib/expected-migrations.ts へ該当のversionを1行足せばよい
// (エラーメッセージに不足しているversionが出る)。

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

function versionsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.split("_")[0])
    .sort();
}

describe("EXPECTED_MIGRATION_VERSIONS", () => {
  it("マイグレーションが1件は見つかる(空振りしていないことの確認)", () => {
    expect(versionsOnDisk().length).toBeGreaterThan(0);
  });

  it("supabase/migrations/ の内容と完全に一致する", () => {
    const onDisk = versionsOnDisk();
    const listed = [...EXPECTED_MIGRATION_VERSIONS].sort();

    const missingFromList = onDisk.filter((version) => !listed.includes(version));
    const notOnDisk = listed.filter((version) => !onDisk.includes(version));

    expect(
      missingFromList,
      `src/lib/expected-migrations.ts に追加してください: ${missingFromList.join(", ")}`
    ).toEqual([]);
    expect(
      notOnDisk,
      `src/lib/expected-migrations.ts から削除してください(ファイルが存在しません): ${notOnDisk.join(", ")}`
    ).toEqual([]);
  });

  it("versionが重複していない", () => {
    expect(new Set(EXPECTED_MIGRATION_VERSIONS).size).toBe(EXPECTED_MIGRATION_VERSIONS.length);
  });

  it("versionの形式が揃っている(14桁の数字)", () => {
    for (const version of EXPECTED_MIGRATION_VERSIONS) {
      expect(version, `${version} の形式が違います`).toMatch(/^\d{14}$/);
    }
  });

  it("昇順に並んでいる(履歴の見通しのため)", () => {
    expect(EXPECTED_MIGRATION_VERSIONS).toEqual([...EXPECTED_MIGRATION_VERSIONS].sort());
  });
});
