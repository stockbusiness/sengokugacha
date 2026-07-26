# 千ノ国パスポート Phase C-1 ステージング試験計画書

「千ノ国パスポート Phase C-1: ステージングDB適用・外部接続・運用復旧試験指示書」(以下「指示書」)への対応計画。基準コミット `a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージ後の`main`)。

## 0. 前提条件の確認結果(最重要)

このリポジトリには、ステージング環境(Supabaseプロジェクト・Vercelデプロイ先・Stripe test mode鍵・HMACステージング秘密鍵)が**まだ存在しない**ことを確認済み(`.env.example`は単一のSupabase設定のみ、`.github/workflows/`にstaging関連のワークフローなし、READMEにもstaging構築手順の記載なし)。

また、このセッション(コーディングエージェント)には、Supabase管理コンソール・Vercel管理コンソール・Stripeダッシュボードへのアクセス権限が一切付与されていない。そのため、指示書§3の実施順序のうち「ステージングDBバックアップ」〜「ステージングアプリデプロイ」までは、**リポジトリ管理者(`stockbusiness`)による事前のステージング環境構築が完了して初めて着手可能**である。

本書では、(a)ステージング環境構築チェックリスト、(b)構築後に実際の試験で使う既存資産(スクリプト・テストファイル)のマッピング、の2点を提出する。

## 1. ステージング環境構築チェックリスト(要管理者操作)

以下はいずれもこのセッションから実行できない、Supabase/Vercel/Stripe/LINEの管理コンソール操作。

| # | 項目 | 内容 |
|---|---|---|
| 1 | Supabaseステージングプロジェクト作成 | 本番プロジェクトとは完全に別の新規Supabaseプロジェクトを作成する。プロジェクトURL・`anon` key・`service_role` keyを控える。 |
| 2 | Vercelステージング環境作成 | `main`とは別の永続的なデプロイ環境(例: `staging`ブランチに紐づくカスタム環境、またはVercelの「Preview環境の固定URL」機能)を用意する。 |
| 3 | Vercel環境変数設定(ステージング環境のみ) | `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`をステージングSupabaseの値に設定。`SESSION_SECRET`はステージング専用の値を新規生成(本番と共有しない)。`ADMIN_PASSWORD`/`ADMIN_PASSWORD_OPERATOR`もステージング専用の値にする。 |
| 4 | Stripe test mode鍵取得・設定 | StripeダッシュボードのTest mode側から`sk_test_...`/`pk_test_...`とWebhook署名シークレット(`whsec_...`)を取得し、Vercelステージング環境変数に設定する。**本番キー(`sk_live_...`)は絶対に設定しないこと**(指示書§8)。 |
| 5 | HMAC v1/v2ステージング秘密鍵の登録 | `sen_no_kuni_hub_settings`テーブル(ステージングDB)に、ステージング専用の`key_id`/`hmac_secret`ペアを登録する(本番の鍵とは別の値)。 |
| 6 | LINEチャネル(開発用) | LINEログイン・LIFF・Messaging APIの動作確認用に、開発用チャネル(既存のものがあれば流用、無ければ新規作成)のチャネルID・シークレット・アクセストークンを、管理画面(`/admin/line-settings`)からステージングDBへ設定する。 |
| 7 | ステージングDBバックアップ取得 | 上記構築が完了し、まだmigrationを適用していない状態(=移行元の状態)でSupabaseのバックアップ機能によりバックアップを取得する(指示書§3の最初のステップ)。 |

上記が完了した時点で、ステージングSupabaseの接続情報(URL・service_role key)と、ステージングアプリのURLをこのセッション(または後続セッション)へ共有いただければ、指示書§4以降の実施に進める。

## 2. 指示書 各セクションと既存資産のマッピング

Phase C-0/PR #147マージ前最終修正指示の対応で、指示書§4〜§14が要求する試験内容の大部分は、既にソースコード上に実装され、CI(GitHub Actions、Supabase local)またはローカルの一時PostgreSQLで実地検証済みである。ステージングでの実施は、**同じ検証をローカル/CIの使い捨て環境ではなく、実際に永続するステージングSupabase・Vercel・Stripe/LINE外部サービスに対して行う**ことに意味がある(特に、外部サービスとの実ネットワーク経由の往復、Vercelという実デプロイ環境固有の設定漏れ、といったローカル/CIでは再現できないクラスの不具合を検出する)。

区分は指示書§17と同じ6区分を用いる: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり。

| § | 内容 | 対応する既存資産 | 現状区分 |
|---|---|---|---|
| §4 | Migration preflight | `scripts/production-migration-preflight.sql`(本書と同時に、重複行に加えorphan FK・不正status分布・null不整合・10分以上processing・failed/dead件数・RPC実行権限・migration履歴を追加済み) | 2(ローカルの使い捨てPostgreSQLで全クエリの構文・実行を確認済み) |
| §5 | Migration適用(7ファイル) | `tests/migrations/run-upgrade-test.sh`(既存DB+PR #147新規7 migrationの適用手順そのもの。ステージングでは同じ手順を`psql`で手動、またはSupabase CLIの`supabase db push`で行う) | 2(ローカルの使い捨てPostgreSQLで実地確認済み、§3参照) |
| §5(適用後確認) | inbox/outbox claim_token・lease_expires_at・next_retry_at・entitlement自動取消・PUBLIC EXECUTE剥奪・event trigger作成 | `tests/integration/entitlement-concurrency.test.ts`・`integration-inbox-concurrency.test.ts`・`outbox-concurrency.test.ts`・`rls-policies.test.ts`(event trigger込み) | 2(CI/Supabase localで確認済み) |
| §6 | LINEログイン(新規/既存/Cookie/common_user_id未解決・解決済み/紹介URL/紹介者上書き禁止) | 自動テスト化不可(実LINEアカウント・LIFF実機を要する、`docs/BASELINE_TEST_RESULTS.md`に既存の制約として明記済み) | 1(ソースコードの読み取りによる仕様確認のみ)。staging実施は実機QAが必要 |
| §7 | ガチャ(無料/有料/券不足/日次上限/同時実行/美濃国解放/天下統一/動画取得失敗/request ID再送/JST日付境界) | `tests/integration/gacha-*.test.ts`・`tenka-toitsu.test.ts`・`gacha-animation-fetch-failure.test.ts`・`src/modules/gacha/domain/draw-limit.test.ts`(JST境界・美濃国解放しきい値) | 2(CI/Supabase local、および一部は開発用サンドボックスの実PostgreSQLで確認済み) |
| §8 | Stripe(Checkout・Webhook署名・completed・再送・10並列・grant・手動再実行) | `tests/contracts/stripe-webhook-purchase-flow.test.ts`(Stripe SDKで実署名生成、ローカルの`next dev`に対して実施)。ただし実際のStripeダッシュボード経由のCheckout作成・実Webhook配信はローカルでは未実施 | 2(署名検証等のロジックはlocal確認済み)。実Checkout・実Webhook配信は3が必要(staging未実施) |
| §9 | HMAC v1/v2(正常署名・改ざん系・nonce・timestamp・v1停止) | `tests/contracts/sen-no-kuni-hub-hmac.test.ts`(全項目を実HTTPリクエストで確認済み、対象は`next dev`) | 2(local/CI確認済み)。ステージングURLに対する同一テストの実施が3 |
| §10 | Entitlement(grant/revoke/revoke→grant/未同期→同期/dismissed/10並列/残高一致) | `tests/integration/entitlement-concurrency.test.ts` | 2(CI/Supabase local確認済み) |
| §11 | Outbox(紹介confirm成功/失敗・安定Idempotency-Key・sent更新前クラッシュ模擬・drain2並列・next_retry_at・dead・LINE通知重複許容) | `tests/integration/outbox-concurrency.test.ts`・`src/lib/common-user-hub.test.ts`(安定Idempotency-Key) | 2(CI/local確認済み) |
| §12 | RPC権限(anon/authenticated拒否・service_role許可・新規関数への自動適用) | `tests/integration/rls-policies.test.ts`・`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md` | 2(CI/Supabase local確認済み)。ステージングDBでの実測値取得(§16「anon RPC拒否」の実測)は3が必要 |
| §13 | 管理画面(operator 403・manager成功・各種再実行・merge conflict・unresolved・監査ログ) | `tests/contracts/admin-recovery-endpoints.test.ts`・`tests/contracts/purchase-retry-grant.test.ts`・`src/lib/admin-audit-log.ts` | 2(local確認済み) |
| §14 | Rollback試験 | `docs/ROLLBACK_PHASE_C0_PR4.md`・`docs/ROLLBACK_BUGFIX.md`・`docs/ROLLBACK_P0_2.md`(手順の文書化のみ) | 1(手順書のみ、実機ロールバック演習は未実施) |
| §15 | Branch protection(8ジョブ+PR必須/up-to-date/会話解決/force-push禁止/削除禁止) | PR #147で`main`へ設定済み(`docs/CI_PIPELINE.md`参照) | **完了**(staging試験としては対象外、`main`に対して既に設定済みであることの確認のみ) |

## 3. 実施順序(指示書§3、現状の到達点)

```text
ステージングDBバックアップ          … 未着手(環境未構築)
↓
読み取り専用preflight              … スクリプト整備済み(§4)、実行は環境構築後
↓
現在のmigration履歴取得             … スクリプトに追加済み(§4の一部)
↓
migration適用                      … 手順は既存(tests/migrations/run-upgrade-test.sh相当)、実行は環境構築後
↓
DB権限・関数確認                    … 既存テストで手順確立済み、実行は環境構築後
↓
ステージングアプリデプロイ           … 未着手(環境未構築)
↓
接続試験                           … 既存contract testで手順確立済み、実行は環境構築後
↓
復旧・rollback試験                  … 手順書のみ整備済み、実機演習は未実施
↓
本番移行判定                       … Phase C-1完了報告の承認待ち(§18)
```

## 4. 本番環境への影響について

このセッションは本番Supabase・本番Vercel・本番Stripe・本番HMAC設定のいずれにも一切接続・変更していない。指示書§18の通り、Phase C-1完了報告が承認されるまで本番migration・本番Stripe・本番HMAC接続は実行しない。

## 5. 次のアクション

1. 上記1章のステージング環境構築チェックリストを`stockbusiness`が実施
2. 構築後、ステージングSupabase接続情報(`SUPABASE_TEST_URL`相当の値、ただしステージング用)とステージングアプリURLをこのセッションへ共有
3. 共有後、本セッションが§4(preflight実行)〜§14(rollback試験)を順に実施し、`docs/PHASE_C1_MIGRATION_RESULTS.md`等の残り5文書を実測結果で更新する
