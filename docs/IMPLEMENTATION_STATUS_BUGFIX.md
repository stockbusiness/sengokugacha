# 千ノ国パスポート モジュール化後バグ修正 実装状況

`SEN_NO_KUNI_PASSPORT_POST_MODULARIZATION_BUGFIX_INSTRUCTIONS.md`の提出物。PRごとの実装状況を、以下7区分で報告する。

1. ソースコード上で実装済み
2. unit test確認済み
3. DB統合テスト確認済み
4. 実環境接続確認済み
5. 本番確認済み
6. 未確認
7. 未対応

## 前提: 検証方針(ユーザー確認済み)

本リポジトリにはDB統合テスト基盤が無く(`.env.local`は本番相当のSupabaseプロジェクトを指しており、ローカルPostgresqlは未構築)、Postgres関数を含む本改修の並行実行安全性を自動テストで実地検証する手段が無い。ユーザーへ確認の上、**コードレビューのみで実装を進める**方針とした(Supabase local環境の構築はPhase B-3として別途判断)。そのため、本書の各項目のうち「3. DB統合テスト確認済み」「4. 実環境接続確認済み」「5. 本番確認済み」は、別途ユーザー側での実施を要する。

## Phase A-1: 購入権利付与の完全冪等化

### PR1: fix: atomically claim purchase grant steps

| 項目 | 状況 |
|---|---|
| §4.3.1 ステップclaim(`claim_purchase_grant_step`/`mark_purchase_grant_step_completed`/`mark_purchase_grant_step_failed`、claim_tokenによるfencing) | 1. ソースコード上で実装済み |
| §4.3.4 手動再実行の排他制御(manager限定・guard-clause update・409・監査ログ) | 実装済み(PR3/P0-2時点で対応済み、本PRでの変更なし) |
| 並行実行時の受入条件(§4.4、同一購入10並列実行で副作用1回等) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |
| §4.3.2 DB内副作用の一体化(残高付与とステップ完了を同一トランザクションにする専用関数) | 7. 未対応(PR2で対応予定) |
| §4.3.3 外部副作用のoutbox化(紹介confirm・通知) | 7. 未対応(PR3で対応予定) |

**実装内容の要約**: `purchase_grant_steps`にclaim_token・lease_expires_at列を追加し、Postgres関数`claim_purchase_grant_step()`でSELECT ... FOR UPDATEによる行ロック+状態遷移判定を原子的に行う。呼び出し元(`src/lib/purchase-grants.ts`の`runStep()`)は返り値のclaim_tokenを保持し、副作用完了後に`mark_purchase_grant_step_completed()`/`mark_purchase_grant_step_failed()`へ渡す。claim_tokenが一致しない更新は無視される(fencing)ため、lease切れ後に別のリクエストへ再claimされた古いworkerが誤って完了・失敗の更新を行うことはない。

**未解決の既知の制約**: 副作用の実行(`fn()`)自体と、その後の`mark_purchase_grant_step_completed()`呼び出しは、依然として2つの別々のDB操作である。副作用が成功した直後、`mark_purchase_grant_step_completed()`が呼ばれる前にプロセスが落ちた場合、そのステップは`processing`のまま残り、lease_expires_at経過後に別のリクエストが再claimして`fn()`を再実行してしまう(=依然として二重実行の可能性が残る)。この残存リスクを解消するには、副作用自体をPostgres関数内に統合し、ステップ完了更新と同一トランザクションにする必要があり、これは§4.3.2としてPR2で対応する(`balance_granted`/`agent_sale_recorded`ステップが対象)。`plot_completed`/`commission_posted`/`notification_sent`/`referral_confirmed`ステップは、それぞれ`src/lib/plot-reservations.ts`/`castle-commissions.ts`/`castle-notifications.ts`/`common-user-hub.ts`のDB操作・外部API呼び出しを含み、PR2/PR3で個別に検討する。
