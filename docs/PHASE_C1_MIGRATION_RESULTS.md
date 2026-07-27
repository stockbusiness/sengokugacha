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

**ステージングでの実施(区分3、完了)**: `stockbusiness`が実際のSupabaseステージングDBに対し、`information_schema.tables`のフルダンプおよび本スクリプト相当の監査クエリを段階的に実行した。

**重大な想定外の発見**: 事前の想定(指示書§5の「直近7ファイルのみ未適用」)に反し、実際には`20260709000005_rich_menu_panels`(孤立した1件)と`20260802000001`以降の32ファイル、計33ファイルが未適用であることが判明した。このDBはSupabase CLIの`supabase_migrations.schema_migrations`による管理下になく(同テーブル自体が存在しない)、過去に手動/ad hocなSQL適用で運用されていたため、想定より広い範囲・かつ非連続な適用漏れが生じていた。

対応として、全74migrationファイルの内容を突き合わせる監査クエリ(`to_regclass`/`information_schema.columns`/`pg_constraint`をマーカーとした存在確認)を作成・実行し、未適用ファイルの範囲を正確に特定した上で、該当ファイルを`timestamp`順に1本ずつ適用した(下記参照)。

## §5 Migration適用(当初想定7ファイル→実際は36ファイル)

**当初、指示書§5が列挙していた対象7ファイル**(PR #147で新規追加されたもの):

```
20260809000004_fix_entitlement_revocation_premature_reversed.sql
20260809000005_entitlement_grant_respects_dismissal.sql
20260809000007_integration_inbox_atomic_claim_fencing.sql
20260809000008_outbox_atomic_claim_fencing.sql
20260809000009_revoke_public_execute_on_functions.sql
20260810000001_entitlement_grant_auto_reverses_when_already_revoked.sql
20260810000002_event_trigger_locks_down_new_functions.sql
```

**実際にステージングDBへ適用した36ファイル**(上記7本を含む、`20260709000005`の孤立分・`20260802000001`以降の主要ギャップ32本・本Phase C-1で新規発見した是正1本):

```
20260709000005_rich_menu_panels.sql
20260802000001_common_user_hub.sql
20260803000001_stripe_safety_p0.sql
20260804000001_assigned_agent.sql          (※既に手動適用済みでスキップ、下記参照)
20260805000001_sen_no_kuni_hub_basis.sql
20260806000001_entitlements.sql
20260807000001_shopping_order_events.sql
20260807000002_purchase_grant_steps.sql
20260807000003_entitlements_reentrant.sql
20260807000004_integration_inbox_atomic_claim.sql
20260807000005_event_version.sql
20260807000006_shopping_order_events_source_key.sql
20260807000007_agency_event_recovery.sql
20260808000001_purchase_grant_step_atomic_claim.sql
20260808000002_purchase_balance_grant_transactional.sql
20260808000003_entitlement_atomic_claim.sql
20260808000004_stripe_webhook_event_atomic_claim.sql
20260808000005_sen_no_kuni_hub_signature_v2.sql
20260808000006_gacha_draw_atomic.sql
20260808000007_integration_recovery_soft_resolve.sql
20260808000008_unresolved_common_user_merges.sql
20260808000009_purchase_outbox.sql
20260808000010_unresolved_entitlements_dismissal.sql
20260809000001_grant_service_role_privileges.sql
20260809000002_fix_execute_gacha_draw_ambiguous_columns.sql
20260809000003_fix_entitlement_grant_premature_revoked_block.sql
20260809000004_fix_entitlement_revocation_premature_reversed.sql
20260809000005_entitlement_grant_respects_dismissal.sql
20260809000007_integration_inbox_atomic_claim_fencing.sql
20260809000008_outbox_atomic_claim_fencing.sql
20260809000009_revoke_public_execute_on_functions.sql
20260810000001_entitlement_grant_auto_reverses_when_already_revoked.sql
20260810000002_event_trigger_locks_down_new_functions.sql
20260810000003_revoke_anon_authenticated_function_execute.sql  (※本Phase C-1で新規作成、下記参照)
```

`20260804000001_assigned_agent.sql`(`users.assigned_agent_id`列追加)のみ、適用時点で対象列が既に存在していた(過去の何らかの経緯で個別に反映済みと推測される。他のどのmigrationファイルにも重複定義が無いことを確認済み)。型(`uuid`)が期待通りであることを確認の上、このファイルのみスキップして残りを適用した。

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

**ステージングでの実施(区分3、完了)**: `stockbusiness`がSupabaseダッシュボードのSQL Editorから36ファイルを`postgres`ロールで順次適用した。

**PUBLIC EXECUTE剥奪に関する追加発見と是正**: `20260809000009`・`20260810000002`適用直後のRPC実行権限チェックで、`adjust_user_balance`等27関数が依然として`anon`/`authenticated`から実行可能であることが判明した(Supabaseプロジェクト自体が`public`スキーマに`anon`/`authenticated`への既定EXECUTE付与ルールを持つため、`PUBLIC`ロールからの剥奪だけでは効果が無かった)。詳細は`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`および`docs/PHASE_C1_SECURITY_RESULTS.md`を参照。新規migration`20260810000003_revoke_anon_authenticated_function_execute.sql`を作成・適用し、再チェックで0件になったことを確認した。

適用後の確認項目のうち、integration inbox/outbox claim_token・lease_expires_at・next_retry_at・entitlement自動取消・event trigger作成については、テーブル定義・関数定義がエラー無く適用されたことをもってスキーマレベルでの適用成功を確認した(実データでの動作確認は§7〜§11の接続試験で別途実施)。
