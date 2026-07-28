# 千ノ国パスポート Outbox実運用試験結果(§5.8)

区分: 1.ソースコード確認済み / 2.local確認済み / **3.staging確認済み** / 4.production未確認 / 5.未対応 / 6.問題あり / 7.管理者操作待ち / 8.Stripeアカウント待ち

Stripe取得待ち期間対応指示書§5.8に基づき、2026-07-28に`stockbusiness`が管理画面(`/admin/integration-recovery`)から実際にOutbox手動再送を実行して確認した。

## テスト方法

`integration_outbox_events`のイベント種別のうち、実際に外部システム(sengoku-ai.com・LINE)へ送信するもの(`referral.confirmed`・`notification.plot_purchased`)は本物の外部通信を発生させてしまうため、テストには使わない。代わりに、`sendIntegrationOutboxEvent()`が意図的に「未対応のevent_typeです」で例外を投げる`test.unsupported`という架空のevent_typeでテスト行を1件投入し、claim→送信試行→失敗記録という一連の流れのみを安全に確認した。

```sql
insert into integration_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
values ('test', 'outbox-test-0001', 'test.unsupported', 'hmac-test', '{"note":"outbox drain test"}'::jsonb, 'pending');
```

## 実測結果

`/admin/integration-recovery`の「購入イベント外部送信(未送信・失敗)」セクションに投入した行が表示されることを確認し、「全件再送を試行」ボタンを押下した。

- 実行前: `[外部連携] test.unsupported — test:outbox-test-0001 — 未送信`、試行回数0
- 実行後: `[外部連携] test.unsupported — test:outbox-test-0001 — 送信失敗`、**直近エラー: 未対応のevent_typeです: test.unsupported**、試行回数1

期待通り、以下が確認できた。
- 管理画面の「全件再送を試行」ボタンが`claim_integration_outbox_event`(原子的claim)を経由して実際に対象行をclaimし、送信処理(`sendIntegrationOutboxEvent`)を呼び出していること
- 送信処理が例外を投げた場合、`attempt_count`が1増加し、`last_error`にエラーメッセージがそのまま記録されること
- ステータスが`pending`→(claim中は`processing`)→`failed`へ正しく遷移すること

確認後、テスト行を削除してステージングDBをクリーンな状態に戻した。

## 未実施(実際の外部送信を伴うため保留)

- `referral.confirmed`(sengoku-ai.comへの紹介確定通知)の実際の再送成功パス
- `notification.plot_purchased`(LINEプッシュ通知)の実際の再送成功パス

これらは実際に該当する购入・紹介データが発生した際(または§5.6の新規登録・紹介試験で紹介経由の登録が発生した際)に、自然発生したfailed行に対して同じ「全件再送を試行」ボタンで検証できる。現時点でこれらのテーブルは空(§5.3で確認済み)のため、意図的なfailed行を作らない限り成功パスは検証できない。

## Cronエンドポイントの認証確認

`CRON_SECRET`環境変数の設定状況が未確認のため、`/api/internal/cron/integration-outbox`等をcurlで直接叩く形での確認は今回見送った。設定済みになった時点で改めて確認する。

## 結論

- 管理画面からのOutbox手動再送は、claim・エラー記録・ステータス遷移を含め設計通り動作することを実測で確認した。
- 実際の外部送信成功パスの確認、およびCronエンドポイントの認証確認は、条件が揃い次第の追加確認事項として残す。
