# 千ノ国パスポート 全体統合対応 開発完了報告書

- 対象リポジトリ: `stockbusiness/sengokugacha`(戦国パスポート)
- 対象ブランチ: `claude/sengoku-economy-os-j0d2nl` → `main`(PR #98〜#104、squash merge)
- 根拠資料: `00_COMMON_INTEGRATION_CONTRACT.md`、`03_SEN_NO_KUNI_PASSPORT_INSTRUCTIONS.md`、`REFERENCE_SYSTEM_INTEGRATION_ANALYSIS_20260721.md`
- 実装計画: `/root/.claude/plans/jazzy-knitting-shore.md`(PR1〜PR8)

本書は`00_COMMON_INTEGRATION_CONTRACT.md` 12章「開発完了時の提出物」の12項目、および依頼時に指定された報告形式(実装内容・API変更・DB変更・接続テスト結果・未対応事項)の両方を満たす構成でまとめる。

---

## 1. 実装内容(サマリ)

依頼された5項目のうち、実装したものと見送ったものを明確に分ける。

| 依頼項目 | 対応状況 |
|---|---|
| `common_user_id` | 対応(既存実装を維持し、`common_user.merged`受信・バックフィル余地を追加) |
| 代理店情報 | 対応(4役モデルのうち`assigned_agency_id`/`sales_agent_id`/`closing_agent_id`を新設) |
| 紹介情報 | 対応(既存capture/confirmは維持。新規変更なし、経路の再確認のみ) |
| 権利付与API | 対応(新規HMAC連携`entitlement.granted/updated/revoked`) |
| 購入イベント受信 | 対応(`order.*`/`payment.*`、当面は記録のみ) |
| Stripe決済安全化(前提P0) | 対応(ユーザー合意の最小セットのみ) |

### PR一覧(全8件、すべてmain squash mergeで反映済み)

| PR | 内容 |
|---|---|
| PR1(#98) | Stripe安全化基盤: `stripe_webhook_events`・`grant_status`列・原子的残高更新関数2つ |
| PR2(#99) | Stripe Webhook再設計(pending→processing→completed)+原子関数の実結線 |
| PR3(#100) | 権利付与失敗の手動再実行UI(`/admin/purchases`) |
| PR4(#101) | `common_user.merged`/`common_user.assigned_agent.updated`ハンドラ、`users.assigned_agent_id` |
| PR5(#102) | 新規HMAC認証基盤(`sen-no-kuni-hub-auth.ts`、inbox/outbox、鍵管理テーブル) |
| PR6(#103) | 権利付与・取消API(`entitlement.*`、`entitlements`テーブル) |
| PR7(#104) | 購入・返金イベント受信(`shopping_order_events`)、`purchases.sales_agent_id`/`closing_agent_id` |
| PR8(本書) | ドキュメント更新・本報告書 |

---

## 2. API変更

### 2.1 既存API(変更なし)

以下はsengoku-ai.com側の実API(`EXTERNAL_DEVELOPER_GUIDE.md`で確認済み仕様)と接続済みのため、認証方式・エンドポイント・処理内容を**一切変更していない**(ユーザー指示による明示的な制約)。

- `POST /api/common-users/resolve`・`POST /api/referrals/capture`・`POST /api/referrals/confirm`(発信)
- `POST /api/integrations/agencies`(受信、`x-api-key`/`Bearer`認証) — ただし内部で`common_user.merged`/`common_user.assigned_agent.updated`の2イベントを新たに処理するようになった(認証方式・他イベントの処理は不変)
- `GET /api/hierarchy.php`(発信)
- 代理店SSO(`GET /agency/sso`、RS256/JWKS)

### 2.2 新規API

| エンドポイント | 認証 | 用途 |
|---|---|---|
| `POST /api/integrations/sen-no-kuni-hub` | `X-SenNoKuni-Key-Id`/`Timestamp`/`Nonce`/`Signature`(HMAC-SHA256) | `entitlement.granted`/`updated`/`revoked`、`customer.assignment.changed`、`order.created`/`paid`/`cancelled`、`payment.succeeded`/`failed`/`refunded`の受信 |
| `POST /api/admin/purchases/[id]/retry-grant` | 管理者Cookie(本部管理者限定) | 権利付与失敗(`grant_status='failed'`)した購入の手動再実行 |

`/api/integrations/sen-no-kuni-hub`のレスポンス形式は契約書13章相当の`{ ok: boolean, error?: { code, message } }`で統一している(既存`/api/integrations/agencies`の`{ success, message }`形式とは意図的に分離)。

---

## 3. DB変更

### 3.1 マイグレーション一覧

| ファイル | 内容 |
|---|---|
| `20260803000001_stripe_safety_p0.sql` | `stripe_webhook_events`(新規)、`purchases.status`に`'processing'`追加、`purchases.grant_status`/`grant_attempt_count`/`grant_last_error`/`granted_at`追加、`adjust_user_balance()`/`consume_gacha_ticket()`(Postgres関数) |
| `20260804000001_assigned_agent.sql` | `users.assigned_agent_id`追加 |
| `20260805000001_sen_no_kuni_hub_basis.sql` | `sen_no_kuni_hub_settings`・`sen_no_kuni_hub_used_nonces`・`integration_inbox_events`・`integration_outbox_events`(いずれも新規) |
| `20260806000001_entitlements.sql` | `entitlements`(新規) |
| `20260807000001_shopping_order_events.sql` | `purchases.sales_agent_id`/`closing_agent_id`追加、`shopping_order_events`(新規) |

### 3.2 down/rollback手順

本リポジトリには正式なdownマイグレーション機構が無い(既存の全マイグレーションが同様)。ロールバックが必要な場合は以下の手順を推奨する。

1. 新規テーブル(`stripe_webhook_events`、`sen_no_kuni_hub_settings`、`sen_no_kuni_hub_used_nonces`、`integration_inbox_events`、`integration_outbox_events`、`entitlements`、`shopping_order_events`)は`drop table`で削除可能(既存テーブルから参照されていないため、既存機能への影響なし)。
2. `purchases`への追加列(`grant_status`等、`sales_agent_id`/`closing_agent_id`)は`alter table purchases drop column ...`で削除可能。ただし`grant_status`削除前に、コード側(`src/app/api/stripe/webhook/route.ts`等)のロールバックが先に必要(列が無いとエラーになるため)。
3. `users.assigned_agent_id`も同様に`drop column`で削除可能。
4. `purchases.status`の`check`制約から`'processing'`を外す場合、既存データに`status='processing'`の行が残っていないことを確認してから制約を再定義すること。

### 3.3 既存カラム・既存データへの影響

すべて追加のみ(新規テーブル・nullable列)であり、既存カラムの型変更・既存データの書き換えは行っていない。

---

## 4. 接続テスト結果

### 4.1 自動テスト(全PR共通、都度実行)

- `rm -rf .next && npx tsc --noEmit` — 全PRでclean
- `npm run lint` — 全PRでclean(既知の2件の`<img>`警告のみ、無関係)
- `npx vitest run` — 全PRで69/69 pass(既存テストスイート。今回のスコープに新規ユニットテストは追加していない)
- `npm run build` — 全PRで成功

### 4.2 手動接続テスト

**未実施。** 本セッションの実行環境ではStripeテストモード(`stripe listen`/`stripe trigger`)、および新規HMACエンドポイントへの実リクエスト送信(署名の実際の往復確認)を行えない制約がある。以下は本番投入前に開発者側の環境で必須の確認事項。

- Stripe: `checkout.session.completed`の重複配信・順序逆転・途中失敗からの復旧、`stripe_webhook_events`の状態遷移
- `/api/admin/purchases/[id]/retry-grant`: `grant_status='failed'`の購入を意図的に作り、再実行で復旧すること
- `/api/integrations/sen-no-kuni-hub`: 自作署名でのcurl検証(正常系・不正署名・timestamp失効・nonceリプレイ・同一event_id+同一payload・同一event_id+異なるpayload)
- `/api/integrations/agencies`: `common_user.merged`/`common_user.assigned_agent.updated`受信で既存の代理店ライフサイクルイベント処理に影響が無いこと

---

## 5. Feature Flag一覧

明示的な環境変数フラグは追加していない。実質的な有効化制御は以下の通り。

| 項目 | 制御方法 |
|---|---|
| 新規HMAC連携(`/api/integrations/sen-no-kuni-hub`) | `sen_no_kuni_hub_settings`に該当`system_key`の行が無い、または`enabled=false`の場合は認証エラー(401)で拒否される。管理画面での鍵発行UIは未実装のため、現状はDBへ直接値を投入するまで実質的に無効 |
| `common_user.merged`/`assigned_agent.updated`受信 | 既存`/api/integrations/agencies`の認証(`agency_integration_settings`)が有効な場合のみ到達可能。新規の無効化スイッチは無い |
| 権利付与時の残高反映 | `entitlement_type`が`kokudaka`/`gacha_ticket`の場合のみ実効果。それ以外は台帳記録のみ(コード上のホワイトリストであり、DB設定では変更できない) |

---

## 6. 未確認事項・環境設定確認が必要な事項

- `sen_no_kuni_hub_settings`への実際の鍵投入(`system_key`・`key_id`・`hmac_secret`)は未実施。相手システム(ショッピング等)側の鍵発行状況の確認が必要
- 新規HMACエンドポイントの実データでの動作確認(4.2参照)
- Stripe本番環境での`stripe_webhook_events`運用開始後の初期状態確認(既存の稼働中Webhookとの競合が無いか)
- `entitlements`の`entitlement_type`と、送信元システムが実際に使う値の対応表(現状`kokudaka`/`gacha_ticket`のみ実装、それ以外の値は台帳記録のみ)
- `shopping_order_events`の`agency_id`/`sales_agent_id`/`closing_agent_id`は外部コード(文字列)のまま保存しており、`purchases.sales_agent_id`/`closing_agent_id`(ローカルFK)への反映ロジックは未実装(商品カタログ・注文ID対応関係が未確定のため)

---

## 7. 実環境でのみ確認可能な事項

- Stripe Webhookの実際の配信順序・タイミング(テストモードでも一部再現できるが、本番の負荷・タイミングは別)
- `sen_no_kuni_hub_settings`の`hmac_secret`が実際に相手システムと一致するかの疎通確認
- `common_user.merged`/`customer.assignment.changed`の実際のペイロード形式(特に`assigned_agent.updated`系はガイドに明示例が無いため、フォールバック実装の妥当性は実データで検証が必要)

---

## 8. ロールバック実施手順

各PRは独立してrevert可能な設計にしている(既存コードパスとは分離した新規追加が中心のため)。

1. 問題箇所を含むPRのsquash mergeコミットを`git revert`する
2. 該当PRで追加したマイグレーションを3.2の手順で個別にdropする(コードのrevert後に実施)
3. 特に`src/app/api/stripe/webhook/route.ts`(PR2)をrevertする場合は、`purchases.status`が`'processing'`のまま止まっている行が既に存在しないか確認してから行う(存在する場合は先にPR3の手動再実行で`completed`まで進めるか、個別に`status`を修正してからrevertする)

---

## 9. 既存機能への影響評価

| 機能 | 影響 |
|---|---|
| LINEログイン | 変更なし(触れていない) |
| ガチャ(無料・有料) | 有料ガチャのガチャ券消費のみ原子的更新に変更。抽選ロジック・排出率・演出は変更なし |
| 国取り | 変更なし |
| Stripe購入(kokudaka/gacha_ticket/land_plot) | 決済フローの内部状態遷移(pending→**processing**→completed)を変更。ユーザー向けの外部挙動(購入確認画面・付与結果)は変更なし |
| 代理店連携(sengoku-ai.com) | 認証方式・既存イベント処理は変更なし。新たに2イベント(`common_user.merged`/`common_user.assigned_agent.updated`)を処理するようになった |
| 返金処理 | 残高取消ロジックを原子関数経由に変更。ユーザー向けの外部挙動は変更なし |

---

## 10. 残存リスク

- **`/api/integrations/sen-no-kuni-hub`は未接続**: 鍵未発行のため実際のイベント受信実績が無い。初回接続時に想定外のペイロード形式(特に`customer.assignment.changed`)に遭遇する可能性がある(フォールバック設計により処理スキップ+ログ記録はされるが、実害調査は接続後に必要)
- **手動接続テスト未実施(4.2)**: 特にStripe Webhookの新フローは本番相当の負荷・タイミングでの検証がまだ無い
- **無料/有料ガチャの日次上限判定・武将重複数更新の競合**: `REFERENCE_SYSTEM_INTEGRATION_ANALYSIS`で指摘されているが、今回のP0最小セットには含まれていない(ユーザー合意済みのスコープ外)
- **ウォレット台帳への全面移行は未着手**: kokudaka/gacha_tickets/contribution_pointsは引き続き`users`テーブルの直接カラムであり、原子更新関数で競合は解消したが、独立した台帳(付与・取消・調整の追跡)にはなっていない
- **`entitlements`の商品カタログ未確定**: `kokudaka`/`gacha_ticket`以外の`entitlement_type`は台帳記録のみで実効果を持たない。実際の商品(パスポート会員権・城区画等)が来た場合は追加実装が必要

---

*関連ドキュメント: `docs/sengoku-passport-external-developer-guide.md`、`docs/sengoku-ai-external-developer-guide-diff-report.md`、`docs/sengoku-wallet-internal-touchpoints.md`、実装計画 `/root/.claude/plans/jazzy-knitting-shore.md`*
