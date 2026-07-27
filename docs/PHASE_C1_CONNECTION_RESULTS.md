# 千ノ国パスポート Phase C-1 外部接続試験結果報告(§6〜§11・§13)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり

**総括**: このコーディングセッションのネットワークegressプロキシは当該Supabaseホストへ直接接続できないため、`stockbusiness`がSupabaseダッシュボード(SQL Editor)・実際のVercelデプロイ・LINEアプリを使って本セッションの指示するSQL/操作を代行実行する「フォンリレー」形式で実施した。§6(LINE)・§7(ガチャ)・§10(Entitlement)・§11(Outbox)・§13(管理画面)は区分3(staging確認済み)まで到達した。§8(Stripe)・§9(HMAC)は環境未整備(Stripe設定未完了、HMAC試験にはcurl実行環境が必要)のため区分5(未対応)のまま。

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

**ステージングでの実施(区分3、完了)**: `stockbusiness`が実際にLINEアプリからステージングVercelアプリを開いてログインし、既存ユーザー(国民証No.000001)としてダッシュボードが正常に表示されることを確認した。ログイン後、`users`テーブルを直接確認し、新規追加した`common_user_id`・`assigned_agent_id`列が既存ユーザーに対して安全にnullのまま保持されており(移行によるデータ破損なし)、`contribution_points`等の既存データも正しく保持されていることを確認した。

新規LINEユーザーの作成・紹介URL経由の登録については、実データを作らない方針のため今回は既存ユーザーでのログイン確認に留めた(区分3として「既存ユーザーログイン」のみ実測、「新規ユーザー作成」はソースコード確認(区分1)のまま)。

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

**ステージングでの実施(区分3、完了)**: `stockbusiness`が実際のステージングDBに対し、使い捨てテストユーザーを作成して`execute_gacha_draw()`を直接呼び出し、以下を実測確認した。

- 無料ガチャ1回目: レア武将で新規カード獲得、`contribution_points_earned = 50`(レア40点+新規カード10点)が正しく加算されることを確認
- 同一`request_id`での再実行: `log_id`を含め全く同じ結果が返り、`users.contribution_points`が2重加算されない(50のまま)ことを確認(冪等性の実データ確認)
- 有料ガチャ: `gacha_tickets`が5→4へ正しく1消費されることを確認
- テストデータは試験後に削除済み

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

**ステージングでの実施(区分5、未対応)**: `stockbusiness`確認の結果、ステージング環境のStripe設定自体がまだ準備中とのことで、本Phase C-1では実施を見送った。Stripe設定完了後、`docs/PHASE_C1_STAGING_TEST_PLAN.md`の手順に従い改めて実施する。

## §9 HMAC v1/v2

`tests/contracts/sen-no-kuni-hub-hmac.test.ts`が実際にHMAC-SHA256署名を計算し、ローカルの`next dev`へ実HTTPリクエストを送信して以下を確認済み(区分2):

**v1**: 正常署名・nonce再利用・timestamp失効・`v1_disabled_at`後の拒否
**v2**: 正常署名・key ID改ざん・nonce改ざん・Idempotency-Key改ざん・event version改ざん・raw body改ざん
**確認イベント**: `entitlement.granted`/`entitlement.revoked`/`customer.assignment.changed`/`common_user.merged`/`order.paid`(いずれかの実処理まで通した正常系)

**ステージングでの実施(区分5、未対応)**: HMAC署名付きリクエストの送信にはcurl等のコマンド実行環境が必要で、本Phase C-1はスマートフォンからのSQL Editor操作のみで実施していたため見送った。PCが使える環境で、同一テストスイートをステージングURL・ステージング専用のHMAC鍵に向けて再実行することで達成できる見込み(テストコード自体の変更は不要、接続先環境変数の変更のみ)。

## §10 Entitlement

`tests/integration/entitlement-concurrency.test.ts`が以下を確認済み(区分2、PR #147 §1で拡充):

- grant / revoke / revoke→grant(1回のgrant呼び出しで自動収束)
- revoke→grant→revoke再送でも冪等
- user未同期(user_id未解決)→revoke→後日user解決のケース
- dismissed entitlementのガード
- 10並列grant・10並列revoke
- 最終台帳(entitlements)とusers.kokudaka等の残高の一致

**ステージングでの実施(区分3、完了)**: `stockbusiness`が実際のステージングDBに対し、テスト用entitlement行(kokudaka +100)を作成して以下を実測確認した。

- `process_entitlement_grant()`呼び出しで`claim_outcome = 'claimed'`、`users.kokudaka`が0→100に正しく反映
- entitlementを`revoked`にした上で`process_entitlement_revocation()`を呼び出すと`kokudaka`が100→0に正しく減算
- 取消済みentitlementへ`process_entitlement_grant()`を再送すると`claim_outcome = 'already_revoked'`となり、`kokudaka`は0のまま変化しない(二重付与防止の実データ確認)
- テストデータは試験後に削除済み

## §11 Outbox

`tests/integration/outbox-concurrency.test.ts`・`src/lib/common-user-hub.test.ts`が以下を確認済み(区分2、PR #147 §4で修正・拡充):

- 紹介confirm成功・失敗の記録
- **安定Idempotency-Key**(outbox event id由来、送信成功後・DB更新前のプロセス停止を模擬した再送でも同一キーになることを確認済み)
- drain 2並列(claim_token fencingにより二重送信されないこと)
- next_retry_at・dead状態への遷移
- LINE通知の重複許容仕様(`src/lib/line-push.ts`にat-least-once・ベストエフォート方針をコメントで明記済み)

**ステージングでの実施(区分3、完了)**: `stockbusiness`が実際のステージングDBに対し、テスト用outbox行を作成して以下を実測確認した。

- `claim_integration_outbox_event()`で1回目のclaimが`'claimed'`を返す
- 直後に別のclaim_tokenで再claimを試みると`'in_progress'`を返し、二重claimされない(leaseによる排他制御の実データ確認)
- 誤ったclaim_tokenで`mark_integration_outbox_sent()`を呼ぶと`false`を返し完了できない(fencingの実データ確認)
- 正しいclaim_tokenでは`true`を返し正常に完了
- テストデータは試験後に削除済み

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

**ステージングでの実施(区分3、一部完了)**: `stockbusiness`が実際のステージングVercelアプリの管理画面にログインし、`/admin/integration-recovery`(nonceクリーンアップ・merge競合・未解決担当者割当のUI)・`/admin/purchases`(購入履歴一覧)が、いずれもエラー無く正常に表示されることを確認した(データは0件だが、これはステージングに実データが無いための想定通りの空状態表示)。これにより、新規追加したテーブル群(entitlements・integration_outbox_events等)へのAPI層からの読み取りが正しく機能していることを確認できた。operator/manager権限分岐・purchase再実行・entitlement再解決の実際のボタン操作による動作確認は今回未実施(区分1〜2のまま)。
