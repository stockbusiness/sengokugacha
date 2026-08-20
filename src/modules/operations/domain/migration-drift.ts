// マイグレーションの適用漏れ検知。DB非依存の純粋関数だけを置く。
//
// リポジトリにあるマイグレーションのversion一覧と、DBの
// supabase_migrations.schema_migrations に記録されているversion一覧を突き合わせる。

export type MigrationDrift = {
  // リポジトリにあるがDBに記録されていない = 適用漏れ。最も危険な状態で、
  // コードだけが先に出て「列が無い」というエラーが本番で起きる。
  missing: string[];
  // DBにあるがリポジトリに無い。デプロイがDBより古い(ロールバック直後など)か、
  // 手作業で記録だけを入れた場合に起こる。適用漏れほど危険ではないが、
  // 履歴とコードがずれているサインなので出しておく。
  unexpected: string[];
};

export function detectMigrationDrift(expected: string[], applied: string[]): MigrationDrift {
  const appliedSet = new Set(applied);
  const expectedSet = new Set(expected);

  return {
    missing: expected.filter((version) => !appliedSet.has(version)).sort(),
    unexpected: applied.filter((version) => !expectedSet.has(version)).sort(),
  };
}

export function hasMigrationDrift(drift: MigrationDrift): boolean {
  return drift.missing.length > 0 || drift.unexpected.length > 0;
}

// 管理画面に出す文言。何が起きているのかと、次に何をすればよいかまで書く
// (この画面を見るのは、たいてい何かが壊れて原因を探しているとき)。
export function describeMigrationDrift(drift: MigrationDrift): string[] {
  const messages: string[] = [];

  if (drift.missing.length > 0) {
    messages.push(
      `未適用のマイグレーションが${drift.missing.length}件あります: ${drift.missing.join(", ")}。` +
        `対応するSQLをこのDBへ適用し、supabase_migrations.schema_migrations へ記録してください。` +
        `コードだけが先に出ている状態のため、該当機能がエラーになっている可能性があります。`
    );
  }

  if (drift.unexpected.length > 0) {
    messages.push(
      `このデプロイに存在しないマイグレーションが${drift.unexpected.length}件記録されています: ` +
        `${drift.unexpected.join(", ")}。デプロイがDBより古いか、記録だけが先に入っている可能性があります。`
    );
  }

  return messages;
}
