# 千ノ国パスポート Phase C-0 PR4 実装履歴

PR #147(ブランチ`claude/sengoku-economy-os-j0d2nl`)に含まれる、Phase C-0 PR4指示書§3〜§13対応のコミット履歴。`git log --oneline`の実際の順序通りに記載する(各コミットは実装→ローカル`tsc`/`lint`/対象テスト実行→CI確認のサイクルを経てpushしたもの)。

指示書§2.1の作業原則(テストを先に追加する、テストで見つかったバグは別コミット/別PRで直す、テスト期待値を安易に変えて壊れた挙動へ合わせない)に従い、バグを発見した回はfixコミットとtestコミットを分離している。

| コミット | 種別 | 対応§ | 内容 |
|---|---|---|---|
| `59919fc` | test | §3 | Purchase Grant統合テスト追加(10並列・rollback) |
| `fc322ff` | fix | §4 | テスト設計中に発見したentitlement revoke/grantの2件のバグを修正(`process_entitlement_revocation`の早すぎる`reversed`化、`resolution_dismissed_at`未考慮) |
| `4bea5d3` | test | §4 | Entitlement統合テストを拡充(10並列revoke、再送収束、lease/fencing、attempt上限dead、rollback、dismissed) |
| `7e56165` | test | §5 | Stripe Webhook Inbox追加試験(failed→retryable、dead、lease/fencing) |
| `2fb486a` | fix | (基盤) | contract-testで複数ファイルが並列実行されnext devが競合する不具合を修正(`vitest.contracts.config.ts`に`fileParallelism: false`追加) |
| `5b07456` | fix | §6 | `integration_inbox_events`にclaim_token(fencing)を追加、既存呼び出し元(`route.ts`等)を追随 |
| `deddef6` | fix | §6 | `claim_integration_inbox_event()`の関数オーバーロード曖昧性エラーを修正(`create or replace`前に`drop function if exists`を追加) |
| `831b58e` | test | §7 | ガチャ統合テスト(rollback・国制覇・日付境界・新規カード判定)を追加 |
| `14e2d7b` | fix | §8 | 管理画面drainルートにclaim/fencing機構が無く、2並列drainで同一イベントを二重送信し得るバグを修正 |
| `4315321` | test | §8 | Outbox統合テスト追加(claim/mark原子性・lease/fencing・dead遷移) |
| `3f87c59` | test | §9 | HMAC v1/v2署名の実接続テスト追加 |
| `b92744e` | test | §10 | 管理系復旧APIとcommon_user_hubイベント受信の正常系Contractテスト追加 |
| `495ac51` | test | §11 | 既存データ相当マイグレーション事前確認を追加 |
| `9c41260` | test | §12 | RLS anon INSERT/DELETE・authenticatedロール・service role・重要RPC実行権限テスト追加 |
| `801d112` | fix | §12 | テストで検出した重大なバグ(全カスタム関数がanon/authenticatedからEXECUTE可能)を修正 |
| `db65412` | docs | §13 | `docs/CI_PIPELINE.md`をPhase C-0 PR4の実地確認結果で更新 |

## 追加された主なマイグレーション

| ファイル | 対応§ | 内容 |
|---|---|---|
| `20260809000004_fix_entitlement_revocation_premature_reversed.sql` | §4 | `process_entitlement_revocation()`の早すぎる`reversed`化を修正 |
| `20260809000005_entitlement_grant_respects_dismissal.sql` | §4 | `process_entitlement_grant()`が`resolution_dismissed_at`を考慮するよう修正 |
| `20260809000006_entitlement_rollback_test_helpers.sql` | §4 | rollbackテスト専用のtest-onlyヘルパー関数(本番コードから呼ばれない) |
| `20260809000007_integration_inbox_atomic_claim_fencing.sql` | §6 | `integration_inbox_events`へclaim_token/lease_expires_at追加、claim/mark関数群のfencing対応 |
| `20260809000008_outbox_atomic_claim_fencing.sql` | §8 | `integration_outbox_events`/`notification_outbox_events`へ同様のfencing対応 |
| `20260809000009_revoke_public_execute_on_functions.sql` | §12 | public schema配下の全関数からPUBLICのEXECUTEを剥奪、service_role限定にする |

## 追加された主なテストファイル

- `tests/integration/purchase-balance-grant-concurrency.test.ts`(§3)
- `tests/integration/gacha-draw-rollback-and-conquest.test.ts`(§7、新規)
- `tests/integration/outbox-concurrency.test.ts`(§8、新規)
- `tests/contracts/support/stripe-webhook.ts` / `tests/contracts/stripe-webhook-purchase-flow.test.ts`(§5)
- `tests/contracts/support/sen-no-kuni-hub.ts` / `tests/contracts/sen-no-kuni-hub-hmac.test.ts`(§9、新規)
- `tests/contracts/admin-recovery-endpoints.test.ts`(§10、新規)
- `tests/migrations/fixtures/pre_phase_c0.sql` / `tests/migrations/run-preflight.sh`(§11、新規)
- `tests/integration/rls-policies.test.ts`(§12、既存ファイルを拡充)
- 既存ファイルの拡充: `entitlement-concurrency.test.ts`(§4)、`stripe-inbox-concurrency.test.ts`(§5)、`integration-inbox-concurrency.test.ts`(§6)、`tests/integration/support/env.ts`(§12、`getTestAuthenticatedSupabaseClient()`追加)
