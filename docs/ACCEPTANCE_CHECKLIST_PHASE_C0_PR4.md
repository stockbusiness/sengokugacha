# 千ノ国パスポート Phase C-0 PR4 受入条件チェックリスト

「千ノ国パスポート Phase C-0 PR4: 受入条件網羅・既存データ相当マイグレーション試験・完了報告指示書」の受入条件(§3〜§14)に対する充足状況の最終チェックリスト。各項目の詳細な根拠は他6文書(`IMPLEMENTATION_STATUS`/`IMPLEMENTATION_HISTORY`/`TEST_RESULTS`/`ROLLBACK`/`MIGRATION_PREFLIGHT_RESULTS`/`SECURITY_FINDINGS`)を参照。

## §2.1 作業原則の遵守

- [x] 既存仕様を変更していない(§4/§6/§8/§12で発見したバグ修正は、いずれも「既存の壊れた挙動」を仕様通りの挙動へ正すものであり、意図された仕様を変更するものではない)
- [x] テストを先に追加した(全§でtest→(必要な場合)fixの順、または既存バグをテスト設計中に発見した場合はfixを別コミットに分離)
- [x] バグ修正を別コミット/別PRで実施した(`fc322ff`/`14e2d7b`/`deddef6`/`801d112`はいずれも対応するtestコミットと分離)
- [x] テスト期待値を安易に変更していない(§4のentitlement再送収束テストは、バグ修正後に「正しく収束する」ことを検証する形で書いており、バグの挙動に合わせて期待値を緩めてはいない)
- [x] 本番Supabaseを使用していない(全テストは`SUPABASE_TEST_URL`がlocalhost/127.0.0.1を指すことを`requireLocalTestUrl()`で強制)
- [x] 並行実行テストは実DB(PostgreSQL)に対して実施した(GitHub Actions上のSupabase local、または開発用サンドボックスの一時PostgreSQLクラスタ)
- [x] 未完了項目を「完了」と偽装していない(branch protection設定・本番接続確認等は本チェックリストおよび各文書で明示的に「未対応」「未確認」と記載)

## §3〜§13 各区分

| § | 内容 | 状態 | 根拠 |
|---|---|---|---|
| §3 | Purchase Grant並行性・rollback | ✅ 完了 | `tests/integration/purchase-balance-grant-concurrency.test.ts`、CI `integration-test`グリーン |
| §4 | Entitlement revoke 10並列・再送収束 | ✅ 完了 | `tests/integration/entitlement-concurrency.test.ts`拡充、バグ2件修正済み |
| §5 | Stripe Webhook Inbox失敗/dead/lease | ✅ 完了 | `stripe-inbox-concurrency.test.ts` + `stripe-webhook-purchase-flow.test.ts`(実HTTP) |
| §6 | Integration Inbox lease/fencing | ✅ 完了 | `claim_integration_inbox_event()`にclaim_token追加、`integration-inbox-concurrency.test.ts`拡充 |
| §7 | ガチャrollback・国制覇・日付境界 | ✅ 完了(§7.4/§7.7はスコープ外、理由を`IMPLEMENTATION_STATUS`に明記) | `gacha-draw-rollback-and-conquest.test.ts` |
| §8 | Outbox多重drain・resend安全性 | ✅ 完了 | drainルートのclaim機構追加、`outbox-concurrency.test.ts` |
| §9 | HMAC v1/v2実接続 | ✅ 完了 | `sen-no-kuni-hub-hmac.test.ts`、実HTTP・実署名で正常系/拒否系を確認 |
| §10 | API Contract正常系 | ✅ 完了 | `admin-recovery-endpoints.test.ts` |
| §11 | 既存データ相当マイグレーション試験 | ✅ 完了 | `run-preflight.sh` + `pre_phase_c0.sql`、`MIGRATION_PREFLIGHT_RESULTS.md` |
| §12 | RLS・RPC実行権限追加試験 | ✅ 完了(重大バグ発見・修正込み) | `rls-policies.test.ts`拡充、`SECURITY_FINDINGS_PHASE_C0_PR4.md` |
| §13 | branch protection・CI_PIPELINE.md更新 | 🟡 一部未対応 | `CI_PIPELINE.md`更新は完了。branch protectionの実設定は管理者権限操作でありツール上不可能(下記参照) |
| §14 | 完了報告7文書 | ✅ 完了 | 本文書を含む7文書(下記一覧) |

## §13 branch protectionについて(要対応事項)

以下のツール調査を行ったが、GitHubリポジトリのbranch protection(Required status checks)を変更する専用ツールは、本セッションで利用可能な`mcp__github__*`ツール群に存在しないことを確認した(`ToolSearch`で"branch protection repository"等のクエリを実行し、該当ツールが無いことを確認済み)。

**本部管理者への依頼事項**: GitHubリポジトリの Settings → Branches → Branch protection rules → `main` で、Required status checksに以下8ジョブ名を設定してください。

```
typecheck
lint
unit-test
architecture-test
build
migration-test
integration-test
contract-test
```

## §14 完了報告7文書一覧

1. `docs/IMPLEMENTATION_STATUS_PHASE_C0_PR4.md` — §3〜§13の対応状況(7区分)
2. `docs/IMPLEMENTATION_HISTORY_PHASE_C0_PR4.md` — コミット単位の実装履歴
3. `docs/TEST_RESULTS_PHASE_C0_PR4.md` — ローカル・CI双方のテスト結果
4. `docs/ROLLBACK_PHASE_C0_PR4.md` — ロールバック手順
5. `docs/MIGRATION_PREFLIGHT_RESULTS.md` — 既存データ相当マイグレーション事前確認結果
6. `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md` — §12で発見・修正したRPC実行権限の脆弱性
7. `docs/ACCEPTANCE_CHECKLIST_PHASE_C0_PR4.md` — 本文書(受入条件チェックリスト)

## 未対応事項の総括(再掲)

- branch protection(Required status checksの8ジョブ+PR必須・up-to-date必須・会話解決必須・force-push禁止・削除禁止の5項目)の実設定変更 — 要管理者操作。PR #147マージ前最終修正指示§7で追加要求された5項目も含め、`docs/CI_PIPELINE.md`に必要な設定を明記済み。
- 本番Supabaseプロジェクトに対する`scripts/production-migration-preflight.sql`の実行、および§12修正の本番適用後の権限確認 — 要本番接続、本セッションでは意図的に未実施。
- 人間レビュアーによる承認(PR #147マージ前最終修正指示§9) — 要管理者操作。レビュアーのアサインは完了、承認自体は未取得。
- ~~§7.4(美濃国・天下統一)・§7.7(動画演出フェイルセーフ)の実データを使ったE2E再現~~ → PR #147マージ前最終修正指示§5で対応済み(`tests/integration/tenka-toitsu.test.ts`・`tests/integration/gacha-animation-fetch-failure.test.ts`、詳細は`IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`参照)。
