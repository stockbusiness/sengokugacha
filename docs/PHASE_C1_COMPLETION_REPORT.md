# 千ノ国パスポート Phase C-1 完了報告書

対象コミット: `a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージ後の`main`)

## 総括

Phase C-1指示書は、Phase C-0でローカル/CIにより確認した内容を、実際のステージングSupabase・Vercel・外部サービスに対して確認することを目的としている。ユーザーより「現行のSupabase・Vercel(まだ実稼働していない)をステージングとして使う」との明確な方針を受けて実施した。

このコーディングセッションのネットワークegressプロキシは当該Supabaseホストへ直接接続できない(raw-TCPのDB接続が原理的にサポート対象外)ため、`stockbusiness`がSupabaseダッシュボード(SQL Editor)・Vercelダッシュボード・LINEアプリを操作し、本セッションが提示するSQL/確認手順を1つずつ実行して結果を報告する「フォンリレー」形式で、migration適用から接続試験・rollback試験まで一通り実施した。

**実施内容の要約**:

1. migration履歴の実地調査により、指示書§5が想定していた7ファイルではなく、`20260709000005`(孤立)・`20260802000001`以降32ファイルの計33ファイルが未適用であることを発見。全74migrationファイルを突き合わせる監査クエリで正確な範囲を特定し、33ファイルを`timestamp`順に適用した
2. **適用中に新たな重大発見**: Supabaseプロジェクトが`public`スキーマに独自の`anon`/`authenticated`向け既定EXECUTE権限を持つため、既存の「PUBLICロールから剥奪」方式(`20260809000009`・`20260810000002`)では実際には保護されていないことが判明。是正migration`20260810000003`を新規作成・適用し、`anon`/`authenticated`が実行可能な関数が27件→0件になったことを確認
3. §7(ガチャ)・§10(Entitlement)・§11(Outbox)は使い捨てテストデータでの実地確認、§6(LINE)・§13(管理画面)は実際のログイン・ブラウザ操作で確認、§14(Rollback)はevent triggerの無効化→再有効化演習を実施、いずれも区分3(staging確認済み)に到達
4. §8(Stripe)・§9(HMAC)は、Stripe設定未完了・HMAC試験に必要なcurl実行環境が無いため未実施(区分5)

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
| ステージングmigration成功 | **達成**。33ファイル+是正1ファイル(計34)をステージングDBへ適用し、preflight系チェック(RPC権限)を実測 |
| 全外部接続成功 | 一部達成。LINE(区分3)は達成。Stripe・HMAC(区分5)は環境未整備のため未実施 |
| 二重付与なし | **達成**。ステージング実データでentitlement grant→取消済みへの再grantが`already_revoked`でブロックされ残高が変化しないことを実測。ローカル/CIでも確認済み(10並列grant等) |
| 二重取消なし | ローカル/CIで確認済み(entitlement 10並列revoke)。ステージングでは単発の取消動作のみ実測 |
| ガチャ券消失なし | **達成**。ステージング実データで有料ガチャのticket消費・冪等リプレイ(同一request_idでの二重加算なし)を実測。ローカル/CIでも確認済み |
| HMAC改ざん拒否 | ローカル/CIで確認済み(6パターン全て401/409で拒否)。ステージング実測は未対応(区分5) |
| anon RPC拒否 | **達成**。ステージング実データで27関数がanon/authenticatedから実行可能だった重大な抜けを発見・是正migrationで0件まで削減したことを実測(`docs/PHASE_C1_SECURITY_RESULTS.md`参照) |
| outbox二重業務処理なし | **達成**。ステージング実データでclaim_token fencing(二重claim拒否・誤token拒否)を実測。ローカル/CIでも確認済み |
| rollback手順確認 | event trigger無効化→再有効化の演習(区分3)は完了。Vercel Instant Rollback・outbox処理中の切り戻し演習は未実施(区分5) |
| branch protection設定 | **完了**(PR #147で`main`へ設定済み、`docs/CI_PIPELINE.md`参照) |
| 本番環境を変更していない | **達成**。本番Supabase・本番Vercel・本番Stripe・本番HMAC設定のいずれにも一切接続・変更していない |

## §18 本番移行条件について

指示書§18の通り、Phase C-1完了報告が承認されるまで、本番migration・本番Stripe・本番HMAC接続は実行していない。この方針は今後も維持する。

**本番移行の前提として追記**: 今回ステージングで発見した「PUBLICからの剥奪だけではanon/authenticatedへのSupabase既定権限に効かない」問題(`20260810000003`で是正)は、本番環境が新規Supabaseプロジェクトとして構築される場合にも同様に発生する。本番移行時は、必ず`20260810000003`適用後に§12のRPC権限チェックを実行し、0件であることを確認してから移行完了とすること。

## 次のアクション(要`stockbusiness`対応)

1. Stripe設定(test mode)完了後、§8の接続試験(Checkout Session作成→実ブラウザ決済→Webhook受信確認)を実施
2. PCが使える環境で、§9のHMAC v1/v2試験(`tests/contracts/sen-no-kuni-hub-hmac.test.ts`をステージングURL・ステージング鍵に向けて再実行、またはcurlでの手動確認)を実施
3. `docs/PHASE_C1_STAGING_TEST_PLAN.md`1.10に記載の残りのrollback演習(Vercel Instant Rollback、outbox処理中の切り戻し)を実施
4. 本セッションで追加した`20260810000003`を含む`claude/sengoku-economy-os-j0d2nl`ブランチを、任意のタイミングで`main`へマージするかどうかご判断いただきたい(ステージングDBへは直接SQLで既に適用済みのため、マージ自体は将来の新規環境構築・本番移行の際に必要になる)

上記が完了し次第、本文書および該当セクションを実測結果で更新する。
