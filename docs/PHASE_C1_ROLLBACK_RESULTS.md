# 千ノ国パスポート Phase C-1 Rollback試験結果報告(§14)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり

## 既存のロールバック方針(手順書レベル、区分1)

以下3文書で、機能単位のロールバック判断基準・手順を明文化済み:

- `docs/ROLLBACK_PHASE_C0_PR4.md` — 購入・ガチャ不能、残高意図せぬ変化、管理画面復旧操作の誤爆、新規HMAC連携の異常、§12権限修正適用後の正規処理失敗、を検知した場合のロールバック基準。特に`20260809000009_revoke_public_execute_on_functions.sql`(RPC権限剥奪)のロールバック手順を詳述。
- `docs/ROLLBACK_BUGFIX.md` / `docs/ROLLBACK_P0_2.md` — 過去フェーズの同種の方針。

いずれも共通する原則: 「既存の正常な処理経路には触れず、追加した経路だけを無効化・削除できるようにする」。

## 指示書§14の各項目と現状

| 確認項目 | 現状 | 区分 |
|---|---|---|
| applicationコードの前バージョンへ戻せる | Vercelは各デプロイをイミュータブルに保持し、以前のデプロイへの「Instant Rollback」が可能な設計(Vercelの標準機能)。アプリケーションコード側で、旧バージョンに戻したときに新しいDBスキーマ(nullable列追加のみ)と非互換になる変更は無いことをコードレビューで確認済み(PR #147で追加した列はいずれもnullable、既存クエリのSELECT列リストを変更していない) | 1 |
| migration適用後に旧コードが致命的エラーにならない | PR #147の7 migrationはいずれも「列追加(nullable)」「既存関数のcreate or replace(シグネチャ不変)」「新規event trigger」のみで、破壊的変更(列削除・型変更・NOT NULL化)を含まない。旧コードは新しい列の存在を知らないだけで、参照しようとしなければエラーにならない | 1(コードレビューによる確認。実際に「migration適用済み・旧コードデプロイ」の組み合わせを動かした実地確認は未実施) |
| processingデータを確認してから切り戻す | `scripts/production-migration-preflight.sql`(本Phase C-1 §4で拡張)の「10分以上processing」「failed/dead件数」チェックが、切り戻し判断前の現状把握に使える | 2(スクリプト自体はローカルで動作確認済み、実際の切り戻し判断への適用は未実施) |
| event triggerを無効化・再有効化できる | `alter event trigger lock_down_new_public_functions disable;` / `enable;`で制御可能(PostgreSQL標準構文、`20260810000002`のtrigger定義に対して直接実行できることをローカルで確認) | 2 |
| outbox処理中の切り戻し手順 | claim_token/lease_expires_atによるfencing機構(§8/§11で実装済み)により、切り戻し中に別プロセスが同じ行を二重処理することは防止される。切り戻し後に再度アプリを起動すれば、lease切れの行は自動的に再claimされる設計(`tests/integration/outbox-concurrency.test.ts`で確認済みの一般的な再claim動作) | 2 |

## DB migrationのdown処理について

指示書の方針通り、down処理(マイグレーションの取り消しSQL)は用意していない。PR #147の7 migrationはいずれも追加的な変更(列追加・関数置換・trigger追加)であり、forward fix(問題があれば新しいmigrationで修正する)の方が安全という既存方針(`docs/ROLLBACK_PHASE_C0_PR4.md`)を踏襲する。

## ステージングでの実施(区分3、項目3のみ完了)

`stockbusiness`が実際のステージングDBに対し、上記4項目のうち3番目(event triggerの無効化・再有効化)を実施した。

**実施内容と結果**:

1. `alter event trigger lock_down_new_public_functions disable;`でトリガーを無効化
2. 無効化中に新規テスト関数`phase_c1_rollback_test_disabled()`を作成 → `has_function_privilege('anon', ..., 'EXECUTE')`が`true`(=保護されない)ことを確認。これにより、event trigger自体が何らかの理由で無効化された場合の実際のリスクを実データで再現できた
3. `alter event trigger lock_down_new_public_functions enable;`でトリガーを再有効化
4. 再有効化後に新規テスト関数`phase_c1_rollback_test_enabled()`を作成 → 今度は`anon_can_execute = false`・`service_role_can_execute = true`となり、保護が正しく自動復帰することを確認
5. テスト用の2関数は`drop function`で削除済み

**未実施(区分5)**: 上記1・2・4番目(Vercel Instant Rollback演習、processingデータ検出シミュレーション、outbox処理中の切り戻し演習)は、`docs/PHASE_C1_STAGING_TEST_PLAN.md`の実行手順書(1.10)に従い別途`stockbusiness`が実施する。
