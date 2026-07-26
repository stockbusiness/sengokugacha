# 千ノ国パスポート Phase C-1 Migration結果報告(§4・§5)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり

## §4 Migration preflight

`scripts/production-migration-preflight.sql`に、指示書§4が要求する追加確認を実装した(コミット`fff1b4d`)。

| 確認項目 | 実装 | 区分 |
|---|---|---|
| 重複行 | 既存(achievements/purchase_grant_steps/entitlements/integration_inbox_events/stripe_webhook_events の5組) | 2 |
| orphan FK | `purchase_grant_steps.purchase_id`・`achievements.user_id`・`entitlements.user_id`(解決済みのみ)、および`integration_outbox_events`のsource_type=purchaseに対するソフト参照を追加 | 2 |
| 不正status | 各statusカラムの現在の値分布を出力(CHECK制約で許可値自体は強制済みのため、異常な偏りの目視確認用) | 2 |
| null不整合 | `status='processing'`/`application_status='applying'`/`reversal_status='reversing'`なのに対応するclaim_token/lease_expires_atが未設定の行を検出 | 2 |
| 10分以上processing | テーブルごとに利用可能なタイムスタンプ列(claimed_at/lease_expires_at/created_at)で近似 | 2 |
| failed / dead件数 | 対象9テーブル×status別カウント | 2 |
| RPC実行権限 | `has_function_privilege(anon/authenticated, ..., 'EXECUTE')`が true になる関数を列挙(0件が正常) | 2 |
| migration履歴 | `supabase_migrations.schema_migrations`(Supabase CLI管理DBのみ意味を持つ) | 1(Supabase管理DBが無いローカル検証環境では対象外エラーになることのみ確認) |

**検証方法**: 開発用サンドボックスに一時PostgreSQL 16クラスタを起動し、`supabase/migrations/`の全ファイルを適用した空DBに対して本スクリプトを実行。全クエリが構文エラー無く実行され、重複・orphan・null不整合・10分超processing・failed/dead件数がいずれも0件、RPC実行権限チェックも0件(=anon/authenticatedが実行可能な関数が無い、§12の修正が正しく機能している証跡)であることを確認した。migration履歴クエリのみ、Supabase CLI管理下でない生DBのため`relation does not exist`で失敗したが、`-v ON_ERROR_STOP=1`を付けない通常実行では後続処理を止めずに完了した(実際のSupabaseプロジェクトでは該当スキーマが存在するため問題にならない)。

**ステージングでの実施(未着手)**: `docs/PHASE_C1_STAGING_TEST_PLAN.md`の実行手順書に従い`stockbusiness`が現行環境に対して実行し次第、`psql "$STAGING_DATABASE_URL" -f scripts/production-migration-preflight.sql`を実行し、実データに対する結果を本セクションに追記する。1件でも異常が見つかった場合はmigrationを適用せず報告する(指示書§4の方針通り)。

## §5 Migration適用

対象7ファイル(timestamp順)は以下の通りで、いずれもPR #147で新規追加されたもの:

```
20260809000004_fix_entitlement_revocation_premature_reversed.sql
20260809000005_entitlement_grant_respects_dismissal.sql
20260809000007_integration_inbox_atomic_claim_fencing.sql
20260809000008_outbox_atomic_claim_fencing.sql
20260809000009_revoke_public_execute_on_functions.sql
20260810000001_entitlement_grant_auto_reverses_when_already_revoked.sql
20260810000002_event_trigger_locks_down_new_functions.sql
```

**local確認済み(区分2)**: `tests/migrations/run-upgrade-test.sh`(PR #147 §3で作成)が、まさにこの「既存DB(f76b373時点の67マイグレーション適用済み)へ、この7ファイルだけを追加適用する」経路そのものを検証している。開発用サンドボックスの一時PostgreSQL 16クラスタで実行し、以下を確認済み:

- 適用前後で行数・status列の内容(md5チェックサム)が変化しないこと
- 新規nullable列(claim_token/lease_expires_at/next_retry_at)が既存行でNULLのまま補完されること
- 新しいcheck制約値(outbox の'dead'/'processing')が実際にinsert可能なこと
- 外部キー整合性・重複が引き続き0件であること
- **既存データ(revoke先行で不整合のまま放置されていたentitlement)に対して、アップグレード後のprocess_entitlement_grant()を実際に呼び出し、1回のgrant呼び出しで`claimed_then_reversed`に自動収束し、残高が変化しないこと**(§1の自動収束ロジックの実データ確認)

**適用後の確認項目(指示書§5)と対応する既存テスト**:

| 確認項目 | 対応するテスト | 区分 |
|---|---|---|
| integration inbox claim_token | `tests/integration/integration-inbox-concurrency.test.ts` | 2 |
| outbox claim_token | `tests/integration/outbox-concurrency.test.ts` | 2 |
| lease_expires_at | 上記2ファイルのlease切れ再claimテスト | 2 |
| next_retry_at | `tests/integration/outbox-concurrency.test.ts` | 2 |
| entitlement自動取消 | `tests/integration/entitlement-concurrency.test.ts`(§1の5テスト) | 2 |
| PUBLIC EXECUTE剥奪 | `tests/integration/rls-policies.test.ts` | 2 |
| event trigger作成 | `tests/integration/rls-policies.test.ts`(新規関数への自動適用テスト)+ `select * from pg_event_trigger where evtname = 'lock_down_new_public_functions'`を直接確認 | 2 |

**ステージングでの実施(未着手)**: `docs/PHASE_C1_STAGING_TEST_PLAN.md`の実行手順書(1.6)に従い`stockbusiness`が`psql`で7ファイルを`postgres`ユーザーにより順次適用し、上記確認項目を実データに対して再実施する。実施後、本セクションを実測結果で更新する。
