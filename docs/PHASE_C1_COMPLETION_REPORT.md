# 千ノ国パスポート Phase C-1 完了報告書

対象コミット: `a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージ後の`main`)

## 総括

Phase C-1指示書は、Phase C-0でローカル/CIにより確認した内容を、実際のステージングSupabase・Vercel・外部サービスに対して確認することを目的としている。しかし本セッションで確認した通り、**ステージング環境(Supabaseプロジェクト・Vercelデプロイ先・Stripe test mode鍵・HMACステージング秘密鍵)がまだ構築されていない**。この状態では、指示書§4以降の実際の接続試験・migration適用試験を実施することができない。

本セッションで実施したのは以下の2点である。

1. ステージング環境が存在しない前提でも進められる範囲の対応(preflightスクリプトの拡張、既存資産のマッピング整理、文書化)
2. ステージング環境構築後にすぐ実施できるよう、必要な手順・チェックリストの明文化

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
| ステージングmigration成功 | 未対応(環境未構築) |
| 全外部接続成功 | 未対応(環境未構築)。ただしローカル/CIでの契約テスト(HMAC v1/v2・Stripe署名検証)は全て成功済み |
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

`docs/PHASE_C1_STAGING_TEST_PLAN.md`の1章「ステージング環境構築チェックリスト」に従い、以下を実施いただきたい。

1. ステージング用Supabaseプロジェクトの新規作成
2. ステージング用Vercel環境の作成・環境変数設定(Supabase接続情報・Stripe test mode鍵・ステージング専用SESSION_SECRET等)
3. HMAC v1/v2ステージング秘密鍵の`sen_no_kuni_hub_settings`への登録
4. LINE開発用チャネルの設定
5. ステージングDBのバックアップ取得(migration適用前)

完了後、ステージング接続情報を共有いただければ、本セッション(または後続セッション)が指示書§4〜§14を順次実施し、5文書(MIGRATION_RESULTS/CONNECTION_RESULTS/SECURITY_RESULTS/ROLLBACK_RESULTS/本文書)を実測結果で更新する。
