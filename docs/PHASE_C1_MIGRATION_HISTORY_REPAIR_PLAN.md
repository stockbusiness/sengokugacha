# 千ノ国パスポート Migration履歴正規化 計画書(§5.1)

## 現状

ステージングDBには`supabase_migrations`スキーマ自体が存在せず、`supabase_migrations.schema_migrations`(Supabase CLIが`supabase db push`/`supabase migration list`で参照する管理テーブル)が無い。このDBは過去、Supabase CLIを介さず手動/ad hocなSQL適用で運用されてきたためである(Phase C-1で確認済み、`docs/PHASE_C1_MIGRATION_RESULTS.md`参照)。

Phase C-1のフォンリレー作業で、`supabase/migrations/`配下の全76ファイル(2026-07-27時点)を、正確な適用順序でステージングDBへ全て適用済みであることを実測確認済み。**つまり現時点では「ローカルmigrationファイル」と「リモートDBの実オブジェクト」に差分は無い**。欠けているのは、その事実をSupabase CLIが理解できる形(`schema_migrations`テーブル)で記録することだけである。

## 方針

1. **既存オブジェクトを一切変更しない。** `schema_migrations`テーブルの新規作成+行のINSERTのみを行う(既存テーブル・関数・データへのDDL/DMLは含まない)。
2. Supabase CLI標準のテーブル定義を使う。

```sql
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
```

3. `supabase/migrations/`配下の全ファイル名から`version`(先頭14桁のタイムスタンプ)と`name`(タイムスタンプ以降の部分)を抽出し、1ファイル1行としてINSERTする。`statements`列は今回は空(`null`)のままでよい(Supabase CLIは`version`の存在有無で「適用済みか」を判定するため、内容の再現までは必須ではない)。
4. 実行後、`supabase migration list --linked`(Supabase CLIがローカルに導入されている場合)またはSupabase Dashboardの「Database > Migrations」画面で、全ファイルが「Applied」と表示されることを確認する。

## 手順(電話/PCリレー用SQL)

### STEP 1: テーブル作成

```sql
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
```

### STEP 2: 全ファイル分の行をINSERT

実際に貼り付け可能な完全なINSERT文は`docs/PHASE_C1_MIGRATION_HISTORY_REPAIR_RESULTS.md`に用意した(2026-07-27時点で76ファイル分)。

### STEP 3: 検証

```sql
select count(*) from supabase_migrations.schema_migrations;
```

`supabase/migrations/`配下のファイル数と一致することを確認する(2026-07-27時点で76、今後ファイルが増えるたびに増加する)。

## 禁止事項の運用ルール(今後の全メンバー・全ツール向け)

指示書§5.1の「禁止」項目を、今後の標準運用として以下のように明文化する。

1. **本テーブルの`statements`列は当面利用しない**。`version`の有無のみを「適用済みか」の判定に使う設計とする(Supabase CLIの内部実装上、`statements`は`supabase db push`が新規適用時に自動記録する差分であり、手動運用では再現困難なため)。
2. **新しいmigrationファイルを追加したら、必ず同じPRの中で`supabase_migrations.schema_migrations`へのINSERT文もセットで用意する**(このリポジトリがSupabase CLIの`supabase db push`を使わず、SQL Editor経由の手動適用を継続する前提であるため)。
3. **`supabase db push`を、上記の`schema_migrations`初期化が完了する前に実行しない**こと(既存オブジェクトと衝突し、「relation already exists」等で失敗する、または最悪の場合CLIが「未適用」と誤認して同じDDLを再実行しようとする可能性があるため)。
4. **migrationファイルのtimestampを変更しない**、**過去migrationの内容を書き換えない**(指示書§5.1の禁止事項通り)。修正が必要な場合は必ず新しいtimestampの新規ファイルを追加する(既存の全てのmigrationがこの方針を踏襲している)。
5. 本計画の実施(STEP1〜3)は、DB破壊的操作を一切含まないため、`docs/PHASE_C1_STAGING_BACKUP_CONFIRMATION.md`のバックアップ確認と並行して進めてよい。ただし将来的に本番環境で同じ手順を踏む場合は、バックアップ確認完了後に実施すること。
