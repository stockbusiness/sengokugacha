# Passport 作業前確認レポート（5システム版）

- 作成日: 2026-08-20
- 準拠指示書: `00_5SYSTEM_EXECUTION_ORDER_20260820.md` / `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` / `99_CORRECTION_NOTICE_5SYSTEM_20260820.md`
- 旧4システム版は破棄し、本5システム版を正として調査した。

## 0. 本レポート作成時点で行っていないこと

指示どおり、以下は一切行っていない。

| 禁止事項 | 実施有無 |
|---|---|
| コード変更 | 行っていない |
| ブランチ作成 | 行っていない（既存ブランチのみ使用） |
| DBマイグレーションの作成・適用 | 行っていない |
| 本番・ステージングのデータ変更 | 行っていない |
| 機能フラグ・環境変数の変更 | 行っていない |
| 既存履歴・報酬・注文・権利データの削除／修正 | 行っていない |
| マージ・デプロイ | 行っていない |

本レポート（Markdown 1ファイル）の追加のみを行った。秘密値（鍵・パスワード・トークン・シークレット）は一切記載していない。

---

## 1. 対象リポジトリ、現在のブランチ、最新コミット

| 項目 | 値 |
|---|---|
| Repository | `stockbusiness/sengokugacha` |
| 現在のブランチ | `claude/sengoku-economy-os-j0d2nl` |
| 最新コミット (HEAD) | `d38ce50` `docs(passport): 安全化指示書の作業前確認レポート` |
| `origin/main` | `d17efb4` |
| 指示書の監査基準Commit | `d16b9d77dc7496902118d140a8b482de1f411448` |
| 使用DB | Supabase（PostgreSQL）。ORMなし。全アクセスは `createSupabaseServerClient()`（service role）経由 |

### 1.1 監査基準コミットとの差分（重要）

指示書の監査基準 `d16b9d7` は**「はじまりの旅」がマージされる前**の状態である。現在はそこから5コミット進んでいる。

| コミット | 内容 | 指示書との関係 |
|---|---|---|
| `af97e95` | 「はじまりの旅」ミッション基盤（DB 11テーブル） | 実施順序書 §3-8「最後に実装」より**先行**している |
| `f5581e2` | 「はじまりの旅」参加者画面 | 同上 |
| `ac7724d` | 「はじまりの旅」管理画面 | 同上 |
| `d17efb4` | 上記のmainマージ | — |
| `36cb030` | マイグレーション適用漏れの運用監視（PR #164、未マージ） | 指示書外の運用改善 |

**現状の「はじまりの旅」は実装済みだが稼働していない。** 機能フラグ4つがすべて `false` 既定、コース登録0件、報酬は `learning_journey_reward_requests` に `PENDING` 記録を作るのみで Wallet への送信アダプタは未実装。3,000 OVE の実付与経路は存在しない。

→ **質問 Q1**（後述）で扱いの承認を求める。

## 2. 未コミットの変更有無

**なし。** `git status --short` は本レポートの新規ファイルのみを出力する。stash・未追跡の作業ファイルもない。

---

## 3. 指示書と現在の実装との差分

### PR-P1: 旧コミッション・支払機能の新規書込み停止

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| 既存の設定機構に書込み停止フラグを追加、既定は停止 | **停止フラグは存在しない** | 全て新規 |
| サービス層で一括ガード | ガードなし。各APIルート／`src/lib/castle-commissions.ts` が直接書込む | 全て新規 |
| 停止中は管理画面を履歴参照専用にし「Agencyへ移管済み／新規計上停止中」を表示 | 表示なし。管理画面は編集可能 | 全て新規 |
| APIは削除せず機械判定可能なエラーコードを返す | 現状のエラー応答は `{ error: "…" }` の日本語文字列のみで、**機械判定可能な `code` を持たない** | 新規（エラー形式の追加が必要） |
| 既存履歴・確定額・支払記録を保持 | 保持されている | 差分なし |

### PR-P2: Entitlement適用範囲の制限

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| 適用できる権利種別を明示的なallowlistに | `process_entitlement_grant()` 内の `case` 式で `kokudaka`→`users.kokudaka`、`gacha_ticket`→`users.gacha_tickets`、**`else null`** の**暗黙のallowlist**が既に存在 | 「明示化」と「意図の記録」が不足 |
| NFT作品・シリアル・未知種別をローカル残高へ適用しない | **既に適用されない**（`v_column is null` の分岐で台帳記録のみ） | **受入条件は現時点で既に満たされている** |
| 未知イベントは受信記録と理由を残す | 受信記録は `integration_inbox_events` と `entitlements` に残るが、**「残高非適用と判定した理由」は残らない** | 新規 |
| 再送で重複適用しない | `entitlements` の `unique (source_system_key, entitlement_id)` と `claim_entitlement_application()` の原子的claimで担保済み | 差分なし |
| 商品所有者マップをコードまたは設定に置く | **存在しない** | 全て新規。5システム版では**4値**（Passport / Wallet / `sengokumarket` / `sennokunnft`）を区別する必要がある |

### PR-P3: OVE誤表示の解消

現状は指示書が想定するより軽度だが、問題は実在する。

`src/components/economy/OveWalletCard.tsx` の実装:

- ラベルは `"OVE移行予定ポイント"` + `"(準備中)"`、単位は `pt`（`"OVE"` 単独表記ではない）
- 注意書き「このポイントは現在、暗号資産ウォレットの残高ではありません。外部送金・換金はできません。将来のOVEへの移行条件・換算率は未確定です。」を常時表示
- **値は `users.contribution_points` を 1:1 でそのまま表示**（`src/app/(app)/page.tsx:193` が `economy.contribution.total` を渡す）

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| `contribution_points` の1:1 OVE表示を廃止 | 1:1表示が**存在する** | 要修正 |
| Wallet未接続時は「国家貢献ポイント」表記またはカード非表示 | 「OVE移行予定ポイント」表記。**同じ値が同一画面の `ContributionCard` で「国家貢献ポイント」としても表示され、1つの数値が2つの名前で並んでいる** | 要修正 |
| Wallet接続時のみWallet残高を「OVE」表示 | **Wallet APIクライアントは存在しない**（`src/lib` に wallet 実装なし） | PR-P3の範囲では接続しない前提として設計のみ |
| タイムアウト時に前回値を確定表示しない | 取得処理自体が無いため該当なし | 該当なし |

### PR-P4: 管理画面認証の安全化

`src/lib/admin-session.ts`:

```
return payload.adminRole === "operator" ? "operator" : "manager";
```

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| roleなし旧Cookieのmanagerフォールバック廃止 | **フォールバックが存在する**。`adminRole` クレームが無いCookieは `manager` として扱われる（Cookie有効期間は12時間） | 要修正 |
| 自己申告名でなく認証済み管理者IDを監査ログに記録 | `getAdminActorName()` はログイン時の**任意入力文字列**を返す。監査ログの `actor_name` はこれ | 要修正（個別アカウント基盤が前提） |
| 共有パスワードから個別アカウントへの互換期間 | 共有パスワード2本（`ADMIN_PASSWORD` / `ADMIN_PASSWORD_OPERATOR`）のみ。個別アカウント基盤なし | 全て新規（規模大） |

---

## 4. 関連機能の実装場所と書込み経路

### 4.1 `commission_rule_sets` への書込み

| # | 経路 | ファイル |
|---|---|---|
| 1 | `POST /api/admin/commission-rule-sets`（新規作成） | `src/app/api/admin/commission-rule-sets/route.ts:39` |
| 2 | `PATCH /api/admin/commission-rule-sets/[id]`（更新） | `src/app/api/admin/commission-rule-sets/[id]/route.ts:43,66` |
| 3 | `DELETE /api/admin/commission-rule-sets/[id]`（削除） | `src/app/api/admin/commission-rule-sets/[id]/route.ts:76` |
| 4 | `POST /api/admin/commission-rule-sets/[id]/publish`（公開） | `src/app/api/admin/commission-rule-sets/[id]/publish/route.ts:32` |

補助: `src/lib/commission-rule-sets.ts`（読み取り＋公開版解決）

### 4.2 `commission_ledger` への書込み（4経路）

| # | 経路 | 実装 | 起点 |
|---|---|---|---|
| 1 | **新規計上（insert）** | `postLandSaleCommission(purchaseId)` — `src/lib/castle-commissions.ts:23`、insertは `:105` | `runPurchaseGrant()` の `commission_posted` ステップ（`src/modules/commerce/application/run-purchase-grant.ts:199`）。**`item_type === "land_plot"` のStripe決済確定後に自動実行される** |
| 2 | 確定（`status='confirmed'`） | `confirmMaturedCommissions()` — 同 `:112`、update `:129` | `POST /api/admin/commission-ledger/confirm-matured` |
| 3 | 返金取消（`status='reversed'` + `commission_adjustments` insert） | `applyRefundAdjustments()` — 同 `:146`、update `:191`、insert `:206,225,244` | `POST /api/admin/purchases/[id]/refund` |
| 4 | 支払済み化（`status='paid'`, `payout_id`, `paid_at`） | `POST /api/admin/payouts` — `src/app/api/admin/payouts/route.ts:69` | 同ルート |

**PR-P1の中心は経路1（`postLandSaleCommission()`）である。** これだけが利用者操作（Stripe決済）を起点に自動で新規行を作る。経路2〜4は既存行の状態遷移であり、指示書「既存確定額・既存支払記録は保持する」との切り分けが必要（→ 質問 Q3）。

読み取り専用（ガード不要）: `src/lib/castle-kpi.ts:74,120,160`、`GET /api/admin/commission-ledger`、`GET /api/admin/commission-ledger/payable-recipients`

### 4.3 `payouts` への書込み

| # | 経路 | ファイル |
|---|---|---|
| 1 | `POST /api/admin/payouts`（支払記録作成、manager限定） | `src/app/api/admin/payouts/route.ts:54` |

### 4.4 指示書に明記されていない隣接テーブル（要判断）

`commission_rule_sets` / `commission_ledger` / `payouts` の3つ以外に、Agencyと責任が重複しうるテーブルが2つ存在する。

| テーブル | 書込み経路 | 性質 |
|---|---|---|
| `commission_adjustments` | `applyRefundAdjustments()` から insert | `commission_ledger` の返金調整明細。台帳と一体 |
| `agent_sales` | `recordAgentSaleStep()` → Postgres関数 `record_purchase_agent_sale()`（`run-purchase-grant.ts:206`）。**`kokudaka`/`gacha_ticket` 購入時に代理店の販売実績を記録**（金額計算はしない、記録のみ） | 「担当代理店」は5システムSoTでAgencyの正本 |

→ 質問 Q4 で扱いを確認する。

### 4.5 purchase / external order / Stripe / entitlement の全ルートと対象商品種別

**Passport自身が販売する商品（Stripe決済、正本はPassport）**

| 商品種別 (`purchases.item_type`) | 決済導線 | 残高への効果 | コミッション |
|---|---|---|---|
| `kokudaka`（国高） | `POST /api/purchase/checkout` | `users.kokudaka` 加算 | なし（`agent_sales` 記録のみ） |
| `gacha_ticket`（ガチャチケット） | `POST /api/purchase/checkout` | `users.gacha_tickets` 加算 | なし（`agent_sales` 記録のみ） |
| `land_plot`（城区画・土地） | `POST /api/purchase/castle-plot-checkout` | 残高操作なし。`castle_plots` の所有権を確定 | **`commission_ledger` に新規計上** |

- Stripe Webhook: `POST /api/stripe/webhook`（署名検証のみ → `processStripeWebhookEvent()`）。Stripeキーは `payment_settings` テーブル管理。
- 管理: `GET/POST /api/admin/purchases`、`/api/admin/purchases/[id]`、`/refund`、`/retry-grant`、`/api/admin/payment-settings`

**外部注文（銀行振込等の手動計上、正本はPassport）**

- `external_order_items.product_type` は **`check (product_type in ('land_plot'))`** で `land_plot` のみ
- ルート: `/api/admin/external-orders`（`[id]`, `/cancel`, `/confirm-payment`, `/evidence`, `/grant-rights`, `/link-user`, `/unlink-user`, `/assignable-plots`）、`/api/admin/external-order-items`（`[itemId]`, `/assign-plot`, `/cancel`）、`/api/admin/external-order-plot-assignments`
- **外部注文経路は `commission_ledger` に一切書込まない**（`grant-rights` に commission 呼び出しなし）。Stripe経路のみが計上する。

**外部システムからのEntitlement受信（正本は送信元）**

- 受信口: `POST /api/integrations/sen-no-kuni-hub`（HMAC認証、`src/lib/sen-no-kuni-hub-auth.ts`）
- 扱うイベント: `entitlement.granted` / `entitlement.updated` / `entitlement.revoked` / `customer.assignment.changed` / `order.created` / `order.paid` / `order.cancelled` / `payment.succeeded` / `payment.failed` / `payment.refunded`
- `order.*` / `payment.*` は **`shopping_order_events` への監査記録のみ**（商品カタログ・注文ID体系が未確定のため。ルート内コメントに明記）
- `entitlement_type` は自由文字列。既定値 `"generic"`（`src/modules/entitlements/application/grant-entitlement.ts:16`）
- 残高への実効果は `process_entitlement_grant()`（最新版 `supabase/migrations/20260810000001_…`）が決める:

```sql
v_column := case v_entitlement.entitlement_type
  when 'kokudaka'     then 'kokudaka'
  when 'gacha_ticket' then 'gacha_tickets'
  else null
end;
```

`v_column` が null の場合は台帳記録のみで `application_status='applied'` になる。**したがってNFT作品・シリアル・会員権・評議員権などを受信しても国高・ガチャチケットは変化しない。**

- 管理: `/api/admin/entitlements`、`/[id]`、`/[id]/dismiss`、`/retry-resolve`、`/unresolved`

**もう1つの受信口（旧チャネル）**

- `POST /api/integrations/agencies`（APIキー認証、`sengoku-ai.com` 専用）。`sen-no-kuni-hub` とは認証方式・処理内容ともに独立。

### 4.6 OVE表示コンポーネントと値の取得元

| コンポーネント | 表示ラベル | 値の取得元 |
|---|---|---|
| `src/components/economy/OveWalletCard.tsx` | 「OVE移行予定ポイント(準備中)」 + `pt` | `economy.contribution.total` = `users.contribution_points`（`src/lib/user-activity.ts:53,62`）。**1:1** |
| `src/components/economy/ContributionCard.tsx` | 「国家貢献ポイント」/「総国家貢献」 | 同じ `users.contribution_points` |
| `src/components/dashboard/NationalIdCard.tsx` | 「国家貢献ポイント」 | 同じ |
| `src/app/(app)/journey/progress/page.tsx` | 「はじまりの旅」の獲得予定OVE | `learning_journey_*` の集計。**未稼働（フラグOFF・コース0件）** |

`users.contribution_points` への加算元は `src/lib/user-activity.ts:37` の `adjustUserBalance(userId, "contribution_points", point)`（ガチャ・寺子屋等の活動記録と同時）。

**Wallet APIクライアントは存在しない。** `src/lib` 配下に Wallet 呼び出し実装はない。

---

## 5. 本番・ステージングの機能フラグと設定状態

### 5.1 環境変数（14個。うち機能ON/OFFに使うものは0個）

| 変数名 | 用途 | 値 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase接続 | 非機密だが記載省略 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB接続（service role） | **秘密値のため記載しない** |
| `SESSION_SECRET` | セッションJWT署名 | **秘密値のため記載しない** |
| `ADMIN_PASSWORD` | 管理者（manager）共有パスワード | **秘密値のため記載しない** |
| `ADMIN_PASSWORD_OPERATOR` | 管理者（operator）共有パスワード | **秘密値のため記載しない** |
| `CRON_SECRET` | 内部cron認証 | **秘密値のため記載しない。ただし未設定と報告済み（下記5.3）** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | エラー監視 | 記載省略 |
| `GACHA_VIDEO_MAX_BYTES` / `GACHA_VIDEO_MAX_DURATION_SECONDS` | 動画上限 | 数値上限。機能フラグではない |
| `METAVERSE_VIDEO_MAX_BYTES` / `METAVERSE_VIDEO_MAX_DURATION_SECONDS` | 同上 | 同上 |
| `NODE_ENV` / `NEXT_RUNTIME` | ランタイム | Next.js標準 |

**環境変数で機能をON/OFFする仕組みは1つも無い。** 機能フラグはすべてDBの設定テーブルにある。

### 5.2 設定テーブルのフラグ（8テーブル）

| テーブル | フラグ列 | 既定値 |
|---|---|---|
| `agency_integration_settings` | `bidirectional_sync_enabled` / `sso_enabled` | `false` / `false` |
| `ai_image_settings` | `enabled_for_warlords` / `enabled_for_metaverse` / `adopted` | `true` / `true` / `false` |
| `castle_lord_plan_settings` | `retroactive_payout_enabled` | `false` |
| `learning_journey_settings` | `missions_enabled` / `rewards_enabled` / `consultation_sync_enabled` / `line_notifications_enabled` | すべて `false` |
| `metaverse_tour_settings` | `consent_personal_info` / `consent_agent_share` | `false` / `false` |
| `sen_no_kuni_hub_settings` | `enabled`（`system_key` ごと） | **`true`** |
| `line_settings` | boolean列なし | — |
| `payment_settings` | boolean列なし。Stripeキー3種を保持 | — |

**コミッション・支払の書込みを止めるフラグは存在しない。** PR-P1で新設が必要。

### 5.3 「実際に有効になっている値」について（重要な制約）

上記は**マイグレーション定義上の既定値**である。**本番・ステージングDBの実際の行の値は、このセッションからは確認できない**（DBへの読み取り接続を持たない）。

特に次の3点は運用者による実値の確認が必要:

1. `sen_no_kuni_hub_settings` に**どの `system_key` が登録され、`enabled=true` になっているか**。`enabled` の既定が `true` のため、登録済みの全システムが entitlement を送信できる状態にある。5システム版では `sengokumarket` と `sennokunnft` の2つが登録されている可能性がある（→ 質問 Q5）
2. `learning_journey_settings` の4フラグが本当に全て `false` のままか
3. `payment_settings` が本番Stripeキーで運用されているか（値そのものは不要。**設定済みか否かだけ**を確認したい）

### 5.4 既知の運用上の欠落（前回報告済み・未解決）

`CRON_SECRET` が Vercel に未設定のため、`/api/internal/cron/*`（outbox自動再送・reconciliation）が認証で弾かれ**停止している**。PR-P1〜P4の前提ではないが、Outbox滞留検知（実施順序書 §5）に直接影響する。

---

## 6. DBマイグレーションの適用状況と追加変更の必要性

### 6.1 適用状況

| 項目 | 値 |
|---|---|
| リポジトリ内のマイグレーション総数 | **82本** |
| `src/lib/expected-migrations.ts` の期待値 | **82件**（ディスクとの一致をCIテストで担保） |
| ステージングに適用済みと確認できている数 | **81本**（`20260816000001_applied_migration_versions.sql` のみ未適用） |

このリポジトリは `supabase db push` を使わず、**SQL Editorでの手動適用 + `supabase_migrations.schema_migrations` への手動INSERT**という運用である。CIの migration-test は毎回まっさらなDBへ全件を流すため、**この運用でのスキップは構造的に検知できない**。

実際に 2026-08-20 に事故が発生した: `20260814000001_castle_plot_sales_hooks.sql` が飛ばされ `20260815000001` だけが適用されていたため、問い合わせ送信・問い合わせ一覧・管理画面の3機能が本番で失敗していた。適用済み記録は81件に是正済み。

PR #164（`36cb030`、CI green、**未マージ**）はこの検知機構であり、`20260816000001` は**未適用**である。

### 6.2 追加変更の必要性

| PR | DB変更 | 内容 | 型 |
|---|---|---|---|
| PR-P1 | **必要** | 書込み停止フラグの保存先。既存の設定テーブル群に該当するものが無いため新規テーブル1本（例: `commission_write_settings`、`land_sale_commission_write_enabled boolean not null default false` 等）を提案 | 追加型のみ |
| PR-P2 | **必要** | 「残高非適用と判定した理由」の記録列（`entitlements` への追加列 or 判定記録テーブル）＋商品所有者マップ（`owner_system_key` の台帳） | 追加型のみ |
| PR-P3 | **不要** | 表示層のみの変更 | — |
| PR-P4 | 段階次第 | フォールバック廃止だけならDB変更不要。個別管理者アカウント基盤まで作るなら新規テーブルが必要 | 追加型のみ |

いずれも**既存テーブル・列・履歴の削除や変更は行わない**（実施順序書 §4「DB変更は追加型を原則とし、既存テーブル・履歴を削除しない」に準拠）。

---

## 7. 他システムとのAPI・認証・イベント契約

### 7.1 受信（他システム → Passport）

| 経路 | 認証 | 冪等性 | 状態 |
|---|---|---|---|
| `POST /api/integrations/sen-no-kuni-hub` | HMAC-SHA256。`X-SenNoKuni-*` 系ヘッダー＋nonceワンタイム（`sen_no_kuni_hub_used_nonces` のunique制約でリプレイ防止）。鍵は `sen_no_kuni_hub_settings` に `system_key` 単位で保持 | `integration_inbox_events` の `unique (source_system_key, event_id)` ＋原子的claim。`Idempotency-Key` ヘッダーと `body.event_id` は両方あれば一致必須 | **実接続前** |
| `POST /api/integrations/agencies` | APIキー（`agency_integration_settings`）。`sengoku-ai.com` 専用の旧チャネル | 別実装 | 稼働中 |

- `X-Event-Version` ヘッダー必須。サポートは **`"1.0"` のみ**（`src/modules/integrations/domain/event-envelope.ts`）
- `body.source_system_key` があればHMAC認証済みの `identity.systemKey` との一致を要求

### 7.2 送信（Passport → 他システム）

| 仕組み | 状態 |
|---|---|
| `integration_outbox_events`（`target_system_key`, HMAC署名付き送信の基盤） | **基盤のみ。実際の送信先はまだ無い** |
| `purchase_outbox`（`target_system_key` 既定 `'line'`） | LINE通知用。稼働中だが `CRON_SECRET` 未設定で自動再送が停止中 |

### 7.3 5システム境界に関する契約上の状態

- Passportのコードには **`sengokumarket` / `sennokunnft` という識別子は一切存在しない。** 実装上の結合はゼロ
- 唯一の関連は `external_links` テーブル（`20260707000003_external_links.sql`）で、AIアート教室・NFTマーケット・`advisor_program`（評議員募集）への**送客URLを保持するだけ**。データ連携はない
- したがって指示書 §2.1「2つのマーケットの境界」は、Passport側では **`sen_no_kuni_hub_settings.system_key` の登録内容と、PR-P2の商品所有者マップの設計**という形でのみ現れる

### 7.4 OVEW Wallet との契約（既確認事項）

前回調査（`docs/WALLET_INTEGRATION_ANSWERS_20260820.md`）で確定済み:

- 認証はHMAC-SHA256だが**ヘッダー名がsen-no-kuni-hubと異なる**（`X-OVE-Api-Key` / `Timestamp` / `Nonce` / `Signature`、許容ずれ ±5分）
- `idempotency_key` は**ヘッダーではなくボディ**に置く
- ユーザー解決は `service_code` + `external_user_id`。**`common_user_id` は使わない**
- **取引履歴取得APIは存在しない**
- Passport用の `service_integrations` レコードは**未発行**

指示書のテスト項目に「重複common_user_id時の表示」とあるが、**Wallet APIは `common_user_id` を受け付けない**ため、この項目は現契約では成立しない（→ 質問 Q7）。

---

## 8. 不明点、不整合、重複機能、不要と思われる機能

### 8.1 不整合

| # | 内容 |
|---|---|
| A | **5システムSoT表に「土地・城区画」が無い。** Passportは `land_plot` を自前のStripeで販売し（`/api/purchase/castle-plot-checkout`）、`castle_plots` を権利の正本として持ち、`commission_ledger` に報酬を計上している。この販売自体がPassportの責任なのか、戦国マーケットへ移すのかが指示書から読み取れない。**PR-P1のスコープを直接左右する** |
| B | 指示書は「`contribution_points` を1:1でOVEとして表示」と書くが、実際のラベルは「OVE移行予定ポイント(準備中)」で、暗号資産残高ではない旨の注意書きが常時出ている。問題（1:1・二重名称）は実在するが、想定より軽度 |
| C | 指示書のテスト項目「重複common_user_id時の表示」が、Wallet実装（`service_code` + `external_user_id`）と噛み合わない（7.4） |
| D | 監査基準 `d16b9d7` が「はじまりの旅」マージ前で、実施順序書 §3-8 の順序と実装状況が食い違っている（1.1） |

### 8.2 重複機能（Agencyとの責任重複）

| 機能 | Passport側の実装 | 5システムSoT上の正本 |
|---|---|---|
| コミッション計算・台帳 | `commission_rule_sets` / `commission_ledger` / `commission_adjustments` / `src/modules/castle/domain/commission-engine.ts` | Agency |
| 支払記録 | `payouts` | Agency |
| 代理店販売実績 | `agent_sales` | Agency（担当代理店） |
| 紹介コード・紹介帰属 | `users.referring_agent_id`、`src/lib/client/referral-code.ts`、`resolveAgentIdByReferralCode()` | Agency（紹介者・紹介セッション） |

指示書が名指ししているのは上3テーブルのみで、`commission_adjustments`・`agent_sales`・紹介帰属は言及がない。

### 8.3 不要と思われる機能（削除は提案しない、判断を仰ぐ）

| 機能 | 理由 |
|---|---|
| `integration_outbox_events` | 「基盤のみで実際の送信先はまだ無い」とコード内コメントにある。5システム版ではAgency向け送信で使う可能性があるため**残すべき**と考える |
| `shopping_order_events`（`order.*`/`payment.*` の監査記録のみ） | 2つのマーケットが正本を持つなら、Passportがこれを受ける必要があるか要確認 |
| `sen_no_kuni_hub_settings.enabled` の既定 `true` | 新規system_key登録が即座に有効になる。**既定 `false` の方が安全**だが、既存行への影響があるため独断で変えない |

### 8.4 質問事項（独自判断せず、回答をお願いしたい）

| # | 質問 | これが決まらないと決められないこと |
|---|---|---|
| **Q1** | 実装済み・フラグOFFの「はじまりの旅」の扱い。**フラグOFFのまま凍結**（推奨）／機能を無効化するコードを追加／そのまま放置 のいずれか | PR分割案の前提 |
| **Q2** | **土地・城区画の販売はPassportの責任か、戦国マーケットへ移管するか。**（8.1-A） | PR-P1で `postLandSaleCommission()` を止めた後、土地販売の報酬をどこが計上するか |
| **Q3** | PR-P1で止めるのは「新規計上（insert）」だけか、既存行の状態遷移（確定・返金取消・支払済み化）も止めるか。**指示書は「新規書込み停止」と「既存確定額・支払記録は保持」の両方を書いており、確定・支払という運用操作の扱いが読み取れない** | ガードの適用範囲 |
| **Q4** | `commission_adjustments` と `agent_sales` もPR-P1の停止対象に含めるか（8.2） | ガードの適用範囲 |
| **Q5** | `sen_no_kuni_hub_settings` に現在登録されている `system_key` の一覧（値は不要、キー名のみ）。`sengokumarket` / `sennokunnft` は登録済みか | PR-P2の商品所有者マップの初期値 |
| **Q6** | PR-P2の商品所有者マップの粒度。`entitlement_type` 単位か、`source_system_key` 単位か、商品コード単位か。**指示書 §2.1 は「商品コード台帳に `owner_system_key` を必須化」と書くが、その台帳の正本がどのシステムかが不明** | PR-P2のDB設計 |
| **Q7** | Wallet契約と指示書テスト項目の齟齬（7.4）。テスト項目を実契約に合わせて読み替えてよいか | PR-P3のテスト設計 |
| **Q8** | PR-P1の停止中に土地販売が発生した場合、**報酬記録が一切残らない期間が生じる**。（a）記録なしで運用しAgency稼働後に手動で遡及、（b）計上はせず「未計上イベント」だけを別テーブルに残す、（c）土地販売自体を停止、のいずれか | PR-P1の設計の中核 |
| **Q9** | PR-P4の共有パスワード→個別アカウント移行を今回の範囲に含めるか。**フォールバック廃止だけなら小規模だが、個別アカウント基盤は別プロジェクト規模になる** | PR-P4のスコープ |

---

## 9. PRの分割案

実施順序書 §4「1つのPRに『停止』『契約追加』『運用画面』など異なる目的を混在させない」に従い、指示書の4PRを**6PRに細分化**することを提案する。

| # | PR | 目的（単一） | DB変更 | 前提となる回答 |
|---|---|---|---|---|
| 1 | **PR-P3** OVE表示の是正 | 表示 | なし | Q7 |
| 2 | **PR-P2a** Entitlement allowlistの明示化と非適用理由の記録 | 停止／境界 | 追加型（記録列） | Q5 |
| 3 | **PR-P2b** 商品所有者マップ（4値: Passport / Wallet / `sengokumarket` / `sennokunnft`） | 契約追加 | 追加型（台帳） | Q5, Q6 |
| 4 | **PR-P1a** コミッション・支払の書込み停止フラグとサービス層ガード | 停止 | 追加型（設定テーブル） | Q2, Q3, Q4, Q8 |
| 5 | **PR-P1b** 管理画面の履歴参照専用化と「Agencyへ移管済み／新規計上停止中」表示 | 運用画面 | なし | PR-P1a完了後 |
| 6 | **PR-P4** 管理Cookieのmanagerフォールバック廃止 | 認証 | なし（範囲次第） | Q9。指示書どおりP1完了後 |

### 9.1 着手順を PR-P3 から提案する理由

指示書の番号順は P1 → P2 → P3 → P4 だが、**PR-P3 を最初に置くことを提案する**。

- PR-P3 はDB変更も外部契約も無く、他システムの状態に依存しない**唯一のPR**であり、Q1〜Q6の回答を待たずに着手できる
- PR-P1 は Q2・Q3・Q4・Q8 の運用判断が確定するまで設計できない
- PR-P2 は Q5・Q6（他システムの登録状況・台帳の正本）が確定するまで設計できない

**回答を待つ間にPR-P3だけを進める**ことで、承認待ちの時間を無駄にしない。番号順を厳守すべきであれば、その旨をご指示いただきたい。

---

## 10. 各PRの影響範囲、テスト方法、ロールバック方法

### PR-P3: OVE表示の是正

| 項目 | 内容 |
|---|---|
| 影響範囲 | `src/components/economy/OveWalletCard.tsx`、`src/app/(app)/page.tsx`。**参加者のトップ画面の表示のみ。** DB・API・他システムへの影響なし |
| 想定される影響 | 「OVE移行予定ポイント」カードが消えるか名称が変わるため、利用者から「ポイントが無くなった」という問い合わせが起きうる。値自体（`users.contribution_points`）は一切変更しない |
| テスト方法 | ドメイン関数の単体テスト（vitest）＋ローカルでの画面確認。既存の `ContributionCard` の表示が変わらないことの確認 |
| ロールバック | コードのrevertのみ。データ変更が無いため副作用なし |

### PR-P2a: Entitlement allowlist明示化

| 項目 | 内容 |
|---|---|
| 影響範囲 | `process_entitlement_grant()`（SQL関数の `create or replace`）、`entitlements` への追加列 |
| 想定される影響 | **残高への実効果は現状と同一**（既に `kokudaka`/`gacha_ticket` のみ）。挙動を変えず「意図の明示」と「理由の記録」を足すため、リスクは低い |
| テスト方法 | ローカルPostgreSQL 16へ全82本を適用し、許可済み／NFT／未知／重複／順序逆転の5パターンで残高が期待どおりになることをSQLで検証（前回同様の手順） |
| ロールバック | 旧版の `process_entitlement_grant()` を `create or replace` で戻す。追加列は削除しない（指示書のロールバック方針に準拠） |

### PR-P2b: 商品所有者マップ

| 項目 | 内容 |
|---|---|
| 影響範囲 | 新規台帳テーブル＋参照コード。**判定に使うだけで、既存処理の分岐は変えない**設計を提案（変えるなら別PR） |
| 想定される影響 | 追加のみのため既存機能への影響なし |
| テスト方法 | ドメイン関数の単体テスト。4値すべてと未知値の判定 |
| ロールバック | 参照コードのrevert。テーブルは残す |

### PR-P1a: 書込み停止フラグとサービス層ガード

| 項目 | 内容 |
|---|---|
| 影響範囲 | **最も広い。** `src/lib/castle-commissions.ts` の3関数、`/api/admin/commission-rule-sets` 系4ルート、`/api/admin/payouts`、`/api/admin/commission-ledger/confirm-matured`、`/api/admin/purchases/[id]/refund`、および `runPurchaseGrant()` の `commission_posted` ステップ |
| 想定される影響 | **(1) 土地販売時に報酬が計上されなくなる**（Q8の判断が必要）。**(2) `runPurchaseGrant()` の `commission_posted` ステップが「停止」を返す設計にしないと、購入処理全体が失敗する恐れがある。** 実施順序書 §4「同期API失敗で購入や返金を失敗させない」に従い、停止は**成功扱いのスキップ**として実装する必要がある。**(3)** 管理者の確定・支払操作が拒否される（Q3次第） |
| テスト方法 | ①フラグOFFで各書込みAPIが機械判定可能なエラーコードを返すこと ②フラグOFFでも `runPurchaseGrant()` が完走し `purchases` が `completed` になること ③既存履歴の参照・CSV出力・KPI集計が変わらないこと（非回帰） ④フラグ切替の境界時刻と並行リクエスト ⑤フラグONで従来どおり動くこと |
| ロールバック | **コードを戻す前にフラグをONにする**（指示書のロールバック方針）。フラグONで完全に従来挙動へ戻る。既存データは一切変更しないため復旧作業は不要 |

### PR-P1b: 管理画面の履歴参照専用化

| 項目 | 内容 |
|---|---|
| 影響範囲 | 管理画面のコミッション・支払関連ページ |
| 想定される影響 | 管理者が編集操作をできなくなる。**PR-P1aのガードが正、画面はその表示**という関係にする（画面だけ塞いでAPIが開いている状態を作らない） |
| テスト方法 | フラグOFF/ONそれぞれでの画面表示。権限別（operator/manager）の表示 |
| ロールバック | フラグON、またはコードのrevert |

### PR-P4: managerフォールバック廃止

| 項目 | 内容 |
|---|---|
| 影響範囲 | `src/lib/admin-session.ts` の `getAdminRole()` |
| 想定される影響 | **`adminRole` クレームの無い既存Cookieを持つ管理者が、次回ログインまで manager 操作をできなくなる。** Cookieの有効期間は12時間なので、影響は最大12時間で自然解消する。デプロイ直後に管理業務が止まらないよう、**業務時間外のデプロイ**を推奨 |
| テスト方法 | roleなしCookie／期限切れCookie／operator Cookie／manager Cookie の4パターンで、manager限定操作の可否を検証 |
| ロールバック | コードのrevert。データ変更なし |

### 共通のロールバック条件（指示書 §ロールバック条件と方法）

以下のいずれかが起きた場合にロールバックする。

- 既存のコミッション・支払履歴が参照不能になった
- 許可済みゲームEntitlement（`kokudaka`/`gacha_ticket`）が適用されなくなった
- 主要な管理業務が停止した

**手順はいずれも「コードを戻す前に機能フラグで止める」**。追加カラム・受信記録は削除しない。旧書込みを再開する場合も責任者の明示承認を必須とする。

---

## 11. 承認をお願いしたい事項（まとめ）

1. 本レポートの内容の妥当性
2. 質問 Q1〜Q9 への回答（特に **Q2・Q3・Q8** はPR-P1の設計が決まらないため必須）
3. §9 のPR分割案と、**PR-P3を先頭に置く着手順**の可否
4. §5.3 の3点（実際のDB設定値）の確認（秘密値は不要）
5. PR #164（マイグレーション適用漏れ検知、CI green・未マージ）の扱い

承認をいただくまで、コード変更・ブランチ作成・マイグレーション作成／適用・フラグ変更・データ変更・マージ・デプロイは行わない。
