import { EXPECTED_MIGRATION_VERSIONS } from "@/lib/expected-migrations";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  describeMigrationDrift,
  detectMigrationDrift,
  hasMigrationDrift,
  type MigrationDrift,
} from "@/modules/operations/domain/migration-drift";

// マイグレーションの適用漏れ検知。
//
// このリポジトリは手動適用運用のため、SQLを流し忘れるとコードだけが先に本番へ出て、
// 「列が無い」というエラーが利用者側で起きる。CIの migration-test は毎回まっさらな
// DBへ全件を適用するので、この状態は構造上検知できない。

export type MigrationStatus =
  | {
      // 適用済み一覧を読めた場合。
      available: true;
      expectedCount: number;
      appliedCount: number;
      drift: MigrationDrift;
      hasDrift: boolean;
      messages: string[];
    }
  | {
      // 読めなかった場合。「全件未適用」と誤検知させないため、状態を分けて返す。
      available: false;
      reason: string;
    };

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("applied_migration_versions");

  if (error) {
    return {
      available: false,
      // この関数自体が未適用(20260816000001が未適用)の場合もここに来る。
      reason: `適用済みマイグレーションの一覧を取得できませんでした: ${error.message}`,
    };
  }

  const applied = ((data ?? []) as { version: string }[]).map((row) => row.version);
  const drift = detectMigrationDrift(EXPECTED_MIGRATION_VERSIONS, applied);

  return {
    available: true,
    expectedCount: EXPECTED_MIGRATION_VERSIONS.length,
    appliedCount: applied.length,
    drift,
    hasDrift: hasMigrationDrift(drift),
    messages: describeMigrationDrift(drift),
  };
}
