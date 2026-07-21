# 千ノ国パスポート P0-2 実装履歴

`SEN_NO_KUNI_PASSPORT_P0_2_INSTRUCTIONS.md`(全体統合対応PR1-8実装への技術的な指摘を含む改修指示書)を受けて実施した、PR単位の実装履歴。各PRは独立してマージされ、それぞれ`tsc`/`lint`/`vitest`/`build`の検証を通過している。

## PR一覧

| PR | タイトル | 主な変更ファイル | 対応バグ/項目 |
|---|---|---|---|
| PR-A(#106) | 購入権利付与のステップ冪等化+再実行排他制御 | `src/lib/purchase-grants.ts`、`src/app/api/admin/purchases/[id]/retry-grant/route.ts`、`src/app/api/stripe/webhook/route.ts` | バグ#1、#2 |
| PR-B(#107) | entitlements再入可能な状態管理+順序逆転対応 | `src/lib/entitlements.ts`、`src/app/api/integrations/sen-no-kuni-hub/route.ts` | バグ#3、#4、#6(一部) |
| PR-C(#108) | integration_inbox_eventsの原子的claim | `src/lib/integration-inbox.ts` | バグ#5 |
| PR-D(#109) | X-Event-Version検証+Idempotency-Key/event_id不一致チェック | `src/app/api/integrations/sen-no-kuni-hub/route.ts`、`src/lib/integration-inbox.ts` | バグ#7、#6(仕上げ) |
| PR-E(#110) | shopping_order_events複合unique化+nonceクリーンアップ | `src/lib/shopping-order-events.ts`、新規管理API | §6.1、§6.4 |
| PR-F(#111) | common_user.merged競合永続化+assigned_agent再解決基盤 | `src/lib/agency-events.ts`、新規管理API | §4.6相当 |
| PR-G(本PR) | 純粋関数テスト追加+完了報告4文書作成 | `src/lib/agency-events.test.ts`、`src/lib/integration-inbox.test.ts`、`docs/*_P0_2.md` | §11(一部) |

## マイグレーション一覧

| ファイル | 対応PR | 内容 |
|---|---|---|
| `20260807000002_purchase_grant_steps.sql` | PR-A | `purchase_grant_steps`新設、`purchases.grant_status`にprocessing/retrying追加、`agent_sales.purchase_id`+部分unique index |
| `20260807000003_entitlements_reentrant.sql` | PR-B | `entitlements`のunique制約を`(source_system_key, entitlement_id)`に変更、`application_status`/`reversal_status`系列追加、`entitlement_pending_revocations`新設 |
| `20260807000004_integration_inbox_atomic_claim.sql` | PR-C | `integration_inbox_events.claimed_at`追加、`claim_integration_inbox_event()` Postgres関数新設 |
| `20260807000005_event_version.sql` | PR-D | `integration_inbox_events.event_version`追加、`claim_integration_inbox_event()`のシグネチャ変更 |
| `20260807000006_shopping_order_events_source_key.sql` | PR-E | `shopping_order_events`へ`source_system_key`/`event_version`追加、unique制約変更、`cleanup_expired_sen_no_kuni_hub_nonces()`新設 |
| `20260807000007_agency_event_recovery.sql` | PR-F | `common_user_merge_conflicts`・`unresolved_agent_assignments`新設 |

## 実装方針の一貫性

全PRを通じて以下の既存コードベース規約を踏襲した。

- **原子的guard-clause update**: `UPDATE ... WHERE <条件> RETURNING id`で「1リクエストだけが処理を進められる」ことを保証するパターン(PR-Aの権利付与再実行排他制御、PR-Cの原子的claim)。
- **fail-open/fail-safe設計**: 新規の外部連携は、未設定・未接続時は無害(no-op)に振る舞う。既存のLINEログイン・ガチャ・国取り・Stripe購入・代理店連携(sengoku-ai.com)には一切変更を加えていない。
- **delete-on-consumeパターン**: 「行が存在する=未解決」「行が無い=解決済み」という設計(PR-Bの`entitlement_pending_revocations`、PR-Fの`unresolved_agent_assignments`)。
- **動的SQL/`EXECUTE`不使用**: 全てのPostgres関数は対象カラムを`IF`/分岐で明示的に列挙し、SQLインジェクションリスクを避けている。
- **正式なdownマイグレーション機構が無い**: 既存の全マイグレーションと同様、ロールバックは`ROLLBACK_P0_2.md`記載の手動手順による。
