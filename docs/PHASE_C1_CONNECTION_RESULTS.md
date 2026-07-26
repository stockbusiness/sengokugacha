# 千ノ国パスポート Phase C-1 外部接続試験結果報告(§6〜§11・§13)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり

**総括**: ステージングとして現行のSupabase/Vercel環境を使用する方針を確認済みだが、このコーディングセッションのネットワークegressプロキシが当該Supabaseホストをallowlistしておらず(`403 Forbidden: Host not in allowlist`)、このセッションから直接接続することができない。そのため本章の全項目は現時点で区分3(staging確認済み)に到達していない。`docs/PHASE_C1_STAGING_TEST_PLAN.md`の実行手順書(1章)に従って`stockbusiness`が現行環境に対して試験を実施し、結果を共有し次第、本文書を実測結果で更新する。以下はそれぞれの項目について、ソースコードの実装状況・ローカル/CIでの検証状況を報告する。

## §6 LINEログイン

| 確認項目 | 状況 | 区分 |
|---|---|---|
| 新規LINEユーザー | `src/lib/passport.ts`の`createOrLoginUser`相当のロジックで新規作成 | 1 |
| 既存LINEユーザー | `line_user_id`一致で既存レコードを検索・ログイン | 1 |
| セッションCookie | `SESSION_SECRET`で署名したCookie、`src/lib/session.ts`相当 | 1 |
| common_user_id未解決 | `resolveCommonUserId()`が`null`を返した場合`users.common_user_id`はnullのまま(fail-open方針) | 1 |
| common_user_id解決済み | 解決成功時は`common_user_id`・`common_user_synced_at`を更新 | 1 |
| 紹介URL経由 | `captureReferral()`→`referral_session_key`保存→新規登録時`confirmReferral()` | 1 |
| 既存紹介者の上書き禁止 | `users.referring_agent_id`はfirst-touch方式で登録時のみ設定、以後のログインでは更新しない(コードレビューで確認) | 1 |

LINEログイン・LIFF・共通顧客ID解決はいずれも実際のLINEアカウント・LIFF実機・sengoku-ai.com側の応答を要するため、`docs/BASELINE_TEST_RESULTS.md`に記載の通り自動テスト化できない制約がある。ステージング環境構築後、実際のLINEアカウント(開発用チャネル)でLIFFアプリを開き、上記7項目を手動QAで確認する必要がある(区分3への到達には実機QAが必須)。

## §7 ガチャ

| 確認項目 | 対応するテスト | 区分 |
|---|---|---|
| 無料ガチャ | `tests/integration/gacha-concurrency.test.ts`等 | 2 |
| 有料ガチャ | 同上 | 2 |
| ガチャ券不足 | `InsufficientTicketsError`関連テスト | 2 |
| 日次上限 | `tests/integration/gacha-draw-rollback-and-conquest.test.ts`(日付境界テスト) | 2 |
| 同時実行 | `tests/integration/gacha-concurrency.test.ts`(20並列) | 2 |
| 美濃国解放 | `src/modules/gacha/domain/draw-limit.test.ts`(`didJustUnlockMino`) | 2(純粋関数) |
| 天下統一 | `tests/integration/tenka-toitsu.test.ts`(実データ) | 2 |
| 動画取得失敗 | `tests/integration/gacha-animation-fetch-failure.test.ts` | 2 |
| request ID再送 | `execute_gacha_draw()`の`p_request_id`引数による冪等性(DB関数側で同一request_idの重複実行を防止) | 1(既存実装の確認。専用の再送テストは今回未追加) |
| JST日付境界 | `src/modules/gacha/domain/draw-limit.test.ts`(`getTokyoBusinessDate`) | 2(純粋関数) |

ガチャ機能はDB(Supabase local/使い捨てPostgreSQL)への接続のみで完結し、外部サービス依存が無いため、ステージングでの実施価値は主に「実際にVercelにデプロイされたアプリから、ステージングSupabaseへ正しく接続できるか」という配線確認になる。

## §8 Stripe

`tests/contracts/stripe-webhook-purchase-flow.test.ts`が、Stripe SDKの`generateTestHeaderString()`で実署名を生成し、ローカルの`next dev`プロセスへ実HTTPリクエストを送る形で以下を確認済み(区分2):

- Webhook署名検証
- `checkout.session.completed`受信→`purchases.status='processing'`→権利付与→`completed`/`grant_status='granted'`
- 同一event再送時の冪等性(`stripe_webhook_events`のunique制約)
- 手動再実行(`/api/admin/purchases/[id]/retry-grant`)

**未実施(区分5、staging構築後に対応)**:
- 実際のStripeダッシュボード(test mode)でのCheckout Session作成→実際のブラウザでの決済フロー
- Stripe側からステージングVercelアプリへの実Webhook配信(ローカルではStripe CLIの`stripe listen`転送か、直接構成したHTTPリクエストで代替しており、Stripeのインフラを実際には経由していない)
- 10並列でのStripe実Webhook再送
- grant失敗時の管理画面復旧を、実際のStripeイベントに対して実施すること

本番Stripeキー(`sk_live_...`)は本セッションのいかなる操作にも使用していない。

## §9 HMAC v1/v2

`tests/contracts/sen-no-kuni-hub-hmac.test.ts`が実際にHMAC-SHA256署名を計算し、ローカルの`next dev`へ実HTTPリクエストを送信して以下を確認済み(区分2):

**v1**: 正常署名・nonce再利用・timestamp失効・`v1_disabled_at`後の拒否
**v2**: 正常署名・key ID改ざん・nonce改ざん・Idempotency-Key改ざん・event version改ざん・raw body改ざん
**確認イベント**: `entitlement.granted`/`entitlement.revoked`/`customer.assignment.changed`/`common_user.merged`/`order.paid`(いずれかの実処理まで通した正常系)

ステージングでの実施(区分3、未着手)は、同一テストスイートをステージングURL・ステージング専用のHMAC鍵に向けて再実行することで達成できる見込み(テストコード自体の変更は不要、接続先環境変数の変更のみ)。

## §10 Entitlement

`tests/integration/entitlement-concurrency.test.ts`が以下を確認済み(区分2、PR #147 §1で拡充):

- grant / revoke / revoke→grant(1回のgrant呼び出しで自動収束)
- revoke→grant→revoke再送でも冪等
- user未同期(user_id未解決)→revoke→後日user解決のケース
- dismissed entitlementのガード
- 10並列grant・10並列revoke
- 最終台帳(entitlements)とusers.kokudaka等の残高の一致

## §11 Outbox

`tests/integration/outbox-concurrency.test.ts`・`src/lib/common-user-hub.test.ts`が以下を確認済み(区分2、PR #147 §4で修正・拡充):

- 紹介confirm成功・失敗の記録
- **安定Idempotency-Key**(outbox event id由来、送信成功後・DB更新前のプロセス停止を模擬した再送でも同一キーになることを確認済み)
- drain 2並列(claim_token fencingにより二重送信されないこと)
- next_retry_at・dead状態への遷移
- LINE通知の重複許容仕様(`src/lib/line-push.ts`にat-least-once・ベストエフォート方針をコメントで明記済み)

## §12 RPC権限

`docs/PHASE_C1_SECURITY_RESULTS.md`を参照。

## §13 管理画面

| 確認項目 | 対応する既存資産 | 区分 |
|---|---|---|
| operator 403 | `requireManagerRole()`によるガード(purchases再実行・entitlement再解決・outbox drain等) | 1 |
| manager成功 | 同上 | 1 |
| purchase再実行 | `tests/contracts/purchase-retry-grant.test.ts` | 2 |
| entitlement再解決 | `tests/contracts/admin-recovery-endpoints.test.ts` | 2 |
| outbox drain | 同上 | 2 |
| merge conflict | `src/lib/agency-events.ts`のcommon_user.merged競合記録・管理画面表示 | 1 |
| unresolved assignment | 同上(未解決担当者管理画面) | 1 |
| 監査ログ | `src/lib/admin-audit-log.ts`、各admin routeで`logAdminAction()`呼び出し済み | 1 |

管理画面はいずれもVercelへの実デプロイ後、実際のブラウザ操作での確認(区分3)が必要。
