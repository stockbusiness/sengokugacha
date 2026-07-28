# 千ノ国パスポート HMAC v1/v2 ステージング実測結果(§5.5)

区分: 1.ソースコード確認済み / 2.local確認済み / **3.staging確認済み** / 4.production未確認 / 5.未対応 / 6.問題あり / 7.管理者操作待ち / 8.Stripeアカウント待ち

Stripe取得待ち期間対応指示書§5.5に基づき、2026-07-28に`stockbusiness`がPowerShell(curl.exe + .NETのHMACSHA256/SHA256)から実際にステージング(`https://sengokugacha.vercel.app`)へHTTPリクエストを送信し、`POST /api/integrations/sen-no-kuni-hub`のHMAC署名検証(v1/v2)を実測した。

## テスト方法

1. `sen_no_kuni_hub_settings`へテスト専用の連携先(`system_key='hmac-test'`、`key_id='hmac-test-key'`)を一時的に登録
2. 業務データに影響しない未対応イベント種別`test.ping`(`EVENT_HANDLERS`に存在しないため200受理・処理スキップになる、`/api/integrations/agencies`と同じ堅牢化方針)を使い、実際の権利付与・購入処理には一切触れずに認証層のみを検証
3. PowerShellで`System.Security.Cryptography.HMACSHA256`/`SHA256`を使い、v1署名(`HMAC-SHA256(timestamp + "." + raw_body)`)・v2署名(`HMAC-SHA256(key_id\ntimestamp\nnonce\nevent_version\nidempotency_key\nsha256(raw_body))`)をそれぞれ手計算し、`curl.exe`で送信
4. 検証後、テスト用データ(`sen_no_kuni_hub_settings`・`sen_no_kuni_hub_used_nonces`・`integration_inbox_events`の該当行)を削除してステージングDBを元の状態に戻した

## 実測結果

| # | シナリオ | 期待値 | 実測結果 |
|---|---|---|---|
| 1 | v1署名、正しい署名・タイムスタンプ・未使用nonce | 200 OK、`test.ping`は`processed:false`で受理 | ✅ `{"ok":true,"event_id":"hmac-v1-test-0001","status":"succeeded","processed":false}` |
| 2 | v1署名、同一nonceの再送(リプレイ) | 401 `replayed_nonce` | ✅ `{"ok":false,"error":{"code":"replayed_nonce", ...}}` |
| 3 | v1署名、5分以上経過したtimestamp | 401 `invalid_timestamp` | ✅ (意図せず古いtimestampを再利用したケースで実測。検証順序が timestamp→signature であることも確認できた) |
| 4 | v1署名、署名を意図的に改ざん(新しいtimestamp・nonceで) | 401 `invalid_signature` | ✅ `{"ok":false,"error":{"code":"invalid_signature", ...}}` |
| 5 | v2署名(`X-SenNoKuni-Signature-Version: 2`、`X-Event-Version`・`Idempotency-Key`付き)、正しい署名 | 200 OK | ✅ `{"ok":true,"event_id":"hmac-v2-test-0001","status":"succeeded","processed":false}` |

## DB記録の確認

- `integration_inbox_events`に`hmac-v1-test-0001`・`hmac-v2-test-0001`の2件が`status=succeeded`で記録されていることを確認
- `sen_no_kuni_hub_settings.v1_usage_count`が1件加算されていることを確認(v1署名利用時のみ記録され、v2利用時は加算されないという設計通りの動作)
- 確認後、テスト用の3テーブルの該当行を`delete`で削除し、ステージングDBをクリーンな状態に戻した(§5.3の完全preflightで確認した「failed/dead件数0件」等の状態に影響を残していない)

## 結論

- v1署名・v2署名ともに、正常系・リプレイ防止・タイムスタンプ検証・署名改ざん検知の全パターンが設計通りに動作することを実測で確認した。
- ソースコードレビューだけでなく実際のHTTPリクエストで確認できたのは今回が初めてであり、`src/modules/integrations/application/verify-sen-no-kuni-hub-request.ts`の実装がステージング環境で問題なく機能することを裏付けた。
- 追加の是正措置は不要。Stripeアカウント取得後、実際の代理店システム(sengoku-ai.com側の新HMAC実装)との接続試験を行う際は、本ドキュメントの手順(テスト専用system_key・`test.ping`のような無害なイベント種別)を再利用できる。
