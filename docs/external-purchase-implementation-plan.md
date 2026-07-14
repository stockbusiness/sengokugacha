# 外部購入管理機能 実装計画

「戦国パスポート 開発者向け実装指示書 v1.0」4〜21章、および `docs/external-purchase-current-state-audit.md` の調査結果に基づく実装計画。

---

## 1. 実装対象(フェーズ1)

指示書4〜13章の範囲のみ。

1. 管理画面: 外部購入(注文)の登録・一覧・詳細(`/admin/external-orders`系)
2. 購入者とLINEユーザーの検索・確認・紐付け/解除
3. 1注文複数区画に対応した区画割当(排他制御込み)
4. 区画権利付与の確定処理(1トランザクション相当での一括更新)
5. `/my-land` への外部購入分の反映(Stripe直販分の表示を壊さない)
6. キャンセル・返金・権利取消(一部取消含む)
7. LINE個別通知(紐付け依頼/割当完了/権利付与完了/変更/取消/返金)+送達記録+再送
8. 監査ログの構造化
9. 城主販売枠(`plot_allocations`)との連動
10. メタバース内覧との対応付け(最低限: 区画ID⇔物件IDの参照のみ)

## 2. 実装対象外(このフェーズでは着手しない)

指示書2-3・14章に基づき、以下は実装しない。既存コードも削除しない。

- 代理店報酬計算・確定・支払(外部システムが正)
- 多階層報酬按分
- 城主報酬の自動計算(戦国パスポート内部計算を継続利用するか外部化するかは「10. 仕様確認事項」に記載、決定まで現状維持)
- OVEブロックチェーン接続、区画NFT化・二次流通・貸出
- Unity本体連携、武将バトル、AI寺子屋LMS化、戦国市場の内部マーケット化
- 管理者個別アカウント化(共有パスワード2ロール方式を維持)
- 仮押さえ(商談中区画のロック)機能(指示書4-9も「初期リリースでは後回しでよい」と明記)
- 30→60→100区画への段階拡張ロジック
- CSV取込(4-13/17)は将来対応。フェーズ1は画面からの個別登録のみ
- 既存購入者(岐阜城城下町、約300〜400区画)のデータ移行(2026-07-14にユーザー確認済み、後回しで可)

既存のStripe直販コード(`/api/plots/[id]/reserve`, `/api/purchase/castle-plot-checkout`, webhook側の`completePlotPurchase`)は削除せず、外部注文フローと並存させる。

---

## 3. DB変更案

命名は指示書16章の概念例をベースに、既存の`snake_case`・`YYYYMMDDHHNNNN_`命名規則に合わせる。新規マイグレーション(想定3〜4本)。

### 3-1. `external_orders`(注文)

```text
id                      uuid pk
external_shop_name      text not null
external_order_id       text not null
status                  text not null default 'draft'
  check (status in ('draft','payment_pending','payment_confirmed',
    'user_link_pending','plot_assignment_pending','partially_assigned',
    'ready_to_grant','rights_granted','cancel_pending','cancelled',
    'refunded','on_hold'))
purchased_at            timestamptz
payment_confirmed_at    timestamptz
amount_yen              int not null
currency                text not null default 'JPY'
buyer_name               text not null
buyer_name_kana          text
buyer_email              text
buyer_phone              text
external_customer_id     text
buyer_address             text          -- 業務上必要な場合のみ入力
linked_user_id            uuid references users(id)   -- 紐付け確定後にセット
external_agent_id         text          -- agents.external_id と対応(スナップショット、FKは張らない)
agent_name_snapshot        text
agent_sales_rep_snapshot   text
referral_url_or_code       text
castle_id                  uuid references castles(id)  -- 対象城が確定していれば
evidence_file_path         text          -- Storage上の非公開パス(注文確認資料)
payment_evidence_file_path text          -- 入金確認資料
admin_memo                 text
registered_by              text          -- admin_audit_logsと同じ自己申告actor名
created_at, updated_at     timestamptz not null default now()

unique (external_shop_name, external_order_id)  -- 5-3 重複防止(DBレベル)
```

### 3-2. `external_order_items`(注文明細)

1注文に複数区画を許容するための明細行(7-1)。

```text
id                    uuid pk
order_id              uuid not null references external_orders(id)
external_product_id   text
product_name          text not null
product_type          text not null default 'land_plot' check (product_type in ('land_plot'))
quantity               int not null default 1
unit_price_yen          int not null
subtotal_yen             int not null
created_at              timestamptz not null default now()
```

### 3-3. `external_order_plot_assignments`(区画割当)

注文明細と区画の中間テーブル(7-1の「注文明細→区画割当0件以上→区画権利」)。

```text
id                uuid pk
order_item_id     uuid not null references external_order_items(id)
plot_id           uuid not null references castle_plots(id)
status            text not null default 'assigned'
  check (status in ('assigned','changing','cancelled'))
assigned_by       text
assigned_at       timestamptz not null default now()
unassigned_at     timestamptz

-- 二重割当防止(7-4): 同一区画への「有効な」割当は同時に1件のみ
unique index uq_external_order_plot_assignments_active_plot
  on (plot_id) where status = 'assigned'
```

区画権利そのものは新設テーブルを作らず、既存`castle_plots`の`owner_user_id`/`sold_at`/`sold_price_yen`を正本として使う(下記4節「権利の正本」参照)。`external_order_plot_assignments`はあくまで「どの注文明細がどの区画を割り当てたか」の記録であり、権利確定は`castle_plots`側の更新で表現する。

### 3-4. `external_order_status_histories`(状態遷移履歴)

`castle_lord_contract_events`と同型。

```text
id            uuid pk
order_id      uuid not null references external_orders(id)
from_status   text
to_status     text not null
changed_by    text
reason        text
snapshot_before jsonb
created_at    timestamptz not null default now()
```

### 3-5. `line_notification_logs`(LINE通知送達記録)

```text
id                uuid pk
notification_type text not null
  check (notification_type in ('user_link_requested','plot_assigned',
    'rights_granted','plot_changed','rights_revoked','refund_applied'))
target_type       text not null check (target_type in ('external_order','castle_lord_contract'))
target_id         uuid not null
line_user_id      text not null
status            text not null default 'pending' check (status in ('pending','sent','failed'))
error_message     text
sent_at           timestamptz
created_at        timestamptz not null default now()

-- 同一通知の重複送信防止(10-2): 同一対象・同一種別の「成功済み」送信は1件のみ
unique index uq_line_notification_logs_sent
  on (target_type, target_id, notification_type) where status = 'sent'
```

### 3-6. `admin_audit_logs` の拡張

既存の`actor_name`/`action`/`details`(自由記述)は維持し、構造化列を追加する(既存呼び出し元は無変更で動く)。

```text
alter table admin_audit_logs add column target_type text;
alter table admin_audit_logs add column target_id uuid;
alter table admin_audit_logs add column before_snapshot jsonb;
alter table admin_audit_logs add column after_snapshot jsonb;
```

`logAdminAction()`に第4引数(オプショナルな`{targetType, targetId, before, after}`)を追加する形で後方互換を維持する。

### 3-7. `castle_plots` への列追加

```text
alter table castle_plots add column source_order_item_id uuid references external_order_items(id);
```

「この区画が売れたのは外部注文経由か、Stripe直販経由か」を1列で判別できるようにする(Stripe直販は`plot_reservations.purchase_id`経由で判別可能なため、こちらは外部注文経由のみセット)。

### 3-8. マイグレーション適用方針

- 既存データを壊す変更は無い(全て追加のみ)。
- 一意制約(`external_orders`の`(external_shop_name, external_order_id)`)は新規テーブルのため重複データの心配は無い。
- `admin_audit_logs`への列追加はNULL許容のため既存行に影響しない。
- ステージング適用→本番適用の順を徹底する(指示書16-2)。**現状CIはマイグレーションを自動適用しないため、本番適用は手動(`supabase db push`または SQL Editor)であることを前回セッションで確認済み。今回も同様の手動適用が必要。**

---

## 4. 権利の正本(指示書8-2への回答)

`castle_plots`(既存)を、全国お城プロジェクト区画の権利情報の唯一の正本とする。

- 新規の「共通権利台帳」は作らない。理由: `castle_plots`はStripe直販・`/my-land`・城主ダッシュボードの3箇所から既に参照されており、これを分岐させると指示書自身が禁止する「同じ権利を複数テーブルで正本管理」に該当するため。
- `metaverse_plot_rights`(メタバース内覧側)とは統合しない。統合には「城の区画と内覧物件をどう対応付けるか」という別の大きな設計判断が必要で、指示書13-2も「最低限の対応付け」のみを今回のスコープとしている。今回は`castle_plots`に`metaverse_property_id`(nullable、FK)を追加し、対応付けが存在する区画についてのみ内覧側で所有状態を参照可能にする、片方向の参照に留める。

```text
alter table castle_plots add column metaverse_property_id uuid references metaverse_properties(id);
```

---

## 5. API変更案

すべて`/api/admin/external-orders`配下、既存の`getAdminSession()`/`requireManagerRole()`パターンを踏襲。

| メソッド・パス | 権限 | 役割 |
|---|---|---|
| `GET /api/admin/external-orders` | operator可 | 一覧・絞り込み(4-1の絞り込み条件・警告フラグをクエリパラメータ化) |
| `POST /api/admin/external-orders` | operator可 | 新規登録(draft) |
| `GET /api/admin/external-orders/[id]` | operator可 | 詳細 |
| `PATCH /api/admin/external-orders/[id]` | operator可(入金確認確定以降はmanagerのみ) | 注文情報編集・状態遷移 |
| `POST /api/admin/external-orders/[id]/confirm-payment` | **manager限定** | 入金確認確定 |
| `GET /api/admin/users/search` | operator可 | 氏名/メール/電話/LINE表示名/会員番号横断検索(既存`/admin/users`検索ロジックの拡張) |
| `POST /api/admin/external-orders/[id]/link-user` | operator可(紐付け確定はmanager) | 購入者↔LINEユーザー紐付け確定 |
| `POST /api/admin/external-orders/[id]/unlink-user` | 権利付与前operator可/権利付与後manager限定 | 紐付け解除(理由必須) |
| `GET /api/admin/external-orders/[id]/assignable-plots` | operator可 | 割当可能区画(7-3の条件でフィルタ) |
| `POST /api/admin/external-order-items/[itemId]/assign-plot` | operator可 | 区画割当(一意制約でDBレベル排他) |
| `POST /api/admin/external-order-items/[itemId]/unassign-plot` | operator可 | 割当解除 |
| `POST /api/admin/external-orders/[id]/grant-rights` | **manager限定** | 権利付与確定(8-1の一括処理) |
| `POST /api/admin/external-orders/[id]/cancel` | **manager限定** | キャンセル・取消(9-2) |
| `POST /api/admin/external-orders/[id]/partial-cancel` | **manager限定** | 一部取消(9-4、対象`order_item_id`指定) |
| `POST /api/admin/line-notifications/[id]/resend` | operator可 | LINE通知再送 |
| `POST /api/admin/external-orders/[id]/evidence` | operator可 | 証憑ファイルアップロード(既存Storage非公開バケットパターン踏襲) |

`grant-rights`は指示書8-1の10ステップを1関数`grantExternalOrderRights(orderId, actorName)`(`src/lib/external-orders.ts`)にまとめ、失敗時は例外を投げて全体を未確定のまま返す(6節参照)。LINE通知はこの関数の外側(呼び出し元)で「権利付与成功後にベストエフォートで実行」する。

---

## 6. 画面変更案

指示書4章の推奨パスに合わせる。

```text
/admin/external-orders          -- 一覧(絞り込み・警告バッジ)
/admin/external-orders/new      -- 新規登録
/admin/external-orders/[orderId] -- 詳細(タブ構成を想定)
  - 注文情報タブ
  - 購入者紐付けタブ(検索→並列比較→確定)
  - 区画割当タブ(注文明細ごとに割当可能区画を選択)
  - 権利付与タブ(全条件チェック→「権利付与を確定」ボタン)
  - 履歴タブ(状態遷移履歴・監査ログ・LINE通知送達状況)
```

`/my-land`(既存)は表示クエリを変更しない(`castle_plots.owner_user_id`ベースのままで外部注文分も自動的に含まれる)。

土地報酬ルール/元帳/支払画面(`/admin/castle-commission-rules`, `/admin/castle-commissions`, `/admin/castle-payouts`)は、ナビゲーションから削除せず「外部システムが正になったため参照専用」の注記バナーを追加する案を推奨する(完全非表示にすると、既に計上済みの過去データを参照する手段が失われるため)。最終判断は「10. 仕様確認事項」参照。

---

## 7. 状態遷移

`external_orders.status`(指示書5-2準拠、9-2/9-4向けに`PARTIALLY_ASSIGNED`等を分割しない設計とし、区画単位の割当状況は`external_order_plot_assignments`側で表現する)。

```text
draft
  → payment_pending
  → payment_confirmed          (manager)
  → user_link_pending          (紐付け未確定の間、自動でこの状態を経由)
  → plot_assignment_pending
  → partially_assigned / ready_to_grant  (割当済み区画数に応じて自動判定)
  → rights_granted              (manager、grant-rightsで一括確定)
  → cancel_pending → cancelled / refunded
  → on_hold                     (どの状態からでも遷移可、情報不一致時等)
```

`castle_lord_contracts`と同じ方針で、遷移可否を純粋関数`isValidExternalOrderTransition(from, to)`(`src/lib/external-order-state.ts`)として実装し、テスト対象にする。

`external_order_plot_assignments`(区画単位)は`assigned → changing → cancelled`のみのシンプルな遷移とする。

---

## 8. 権限

指示書11-1に準拠。

| 操作 | 本部担当者(operator) | 本部管理者(manager) |
|---|---|---|
| 注文登録・購入者検索・区画割当案作成・証憑登録・メモ登録 | ○ | ○ |
| 入金確認確定 | × | ○ |
| ユーザー紐付け確定 | × | ○ |
| 権利付与確定 | × | ○ |
| 権利取消・区画変更 | × | ○ |
| 強制登録・強制解除 | × | ○ |

既存`requireManagerRole()`をそのまま利用。個別管理者アカウント化は指示書11-2により別フェーズ。

---

## 9. テスト計画

### 9-1. 単体テスト(vitest、`src/lib/*.test.ts`)

指示書17-1準拠。既存の`castle-lord-contracts.test.ts`と同型で以下を追加。

- `external-order-state.test.ts`: 状態遷移マトリクスの妥当性
- `external-orders.test.ts`(DB非依存の純粋関数部分のみ抽出できる場合): 割当可能区画判定条件、権利付与前提条件チェックのロジック

DBに依存する部分(重複防止・二重割当防止・トランザクション相当処理)は、本リポジトリにDBモック基盤が無いため単体テストでは検証できない。9-2の手動確認手順でカバーする。

### 9-2. 統合テスト(指示書17-2のケース1〜14)

自動テスト基盤が無いため、`docs/external-purchase-test-report.md`に手動確認手順として記載し、ステージング環境で実施する。各ケースの実施環境・実施日・実施者・期待結果・実際の結果を記録する(指示書19-2フォーマット)。

---

## 10. 仕様確認事項(指示書21章、決定まで実装を進めつつ判断を保留する項目)

1. **一部区画のみ先行権利付与を許可するか** — 本計画では、`external_orders.status`は全区画割当完了後に`ready_to_grant`へ進む設計とし、**部分確定は許可しない**(全区画そろってから一括で`grant-rights`)ことを既定案とする。異なる運用が必要であれば実装計画を修正する。
2. **城主販売枠の消費タイミング** — 本計画では`grant-rights`(権利付与確定)時点で`plot_allocations`側の消費数を再計算する(区画割当時点ではなく)。理由: 割当だけで枠を消費すると、権利付与に至らずキャンセルされた場合の枠の戻し処理が複雑になるため。
3. **土地報酬ルール/元帳/支払画面の扱い** — 「参照専用バナー表示」を推奨案として6節に記載。完全非表示との選択は業務判断が必要。
4. **既存購入者(300〜400区画)の移行方法** — ✅**解決済み(2026-07-14)**。対象は岐阜城の城下町区画。今回のフェーズでは移行作業を行わない(後回し)。フェーズ1のスコープからは除外し、CSV取込・一括投入の実装も今回は着手しない。次フェーズで着手する際に、件数・データ形式を改めてヒアリングする。
5. **城主報酬の自動計算を今後も戦国パスポート内部で続けるか** — 外部注文経由の売上に対しては現状発火しない(`postLandSaleCommission`はStripe purchase前提)ため、このまま「外部注文には計上しない」で確定してよいか。
6. **購入者の電話番号・メールをLINEユーザー本体へ上書きするか** — 本計画では`external_orders`側にスナップショットとしてのみ保持し、`users`テーブルは変更しない案を既定とする。
7. **`metaverse_property_id`の対応付け作業を誰が・いつ行うか** — 今回は列を追加するのみで、既存区画への値の設定(データ移行)は別途運用作業として発生する。

---

## 11. 移行計画

1. マイグレーション作成(3節)→ステージング適用→動作確認→本番適用(手動)。
2. lib層実装(`external-order-state.ts`, `external-orders.ts`)+単体テスト。
3. API実装(5節、権限ガード込み)。
4. 管理画面実装(6節)。
5. LINE通知実装(送達記録・再送含む)。
6. `/my-land`表示確認(既存Stripe直販分の表示が壊れていないことを確認)。
7. 監査ログ構造化列の反映。
8. 統合テストケース(指示書17-2ケース1〜14)をステージングで実施、`external-purchase-test-report.md`作成。
9. `docs/external-purchase-operation-manual.md`作成。
10. `featureinventory.md`更新(既存 `docs/`の`FEATURES.md`または前回作成した実装済み機能一覧に反映)。

既存のPR単位分割の慣習に従い、上記を複数PRに分割して進める(想定: マイグレーション+lib、API、管理画面、LINE通知、ドキュメントの5〜6PR程度)。

## 12. ロールバック方法

- 各マイグレーションは追加のみ(列追加・新規テーブル)のため、`drop table`/`alter table drop column`で個別に戻せる。既存テーブル(`purchases`, `castle_plots`等)への破壊的変更は無い。
- 画面・APIはfeature-additiveであり、既存のStripe直販導線・`/my-land`・城主ダッシュボードには変更を加えない設計のため、問題発生時は新規追加分(`/admin/external-orders`系)のみを無効化すれば既存機能への影響なく切り戻せる。
- 本番適用済みマイグレーションの取消は、既存の運用(手動`supabase db push`)に合わせて手動SQLで対応する(自動ロールバック機構は無い)。

---

*本ドキュメントは「戦国パスポート 開発者向け実装指示書 v1.0」3章の必須調査に対応する2点目の成果物。次のステップはユーザーによるレビュー・仕様確認事項への回答、その後の実装着手。*
