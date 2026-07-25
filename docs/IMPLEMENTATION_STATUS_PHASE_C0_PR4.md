# 千ノ国パスポート Phase C-0 PR4 実装状況

「千ノ国パスポート Phase C-0 PR4: 受入条件網羅・既存データ相当マイグレーション試験・完了報告指示書」(§2〜§13)の対応状況を、`docs/IMPLEMENTATION_STATUS_BUGFIX.md`と同じ7区分で報告する。

1. ソースコード上で実装済み
2. unit test確認済み
3. DB統合テスト確認済み
4. 実環境接続確認済み
5. 本番確認済み
6. 未確認
7. 未対応

## 前提: 今回の検証方針

開発用サンドボックス環境ではDockerレジストリへのアクセスが制限されており、`supabase start`(Supabase local)を直接起動できない。そのため以下の2系統で検証した。

- **DBを要さない検証**(§7区分の判定基準): `npx tsc --noEmit`・`npm run lint`・対象unit testのローカル実行。
- **DBを要する検証**: (a) このセッションでローカルにpostgresql 16クラスタを一時起動し、全72(§11時点)〜73(§12時点)マイグレーションを空DBへ適用した上でSQL/RPC呼び出しを直接実行して確認(§11・§12)、(b) GitHub Actions上の実際のCI(`migration-test`/`integration-test`/`contract-test`、Supabase local実インスタンス)で全テストを実行し、結果を確認(§3〜§12全体)。(b)はGitHub-hosted runnerでの実行であり、開発用サンドボックスの制限を受けない。

## §3〜§13 対応状況

| § | 内容 | 対応コミット | ステータス | 備考 |
|---|---|---|---|---|
| §3 | Purchase Grant並行性・rollback試験 | `59919fc` | 3. DB統合テスト確認済み | `tests/integration/purchase-balance-grant-concurrency.test.ts`。10並列テスト。CIの`integration-test`で実行・グリーン確認済み |
| §4 | Entitlement revoke 10並列・再送収束試験 | `fc322ff`, `4bea5d3` | 3. DB統合テスト確認済み | テスト設計中に発見した2件のバグ(`process_entitlement_revocation`の早すぎる`reversed`化、`resolution_dismissed_at`未考慮)を`fc322ff`で修正、テストは`4bea5d3`で拡充 |
| §5 | Stripe Webhook Inbox失敗/dead/lease試験 | `7e56165`, `2fb486a` | 3. DB統合テスト確認済み(統合) / 4. 実環境接続確認済み(HTTP) | `tests/integration/stripe-inbox-concurrency.test.ts`(統合)+`tests/contracts/stripe-webhook-purchase-flow.test.ts`(実HTTPリクエスト、Stripe SDKの`generateTestHeaderString()`で実署名生成) |
| §6 | Integration Inbox lease/fencing試験 | `5b07456`, `deddef6` | 3. DB統合テスト確認済み | `claim_integration_inbox_event()`に`claim_token`/`lease_expires_at`を追加。関数オーバーロード曖昧性エラーを`deddef6`で修正 |
| §7 | ガチャrollback・国制覇・日付境界試験 | `831b58e` | 3. DB統合テスト確認済み | `tests/integration/gacha-draw-rollback-and-conquest.test.ts`。美濃国・天下統一/動画演出フェイルセーフは別モジュール・実データ依存のため意図的にスコープ外(下記「スコープ外事項」参照) |
| §8 | Outbox多重drain・resend安全性試験 | `14e2d7b`, `4315321` | 3. DB統合テスト確認済み | 管理画面drainルートにclaim機構が無く二重送信し得るバグを`14e2d7b`で発見・修正、テストは`4315321` |
| §9 | HMAC v1/v2実接続試験 | `3f87c59` | 4. 実環境接続確認済み | `tests/contracts/sen-no-kuni-hub-hmac.test.ts`。実際にHMAC-SHA256署名を計算し、正常系・改ざん・リプレイ・timestamp失効・v1停止・実イベント処理まで実HTTPで確認 |
| §10 | API Contract正常系 | `b92744e` | 4. 実環境接続確認済み | `tests/contracts/admin-recovery-endpoints.test.ts`。entitlements/retry-resolve・integration-outbox/drain・agencies(common_user.merged等)の正常系 |
| §11 | 既存データ相当マイグレーション試験 | `495ac51` | 3. DB統合テスト確認済み | `tests/migrations/fixtures/pre_phase_c0.sql`+`run-preflight.sh`。ローカルpostgresqlクラスタで実地確認(`docs/MIGRATION_PREFLIGHT_RESULTS.md`参照) |
| §12 | RLS・RPC実行権限追加試験 | `9c41260`, `801d112` | 3. DB統合テスト確認済み | anon INSERT/DELETE・authenticatedロール・service role・重要RPC7関数の実行権限。テストで検出した重大な権限バグを`801d112`で修正(詳細: `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`) |
| §13 | branch protection・CI_PIPELINE.md更新 | `db65412` | 1. ソースコード上で実装済み(ドキュメント更新) / 7. 未対応(branch protection設定自体) | branch protectionの設定変更はGitHubリポジトリの管理者権限操作であり、本セッションのGitHub連携ツールには該当操作を行う手段が無い(`mcp__github__*`ツール一覧に`branch protection`関連のツールが存在しないことを確認済み)。本部管理者による設定が必要 |

## §7区分該当項目

- **§7.4(美濃国・天下統一)・§7.7(動画演出フェイルセーフ)**: `execute_gacha_draw`本体のテスト対象からは意図的に除外していたが、PR #147マージ前最終修正指示§5により、実データ(20260707000002_seed_initial_master_data.sqlが投入する実際の美濃国・織田信長等)を使った`tests/integration/tenka-toitsu.test.ts`(美濃国未解放・最終国制圧・天下統一実績記録)、および`tests/integration/gacha-animation-fetch-failure.test.ts`(`selectAnimationForDraw()`失敗時もガチャ自体は成功しanimationがnullになること)を追加し、この項目は解消済み。
- **branch protectionの実設定**: 上記の通りツール上の制約により未対応。

## 未対応事項(今回のPR4スコープに含めなかったもの)

- branch protectionの実設定変更(§13、要管理者操作。PR #147マージ前最終修正指示§7でも同様に指摘され、`docs/CI_PIPELINE.md`に必要な設定を追記済み)。
- ~~§7.4/§7.7の実データ・実動画URLを使ったE2E的な再現テスト~~ → PR #147マージ前最終修正指示§5で対応済み(上記参照)。
