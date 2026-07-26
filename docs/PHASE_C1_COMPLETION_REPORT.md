# 千ノ国パスポート Phase C-1 完了報告書

対象コミット: `a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージ後の`main`)

## 総括

Phase C-1指示書は、Phase C-0でローカル/CIにより確認した内容を、実際のステージングSupabase・Vercel・外部サービスに対して確認することを目的としている。当初はステージング環境自体が存在しないと判断していたが、ユーザーより「現行のSupabase・Vercel(まだ実稼働していない)をステージングとして使う」との明確な方針を受け、`.env.local`にある実際の接続情報で接続を試みた。

しかし、**このコーディングセッションのネットワークegressプロキシが当該Supabaseホスト(`vutnjxswfamluicsxwwi.supabase.co`)をallowlistしておらず、`403 Forbidden: Host not in allowlist`で接続を拒否される**ことを確認した。さらに、プロキシの仕様上「raw-TCPのデータベース接続」自体がサポート対象外と明記されており、これはallowlistの許可有無に関わらず、migration適用・preflight SQL実行(psql接続)が本セッションからは原理的に実行不可能であることを意味する。この事実はユーザーと共有し、了承のもと以下の方針で進めることとした。

本セッションで実施したのは以下の3点である。

1. `scripts/production-migration-preflight.sql`の拡張(§4の追加確認項目)とローカル使い捨てPostgreSQLでの動作確認
2. 既存テスト資産(`tests/integration/*`・`tests/contracts/*`)と指示書各セクションのマッピング整理・文書化
3. **ネットワーク制約により本セッションから直接実行できない手順(migration履歴取得・preflight実行・migration適用・RPC権限確認・接続試験・rollback試験)について、`stockbusiness`が現行のSupabase/Vercelに対して実行するための詳細な実行手順書**(`docs/PHASE_C1_STAGING_TEST_PLAN.md`1章)

## 提出物一覧(指示書§17)

| 文書 | 内容 |
|---|---|
| `docs/PHASE_C1_STAGING_TEST_PLAN.md` | ステージング環境構築チェックリスト、指示書各セクションと既存資産のマッピング表 |
| `docs/PHASE_C1_MIGRATION_RESULTS.md` | §4(preflight)・§5(migration適用)の結果。preflightスクリプトの拡張内容と、ローカル使い捨てPostgreSQLでの実地確認結果 |
| `docs/PHASE_C1_CONNECTION_RESULTS.md` | §6〜§11・§13(LINEログイン・ガチャ・Stripe・HMAC・Entitlement・Outbox・管理画面)の結果 |
| `docs/PHASE_C1_SECURITY_RESULTS.md` | §12(RPC権限)・§9のHMAC改ざん系の結果 |
| `docs/PHASE_C1_ROLLBACK_RESULTS.md` | §14(Rollback試験)の結果 |
| `docs/PHASE_C1_COMPLETION_REPORT.md` | 本文書 |

## §16 受入条件との対応状況

| 受入条件 | 状況 |
|---|---|
| ステージングmigration成功 | 未対応(このセッションのネットワーク制約により未実行。実行手順書は`docs/PHASE_C1_STAGING_TEST_PLAN.md`1.6に整備済み) |
| 全外部接続成功 | 未対応(同上、1.9に整備済み)。ただしローカル/CIでの契約テスト(HMAC v1/v2・Stripe署名検証)は全て成功済み |
| 二重付与なし | ローカル/CIで確認済み(entitlement 10並列grant、outbox claim fencing等)。ステージング実データでの確認は未対応 |
| 二重取消なし | 同上(entitlement 10並列revoke) |
| ガチャ券消失なし | ローカル/CIで確認済み(gacha並行実行テスト) |
| HMAC改ざん拒否 | ローカル/CIで確認済み(6パターン全て401/409で拒否) |
| anon RPC拒否 | ローカル/CIで確認済み(全関数でfalse)。ステージング実測は未対応 |
| outbox二重業務処理なし | ローカル/CIで確認済み(claim_token fencing、安定Idempotency-Key) |
| rollback手順確認 | 手順書レベルでは整備済み。実機演習は未対応 |
| branch protection設定 | **完了**(PR #147で`main`へ設定済み、`docs/CI_PIPELINE.md`参照) |
| 本番環境を変更していない | **達成**。本セッションは本番Supabase・本番Vercel・本番Stripe・本番HMAC設定のいずれにも一切接続・変更していない |

## §18 本番移行条件について

指示書§18の通り、Phase C-1完了報告が承認されるまで、本番migration・本番Stripe・本番HMAC接続は実行していない。この方針は今後も維持する。

## 次のアクション(要`stockbusiness`対応)

`docs/PHASE_C1_STAGING_TEST_PLAN.md`の1章「ステージング(現行Supabase/Vercel)実行手順書」に従い、`stockbusiness`が現行環境に対して手順1.2〜1.10(migration履歴取得・バックアップ・preflight実行・migration適用・RPC権限確認・Vercelデプロイ確認・接続試験・rollback試験)を実施し、実行結果を共有いただきたい。

共有後、本セッション(または後続セッション)が5文書(MIGRATION_RESULTS/CONNECTION_RESULTS/SECURITY_RESULTS/ROLLBACK_RESULTS/本文書)を実測結果で更新する。
