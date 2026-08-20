# Passport 質問・確認事項一覧

- 作成日: 2026-08-20
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠指示書: `00_5SYSTEM_EXECUTION_ORDER_20260820.md` / `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` / `99_CORRECTION_NOTICE_5SYSTEM_20260820.md`
- 関連レポート: `docs/PASSPORT_PRE_WORK_SURVEY_5SYSTEM_20260820.md`

## この文書の使い方

作業前確認で判明した、**独自判断で決めるべきでない事項**をまとめたものです。各項目の「回答欄」に記入いただければ、そのまま実装の根拠にします。

- **秘密値（鍵・パスワード・トークン・シークレットの値）は記入しないでください。** 必要なのは「設定されているか否か」「キー名は何か」だけです。
- 全問に答えないと着手できないわけではありません。着手可否は §0 の一覧を参照してください。

---

## 0. 優先度と着手ブロックの関係

| 分類 | 質問 | これが未回答だと |
|---|---|---|
| **A. 実装判断（必須）** | Q1 / Q2 / Q3 / Q4 / Q5 / Q6 / Q7 | 該当PRを設計できない |
| **B. 設定値の確認** | Q8 / Q9 / Q10 | 実際の状態が分からず、想定で進むことになる |
| **C. 契約・他システム** | Q11 / Q12 / Q13 | 他システムとの噛み合わせが検証できない |
| **D. 運用・継続中の未解決** | Q14 / Q15 / Q16 / Q17 | 既存機能の一部が停止したままになる |

### 質問とPRの対応

| PR | ブロックしている質問 | 未回答でも着手できるか |
|---|---|---|
| **PR-P3**（OVE表示の是正） | Q7（テスト項目の読み替えのみ） | **着手できる** |
| PR-P2a（allowlist明示化） | Q9 | 概ね着手できる |
| PR-P2b（商品所有者マップ） | Q5 / Q6 / Q9 | **着手できない** |
| PR-P1a（書込み停止ガード） | Q1 / Q2 / Q3 / Q4 | **着手できない** |
| PR-P1b（管理画面の参照専用化） | PR-P1a完了後 | — |
| PR-P4（管理Cookie） | Q13 | 一部着手できる |

---

## A. 実装判断（必須）

### Q1. 土地・城区画の販売は、どのシステムの責任ですか

**背景**

5システム版の正本（SoT）表には、次の5行があります。

| 業務データ | 正本システム |
|---|---|
| common_user_id、紹介者、担当代理店、紹介セッション | Agency |
| 新規獲得、学習、体験、活動、はじまりの旅 | Passport |
| OVE残高・履歴、デジタルコレクション | OVEW Wallet |
| 評議員権、会員権、既存商品、その注文・決済・返金 | 戦国マーケット |
| クリエイター作品、出品、作品注文・決済・返金、Entitlement、シリアル | NFT作品マーケット |

**この表に「土地・城区画」がありません。** しかし現在のPassportは、

- `POST /api/purchase/castle-plot-checkout` で**自前のStripeで土地区画を販売**している
- `castle_plots`（`owner_user_id` / `sold_at` / `sold_price_yen`）を**権利の正本**として持っている
- 決済確定後に `postLandSaleCommission()` が **`commission_ledger` に報酬を新規計上**している
- 銀行振込等の手動計上経路（`external_orders`、`product_type` は `land_plot` のみ）も持っている

**なぜ必要か**

PR-P1 は「Agencyと重複する報酬・支払機能への新規書込みを止める」ものですが、土地販売がPassportの責任として残るなら「Passport自身の商品の報酬をPassportが計上できなくなる」という状態になります。土地販売ごと戦国マーケットへ移すなら、話は「報酬の停止」ではなく「販売機能の移管」になり、規模がまったく変わります。

**選択肢**

- (a) 土地・城区画の販売・権利・決済はPassportの責任のまま。報酬計上だけをAgencyへ移す
- (b) 土地・城区画は戦国マーケットの担当（「既存商品」に含まれる）。将来的に販売機能ごと移管する
- (c) その他

**回答欄**

```
（ここに記入）
```

---

### Q2. PR-P1で止めるのは「新規計上」だけですか、既存行の状態遷移も含みますか

**背景**

指示書は次の2つを同時に書いています。

- 「対象テーブルへの**新規作成・更新処理**の入口をサービス層で一括ガードする」
- 「既存履歴、**既存確定額**、既存支払記録は保持する」

`commission_ledger` への書込みは4経路あり、性質が異なります。

| # | 経路 | 性質 | 起点 |
|---|---|---|---|
| 1 | `postLandSaleCommission()` | **新規行のinsert** | Stripe決済確定（利用者操作） |
| 2 | `confirmMaturedCommissions()` | 既存行を `confirmed` へ | 管理者操作 |
| 3 | `applyRefundAdjustments()` | 既存行を `reversed` へ＋調整明細のinsert | 管理者の返金操作 |
| 4 | `POST /api/admin/payouts` | 既存行を `paid` へ＋`payouts` のinsert | 管理者操作 |

経路1を止めるべきなのは明確です。経路2〜4は「新規作成・更新処理」でもあり、同時に「既存確定額・支払記録の保持」に関わる運用操作でもあるため、指示書からどちらとも読めます。

**なぜ必要か**

経路2〜4も止めると、**既に計上済みで未払いの報酬を確定・支払する手段が無くなります**。逆に止めないと、`payouts` に新規行が作られ続けます（指示書の受入条件は「新規commission ledgerと**payout**が作成されない」）。

**選択肢**

- (a) 経路1のみ停止。経路2〜4（確定・返金取消・支払）は既存分の清算のため継続して使える
- (b) 経路1・4を停止。確定と返金取消（2・3）のみ継続
- (c) 全経路を停止。既存分の清算はAgency側で行う
- (d) 経路1のみ即時停止し、経路2〜4は「既存分の清算が終わったら別途停止」の二段階

**回答欄**

```
（ここに記入）
```

---

### Q3. 停止後、Agency稼働までの間に発生した土地販売の報酬はどう扱いますか

**背景**

実施順序書の順序は「2. Passportの新規書込みを停止 → 3〜4. Market側のOutbox整備 → 5. Agencyに受信・報酬CSVを追加」です。つまり、**Passportが止まってからAgencyが受け皿として動き出すまでに必ず期間が空きます。**

その間に土地販売が成立すると、報酬がどこにも記録されません。

**なぜ必要か**

PR-P1a の設計そのものが変わります。(b) を選ぶ場合、「未計上イベント」を残すための追加テーブルが必要になり、DB変更の要否が変わります。

**選択肢**

- (a) 記録しない。Agency稼働後に販売履歴（`purchases` / `castle_plots`）から手動で遡及計算する
- (b) 報酬は計上しないが、「本来なら計上対象だった販売」を専用テーブルに記録しておき、Agencyへ引き渡す
- (c) その期間は土地販売自体を停止する（販売導線を閉じる）
- (d) その他

**回答欄**

```
（ここに記入）
```

---

### Q4. `commission_adjustments` と `agent_sales` も停止対象に含めますか

**背景**

指示書が名指ししているのは `commission_rule_sets` / `commission_ledger` / `payouts` の3テーブルです。しかし、Agencyと責任が重複しうるテーブルがもう2つあります。

| テーブル | 書込み経路 | 性質 |
|---|---|---|
| `commission_adjustments` | `applyRefundAdjustments()` からinsert | `commission_ledger` の返金調整明細。台帳と一体で動く |
| `agent_sales` | `recordAgentSaleStep()` → Postgres関数 `record_purchase_agent_sale()` | **`kokudaka` / `gacha_ticket` 購入時に代理店の販売実績を記録**（金額計算はせず記録のみ） |

`agent_sales` は「担当代理店」に紐づく記録であり、5システムSoT表では担当代理店の正本はAgencyです。ただし金額計算をしていないため、「報酬機能」ではなく「実績ログ」とも解釈できます。

**なぜ必要か**

`agent_sales` を止めると、**国高・ガチャチケット購入という土地とは無関係な導線にもガードが入ります**。影響範囲が土地販売の外まで広がるため、独断で決めるべきではありません。

**選択肢**

- (a) 3テーブルのみ停止。`commission_adjustments` と `agent_sales` は対象外
- (b) `commission_adjustments` は台帳と一体なので停止対象に含める。`agent_sales` は対象外
- (c) 5テーブルすべて停止対象
- (d) その他

**回答欄**

```
（ここに記入）
```

---

### Q5. 「商品コード台帳」の正本はどのシステムですか

**背景**

実施順序書 §2.1 に「同一商品を両方へ登録しない。**商品コード台帳に `owner_system_key` を必須化する**」とあります。

Passport側には現在、商品コードの台帳に相当するものがありません。持っているのは次だけです。

- `purchases.item_type`（`kokudaka` / `gacha_ticket` / `land_plot` の3値）
- `external_order_items.product_type`（`land_plot` のみ、CHECK制約）
- `entitlements.entitlement_type`（**自由文字列**。既定 `"generic"`）

**なぜ必要か**

PR-P2b の設計が変わります。台帳の正本が他システムにあるなら、Passportが持つべきなのは「ローカルキャッシュ」か「参照用のAPI呼び出し」であって、自前の台帳テーブルではありません。

**選択肢**

- (a) 各システムが自分の商品を登録する共通台帳が別途あり、Passportはそれを参照する（→ その台帳のAPI仕様をご提供ください）
- (b) 台帳の正本は無く、各システムが自分側で `owner_system_key` の判定表を持つ
- (c) Passportが台帳を持つ
- (d) その他

**回答欄**

```
（ここに記入）
```

---

### Q6. 商品所有者マップの判定粒度は何ですか

**背景**

Q5と対になる質問です。Passportが受け取るイベントで、「この権利はどのシステムのものか」を判定する鍵として使える値は3つあります。

| 判定鍵 | 現状 | 長所 / 短所 |
|---|---|---|
| `source_system_key` | HMAC認証済みで**確実**（`sen_no_kuni_hub_settings` に登録された値） | 送信元は分かるが「商品」の粒度ではない |
| `entitlement_type` | 自由文字列。既定 `"generic"` | 商品種別を表せるが、送信元が任意の文字列を送れる |
| 商品コード | Passportは受け取っていない | 最も細かいが、契約の追加が必要 |

**なぜ必要か**

PR-P2b のDB設計とテストが変わります。

**選択肢**

- (a) `source_system_key` 単位。「`sennokunnft` から来た権利は残高に適用しない」という粒度
- (b) `entitlement_type` 単位。種別ごとに所有システムを表で持つ
- (c) 商品コード単位。イベントに商品コードを含めてもらう契約追加が必要
- (d) (a) と (b) の組み合わせ（送信元と種別の両方が一致した場合のみ適用）

**回答欄**

```
（ここに記入）
```

---

### Q7. Wallet契約と指示書テスト項目の齟齬をどう扱いますか

**背景**

指示書のテスト項目に「Wallet正常、タイムアウト、404、**重複common_user_id時の表示**」とあります。

しかし前回のWallet仕様確認（`docs/WALLET_INTEGRATION_ANSWERS_20260820.md`、Wallet側からの回答済み）で、次が確定しています。

- Walletのユーザー解決は **`service_code` + `external_user_id`** で行う
- **`common_user_id` は受け付けない**
- 取引履歴取得APIは存在しない
- Passport用の `service_integrations` レコードは未発行

したがって「重複common_user_id時の表示」というテストは、現在のWallet契約では成立しません。

**なぜ必要か**

PR-P3 のテスト設計です。ただし PR-P3 自体は表示層のみの変更で、**Wallet APIには接続しない**前提のため、この回答を待たずに着手できます。

**選択肢**

- (a) 「重複 `external_user_id` 時の表示」と読み替える
- (b) Wallet側に `common_user_id` 対応を追加してもらう前提でテスト項目を維持する
- (c) Wallet接続は PR-P3 の範囲外なので、当該テスト項目は Wallet接続PR（別PR）へ繰り延べる

**回答欄**

```
（ここに記入）
```

---

## B. 設定値の確認（値ではなく状態のみ）

> **秘密値は記入しないでください。** キー名・有無・true/false だけで足ります。

### Q8. 「はじまりの旅」の扱い

**背景**

指示書の監査基準コミット `d16b9d7` は「はじまりの旅」がマージされる**前**の状態です。現在は実装済み（PR2〜PR4）で main にマージされていますが、実施順序書 §3-8 は「上記が安定してから実装する」としており、順序が食い違っています。

現状は**実装済みだが稼働していません**。

| 項目 | 状態 |
|---|---|
| `learning_journey_settings.missions_enabled` | `false` 既定 |
| `learning_journey_settings.rewards_enabled` | `false` 既定 |
| `learning_journey_settings.consultation_sync_enabled` | `false` 既定 |
| `learning_journey_settings.line_notifications_enabled` | `false` 既定 |
| 登録コース数 | 0件 |
| 報酬付与 | `learning_journey_reward_requests` に `PENDING` 記録を作るのみ。**Wallet送信アダプタ未実装** |

**選択肢**

- (a) フラグOFFのまま凍結する（**推奨**。コード変更不要、既存データにも影響しない）
- (b) 機能を明示的に無効化するコードを追加する
- (c) その他

**あわせて確認をお願いしたいこと**：本番/ステージングDBの `learning_journey_settings` の4フラグが、実際にすべて `false` のままか。

**回答欄**

```
（ここに記入）
```

---

### Q9. `sen_no_kuni_hub_settings` に登録されている `system_key` の一覧

**背景**

Passportの外部イベント受信口 `POST /api/integrations/sen-no-kuni-hub` は、`sen_no_kuni_hub_settings` に登録された `system_key` 単位でHMAC鍵を管理しています。

**`enabled` 列の既定値が `true`** のため、**登録済みのシステムはすべて `entitlement.granted` を送信できる状態にあります。**

**なぜ必要か**

PR-P2（Entitlement境界）の設計に直結します。`sengokumarket` と `sennokunnft` が既に登録済みかどうかで、商品所有者マップの初期値が変わります。

**お願いしたいこと**

以下のSQLをSupabase SQL Editorで実行し、**結果を貼り付けてください。`hmac_secret` は選択していないので、秘密値は出力されません。**

```sql
select system_key, key_id, enabled, created_at
from sen_no_kuni_hub_settings
order by created_at;
```

**回答欄**

```
（ここに結果を貼り付け）
```

---

### Q10. Stripe の設定状態（値は不要）

**背景**

Passportは `payment_settings` テーブルにStripeキー3種（publishable / secret / webhook secret）を保持しています。PR-P1a は決済確定後の処理にガードを入れるため、実際に決済が動いている環境かどうかで検証方法が変わります。

**お願いしたいこと**

以下のSQLの結果を貼り付けてください。**キーの値そのものは出力されません（設定済みか否かのbooleanのみ）。**

```sql
select
  (stripe_publishable_key is not null and stripe_publishable_key <> '') as publishable_key_設定済み,
  (stripe_secret_key      is not null and stripe_secret_key      <> '') as secret_key_設定済み,
  (stripe_webhook_secret  is not null and stripe_webhook_secret  <> '') as webhook_secret_設定済み,
  kokudaka_pack_amount_yen,
  kokudaka_pack_kokudaka,
  gacha_ticket_pack_amount_yen,
  gacha_ticket_pack_tickets,
  updated_at
from payment_settings;
```

**回答欄**

```
（ここに結果を貼り付け）
```

---

## C. 契約・他システム

### Q11. `sen_no_kuni_hub_settings.enabled` の既定値を `false` に変えてよいですか

**背景**

現在の既定は `true` です。新しい `system_key` を登録した瞬間から、そのシステムはPassportへイベントを送信できます。5システム構成では送信元が増えるため、**既定 `false`（登録後に明示的に有効化する）の方が安全**だと考えます。

ただし既存行への影響があるため、独断では変更しません。

**選択肢**

- (a) 既定を `false` に変更する。**既存行は `true` のまま維持**（`alter column set default` のみで既存行は変わりません）
- (b) 現状維持
- (c) その他

**回答欄**

```
（ここに記入）
```

---

### Q12. `shopping_order_events` は今後も必要ですか

**背景**

`POST /api/integrations/sen-no-kuni-hub` は `order.created` / `order.paid` / `order.cancelled` / `payment.succeeded` / `payment.failed` / `payment.refunded` を受信していますが、**処理は `shopping_order_events` テーブルへの監査記録のみ**です。コード内に「商品カタログ・注文ID体系が未確定のため、当面は監査目的の記録のみ」とコメントされています。

5システム版では注文・決済・返金の正本が2つのマーケットに置かれます。Passportがこれらを受信し続ける必要があるかを確認したいです。

**選択肢**

- (a) 監査記録として今後も受信し続ける（現状維持）
- (b) Passportは受信しない。マーケット→Agencyの直結にする
- (c) 判断を保留し、現状のまま（**この場合、今回のPRでは触りません**）

**回答欄**

```
（ここに記入）
```

---

### Q13. PR-P4のスコープはどこまでですか

**背景**

指示書 PR-P4 には3項目あり、**規模が大きく異なります**。

| 項目 | 規模 | 影響 |
|---|---|---|
| ① roleなし旧Cookieのmanagerフォールバック廃止 | **小**（1関数の1行） | `adminRole` クレームの無いCookieを持つ管理者が、次回ログインまでmanager操作をできなくなる。Cookie有効期間は12時間なので最大12時間で自然解消 |
| ② 自己申告名でなく認証済み管理者IDを監査ログに記録 | **大** | ③が前提。個別アカウントが無いと「認証済み管理者ID」自体が存在しない |
| ③ 共有パスワードから個別アカウントへの移行と互換期間 | **特大** | 管理者認証基盤の作り直し。新規テーブル、招待/発行フロー、パスワードリセット、既存運用者への移行案内が必要 |

現在は共有パスワード2本（manager用・operator用）のみで、個別アカウント基盤はありません。

**選択肢**

- (a) ①のみを今回の範囲とする（**推奨**。受入条件「roleなし旧管理Cookieでmanager権限を取得できない」はこれで満たせます）
- (b) ①＋②③まで今回の範囲に含める
- (c) ①を今回、②③は別プロジェクトとして計画を立てる

**あわせて確認をお願いしたいこと**：①を入れる場合、**デプロイ直後に管理業務が止まらないよう業務時間外のデプロイを推奨**します。実施可能な時間帯をご指定ください。

**回答欄**

```
（ここに記入）
```

---

## D. 運用・継続中の未解決事項

> 今回の4PRの前提ではありませんが、未解決のまま残っている項目です。

### Q14. `CRON_SECRET` が Vercel に未設定です

**背景**

`/api/internal/cron/*`（outbox自動再送・reconciliation）は `CRON_SECRET` で認証しますが、Vercel側に未設定のため**認証で弾かれ、自動再送が停止しています**。

実施順序書 §5 の完了条件「監視でOutbox滞留、受信失敗、冪等衝突、common_user_id未解決を検知できる」に直接影響します。

**お願いしたいこと**：Vercelの環境変数に `CRON_SECRET` を設定してください。**値はこちらに共有しないでください。** 設定が完了したことだけお知らせください。

**回答欄**

```
（設定済み / 未設定 / 対応予定日）
```

---

### Q15. PR #164（マイグレーション適用漏れ検知）の扱い

**背景**

2026-08-20 に、`20260814000001_castle_plot_sales_hooks.sql` の適用漏れにより、問い合わせ送信・問い合わせ一覧・管理画面の3機能が本番で失敗する事故が発生しました。適用済み記録は81件に是正済みです。

PR #164 はこの再発を検知する機構（運用ヘルス画面に未適用マイグレーションを表示）で、**CI green・未マージ**です。含まれるマイグレーション `20260816000001_applied_migration_versions.sql` も**未適用**です。

このリポジトリは `supabase db push` を使わない手動適用運用のため、CIのmigration-testでは構造的にこの種の漏れを検知できません。

**選択肢**

- (a) 今回のPR群より先にマージ・適用する（**推奨**。以降のPRでの適用漏れも検知できるようになります）
- (b) 今回のPR群と一緒に扱う
- (c) 保留

**回答欄**

```
（ここに記入）
```

---

### Q16. Wallet の `service_integrations` レコード発行

**背景**

Passport用の `service_integrations`（`service_code` とAPIキー）が**未発行**のため、Wallet APIへは接続できません。

PR-P3 は「Wallet未接続時の表示」を正すもので接続不要ですが、その後の「Wallet接続時のみOVE残高を表示する」段階では必須になります。

**お願いしたいこと**：発行の見込み時期をお知らせください。**APIキーの値はこのチャットに貼らず、Vercelの環境変数またはDB設定へ直接投入してください。**

**回答欄**

```
（ここに記入）
```

---

### Q17. Wallet仕様の優先度B（4〜9章）の回答

**背景**

`docs/WALLET_INTEGRATION_QUESTIONS.md` のうち、優先度Aは回答済み（`docs/WALLET_INTEGRATION_ANSWERS_20260820.md`）ですが、**優先度B（4〜9章）は未回答**です。

今回の4PRの前提ではありませんが、「はじまりの旅」の3,000 OVE段階付与を実装する段階（実施順序書 §3-8）で必要になります。

**回答欄**

```
（ここに記入 / 後日で可）
```

---

## 参考: 質問の一覧（チェックリスト）

- [ ] Q1. 土地・城区画の販売はどのシステムの責任か
- [ ] Q2. PR-P1で止めるのは新規計上だけか、状態遷移も含むか
- [ ] Q3. Agency稼働までの空白期間の報酬をどう扱うか
- [ ] Q4. `commission_adjustments` / `agent_sales` を停止対象に含めるか
- [ ] Q5. 商品コード台帳の正本はどのシステムか
- [ ] Q6. 商品所有者マップの判定粒度
- [ ] Q7. Wallet契約とテスト項目の齟齬の扱い
- [ ] Q8. 「はじまりの旅」の扱い（＋実フラグ値の確認）
- [ ] Q9. `sen_no_kuni_hub_settings` の `system_key` 一覧（SQL実行）
- [ ] Q10. Stripe設定の有無（SQL実行）
- [ ] Q11. `sen_no_kuni_hub_settings.enabled` の既定を `false` にしてよいか
- [ ] Q12. `shopping_order_events` は今後も必要か
- [ ] Q13. PR-P4のスコープ（＋デプロイ可能時間帯）
- [ ] Q14. `CRON_SECRET` の設定
- [ ] Q15. PR #164 の扱い
- [ ] Q16. Wallet `service_integrations` の発行時期
- [ ] Q17. Wallet仕様 優先度B の回答

**Q7 以外がすべて未回答でも、PR-P3（OVE表示の是正）だけは着手できます。**
