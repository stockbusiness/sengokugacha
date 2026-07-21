# 千ノ国パスポート P0-2 テスト結果

## 各PRでの検証(全PR共通、全て通過)

| 検証項目 | コマンド | 結果 |
|---|---|---|
| 型検査 | `rm -rf .next && npx tsc --noEmit` | 全PRでエラーなし |
| Lint | `npm run lint` | 全PRで既存の`<img>`警告2件のみ(本作業とは無関係、`src/app/admin/(dashboard)/line-settings/page.tsx`と`src/components/map/JapanMap.tsx`) |
| 単体テスト | `npx vitest run` | PR-Fまでは既存69件が69/69 pass(新規テスト無し)。PR-Gで2ファイル追加、71/71 pass |
| ビルド | `npm run build` | 全PRで成功 |

## PR-Gで追加した自動テスト

本リポジトリにはDBモック基盤が無く(既存の`gacha-rate-tiers.test.ts`等と同じ制約)、Supabase呼び出しを含む関数は自動テスト化できない。そのため、P0-2で新設したロジックのうち**純粋関数として切り出せる部分のみ**を対象とした。

| テストファイル | 対象関数 | 内容 |
|---|---|---|
| `src/lib/agency-events.test.ts` | `isExplicitUnassignment()` | フィールドが明示的に`null`の場合のみ担当解除と判定すること、フィールド不在時は判定しないこと |
| `src/lib/integration-inbox.test.ts` | `computePayloadHash()` | 同一本文で同一ハッシュ、異なる本文で異なるハッシュ、空白差異にも反応すること(パース後JSON比較ではなく生バイト比較であることの確認) |

## 自動テストで確認できていない項目(§11相当、DB/実接続が必要なため未実施)

以下は本セッションのサンドボックス環境では実施できず、`IMPLEMENTATION_STATUS_P0_2.md`で「5. 実環境確認待ち」としている項目と対応する。

- **購入権利付与の冪等性**: 同一購入に対する`runPurchaseGrant()`の重複呼び出しで残高が二重付与されないこと(ステップ単位のスキップが正しく機能すること)
- **権利付与再実行の排他制御**: 同時に複数の再実行リクエストが送られた場合、1件のみが処理され、他は`409 grant_already_processing`になること
- **entitlement付与/取消の冪等性・順序逆転**: `entitlement.granted`の重複配信、`entitlement.revoked`が`entitlement.granted`より先に届くケース
- **integration_inbox_eventsの並行claim**: 同一`event_id`への同時リクエストのうち1件のみが`new`を得ること、10分超`processing`のまま止まった行が再claimされること
- **HMAC認証のエッジケース**: 不正署名、timestamp失効、nonceリプレイ、`X-Event-Version`未対応バージョン、`Idempotency-Key`と`body.event_id`の不一致
- **既存機能への回帰確認**: LINEログイン・ガチャ・国取り・Stripe購入・代理店連携(sengoku-ai.com)がP0-2の変更によって影響を受けていないこと

これらはいずれも`/api/integrations/sen-no-kuni-hub`が未接続(鍵未発行)であることに起因し、実接続確認時に別途実施する必要がある。Stripe関連の項目のみ、Stripeテストモード+Stripe CLI(`stripe listen`/`stripe trigger`)を使ったローカル・テスト環境での確認が可能(全体統合対応時点から未実施のまま持ち越し)。
