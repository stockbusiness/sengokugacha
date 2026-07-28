# 千ノ国パスポート Stripe取得後の準備(§7)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / **5.未対応(Stripeアカウント取得待ち)** / 6.問題あり / 7.管理者操作待ち / **8.Stripeアカウント待ち**

Stripe取得待ち期間対応指示書§7に基づき、Stripeアカウント取得後にすぐ試験できるよう、必要な情報・手順を事前に整理する。**本ドキュメント作成時点でStripeへの実接続は一切行っていない**(禁止事項: `sk_live_`/`pk_live_`の使用、本番Webhook、実決済、Stripeコードの削除、仮Webhook Secretの本番扱い、いずれも未実施)。

## 1. ステージングWebhook URL

```
https://sengokugacha.vercel.app/api/stripe/webhook
```

Stripeダッシュボード(**テストモード**)→「開発者」→「Webhook」→「エンドポイントを追加」で上記URLを登録する。購読するイベントは`checkout.session.completed`のみでよい(`src/modules/commerce/application/process-stripe-webhook-event.ts`がこのイベントのみを処理する実装のため)。登録すると発行される署名シークレット(`whsec_...`)を`/admin/payment-settings`の「Webhookシークレット」欄に設定する。

## 2. テスト商品・テスト価格

このアプリはStripeダッシュボード側に商品(Product)・価格(Price)オブジェクトを事前作成する方式ではなく、Checkout Session作成時に`price_data`を動的生成する実装になっている(`src/app/api/purchase/checkout/route.ts`・`src/app/api/purchase/castle-plot-checkout/route.ts`)。そのため「テスト商品・テスト価格」は**Stripe側の設定ではなく、`/admin/payment-settings`の以下の値**を指す。

| 項目 | 現在のデフォルト値 |
|---|---|
| 石高パック 金額(円) | `kokudaka_pack_amount_yen` = 500 |
| 石高パック 付与量 | `kokudaka_pack_kokudaka` = 500 |
| ガチャ券パック 金額(円) | `gacha_ticket_pack_amount_yen` = 150 |
| ガチャ券パック 付与量 | `gacha_ticket_pack_tickets` = 1 |

テスト時は誤操作での高額課金を避けるため、一時的にこれらを小額(例: ¥50)に変更してから試験し、終了後に元の値へ戻すことを推奨する。土地区画購入(`castle_plots.price_yen`)を試験する場合は、テスト用の安価な区画を1つ用意する。

## 3. テスト購入ユーザー

§5.6(LINE新規登録・紹介試験)用に用意するテスト用LINEアカウントと**同じアカウントを共用**してよい。理由: 決済試験は実際のLINEログイン→石高/ガチャ券購入という一連の流れで行うのが最も実態に近く、アカウントを分ける必要が無いため。

## 4. 付与対象・付与量

| 購入種別 | 付与先カラム | 付与量の決定元 |
|---|---|---|
| 石高パック | `users.kokudaka` | `payment_settings.kokudaka_pack_kokudaka` |
| ガチャ券パック | `users.gacha_tickets` | `payment_settings.gacha_ticket_pack_tickets` |
| 土地区画 | `castle_plots.status`・`plot_reservations` 等 | 該当区画1件 |

付与は`adjust_user_balance()`(原子的UPDATE)経由で行われるため、テスト時は購入前後の`users.kokudaka`/`gacha_tickets`をSQLで比較し、付与量が正しいことを確認する。

## 5. 返金シナリオ

返金はStripeのWebhookイベント(`charge.refunded`等)を待つ実装ではなく、**管理画面(`/admin/purchases`)の「返金」ボタンから能動的に実行する**方式(`src/app/api/admin/purchases/[id]/refund/route.ts`)。試験手順:

1. テストカード(`4242 4242 4242 4242`等、Stripeテストモード標準)で1件購入を完了させる
2. `/admin/purchases`で該当購入を「返金」する
3. Stripe側で実際に返金(refund)が作成されることを確認(Stripeダッシュボードのテストモードで確認)
4. `users.kokudaka`/`gacha_tickets`が購入前の値まで正しく戻ることを確認
5. 土地区画購入の返金は本部管理者(manager)のみ実行可能な制限が付いているため、operatorロールでは403になることも確認する

## 6. Webhook再送シナリオ

Stripeダッシュボードの「Webhookイベント」詳細画面から「再送信」を実行するか、Stripe CLIで`stripe trigger checkout.session.completed`を使う。確認項目:

- 同一`stripe_event_id`の重複受信が`stripe_webhook_events`のunique制約で弾かれ、二重に石高/ガチャ券が付与されないこと(下記「二重付与確認SQL」で検証)
- Webhook処理中に一時的な障害を模した場合(例: 一時的にentitlement系の関数を無効化する等)、`purchases.grant_status='failed'`のまま`status='processing'`に留まり、`/admin/purchases`の「再試行」ボタンで復旧できること

## 7. 二重付与確認SQL(読み取り専用)

```sql
-- purchase_grant_stepsの(purchase_id, step_key)一意制約はDBレベルで二重付与を防ぐが、
-- 念のため実際に複数行が存在しないか確認する。
select purchase_id, step_key, count(*)
from purchase_grant_steps
where step_key = 'balance_granted' and status = 'completed'
group by purchase_id, step_key
having count(*) > 1;

-- Stripeイベントの二重処理防止(stripe_event_idのunique制約)の実データ確認。
select stripe_event_id, count(*)
from stripe_webhook_events
group by stripe_event_id
having count(*) > 1;
```

いずれも0 rowsが正常。

## 8. 手動復旧手順

- **購入は完了しているが権利未付与**(`purchases.status='completed'`かつ`grant_status<>'granted'`): `/admin/purchases`の対象購入から「再試行」ボタンを押す(`/api/admin/purchases/[id]/retry-grant`)
- **Webhookイベント自体が失敗**(`stripe_webhook_events.status='failed'`): 現状、Webhookイベント単位の手動再実行UIは無いため、Stripeダッシュボードから該当イベントを「再送信」する
- **紹介確定・購入通知の外部送信失敗**: `/admin/integration-recovery`の「購入イベント外部送信(未送信・失敗)」セクションから「全件再送を試行」(§5.8で実測済みの機能)

## 現時点の評価

- 上記はすべてソースコードの確認に基づく整理であり、実際のStripeテストモードでの動作確認はStripeアカウント取得後に行う。
- `stockbusiness`が`/admin/payment-settings`で確認済み: **未設定**(2026-07-28確認)。Stripeアカウント取得後、最初にこの画面で公開可能キー・秘密キー・Webhookシークレットを設定する必要がある。
