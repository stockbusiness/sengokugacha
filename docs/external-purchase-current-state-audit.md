# 外部購入管理機能 既存実装調査(現状監査)

「戦国パスポート 開発者向け実装指示書 v1.0」3章が求める、実装着手前の必須調査結果。
コード変更は一切行わず、既存コードの読解のみに基づく。

対象ブランチ: `claude/sengoku-economy-os-j0d2nl`(2026-07-14時点)

---

## 1. 調査項目の分類

| # | 調査項目 | 分類 | 該当箇所 |
|---|---|---|---|
| 1 | `/my-land` が参照しているテーブル・API | 実装済み(ただしStripe直販前提) | `src/app/(app)/my-land/page.tsx`, `src/app/api/me/plots/route.ts`, `castle_plots` |
| 2 | Stripe直販による区画購入処理 | 実装済み・現在アプリUIからは未使用 | `src/app/api/purchase/castle-plot-checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/plot-reservations.ts` |
| 3 | 区画を「販売済み」にする既存処理 | 一部実装(2経路が併存) | `src/lib/castle-plots.ts`(`completePlotPurchase`)、`src/app/api/admin/castle-plots/[id]/route.ts`(手動PATCH) |
| 4 | 城主販売枠の消費・回収処理 | 実装済み | `src/lib/castle-lord-contracts.ts`, `src/lib/plot-allocations.ts` 相当ロジック, `plot_allocations`テーブル |
| 5 | メタバース区画権利テーブル | 重複実装(castle_plotsの所有権と別系統) | `metaverse_plot_rights`テーブル、`src/app/admin/(dashboard)/metaverse/plot-rights/page.tsx` |
| 6 | 全国お城プロジェクト区画テーブル | 実装済み | `castle_plots`, `castles`, `plot_allocations`, `plot_reservations` |
| 7 | LINEユーザーの識別方法 | 実装済み | `src/lib/session.ts`(JWT cookie `sengoku_session`)、`users.line_user_id` |
| 8 | 管理者認証・権限判定方法 | 実装済み(共有パスワード方式) | `src/lib/admin-session.ts`(`operator`/`manager` 2ロール) |
| 9 | 監査ログの記録方式 | 一部実装(自由記述のみ、構造化フィールド無し) | `src/lib/admin-audit-log.ts`, `admin_audit_logs`テーブル |
| 10 | LINE個別通知の共通処理 | 一部実装(送達管理・再送・重複防止は無し) | `src/lib/line-push.ts`, `src/lib/castle-notifications.ts` |
| 11 | 既存の代理店ID・外部代理店IDの保持方法 | 実装済み | `agents.external_id`, `agents.parent_external_id`(`20260717000001_agency_integration.sql`) |
| 12 | 外部ショップ注文を保持する既存テーブルの有無 | 未実装 | 該当テーブル無し(`purchases`はStripe専用) |
| 13 | キャンセル・返金時の既存取消処理 | 一部実装(Stripe前提、外部注文には流用不可) | `src/app/api/admin/purchases/[id]/refund/route.ts`, `src/lib/castle-commissions.ts`(`applyRefundAdjustments`) |
| 14 | DBトランザクションの利用状況 | 未実装 | `.rpc()`呼び出し無し。全処理が逐次の個別クエリ+一意制約/部分ユニークインデックスによる排他制御 |
| 15 | テストフレームワークと既存テスト | 実装済み(純粋関数の単体テストのみ) | vitest、`src/lib/*.test.ts` 5本。DBモック基盤・統合テスト基盤は無し |
| 16 | 本番・テスト環境の切替方法 | 一部実装(暗黙的) | Stripeキーは`payment_settings`にペースト運用(test/live の明示区別UIなし)。`NODE_ENV`は`session.ts`のCookie `secure`属性にのみ影響 |
| 17 | 既存の機能フラグまたは公開状態管理 | 未実装(個別エンティティのstatus列のみ) | 汎用機能フラグ無し。`castles.status`/`castle_plots.status`等、テーブルごとに個別実装 |

---

## 2. 現在の関連画面

### エンドユーザー(LIFF)

| 画面 | パス | 現状の役割 |
|---|---|---|
| 城一覧・城詳細 | `/castles`, `/castles/[castleId]` | 公開中の城・区画情報の閲覧 |
| 区画詳細 | `/castles/[castleId]/plots/[plotId]` | 区画情報表示。購入ボタンは撤去済み、「お問い合わせはこちら」(`/legal/support`)のみ表示 |
| 所有区画マイページ | `/my-land` | `castle_plots.owner_user_id = 自分`の区画一覧表示 |
| 城主ダッシュボード | `/castle-lord/dashboard` | 自分の城主契約・販売枠・報酬(戦国パスポート内部計算分)の表示 |

### 代理店ポータル(`/agency`、LIFFとは別ログイン)

| 画面 | パス | 現状の役割 |
|---|---|---|
| 代理店ダッシュボード | `/agency` | 紹介実績・土地販売報酬(戦国パスポート内部計算分)の表示 |
| 販売可能区画・紹介URL発行 | `/agency/plots` | 区画ごとの紹介URL・QR発行 |

### 管理画面

| 画面 | パス | 現状の役割 |
|---|---|---|
| 城マスタ | `/admin/castles` → `/admin/castles/[id]` | 城・区画の登録、区画を「販売済みにする(外部成約)」/「販売可能に戻す」(**注: 本指示書が求める外部注文管理の簡易的な先行実装**) |
| 城主契約 | `/admin/castle-lord-contracts` | 9状態の契約管理、初期30区画自動割当 |
| 土地報酬ルール/元帳/支払 | `/admin/castle-commission-rules`, `/admin/castle-commissions`, `/admin/castle-payouts` | 戦国パスポート内部での代理店・城主報酬計算(**指示書2-3および監査資料16章により、今後は非表示/参照専用化の対象**) |
| 購入履歴 | `/admin/purchases` | Stripe購入(石高/ガチャ券/土地区画/城主プラン)の一覧・返金 |
| 代理店管理・代理店連携設定 | `/admin/agents`, `/admin/agency-integration` | 代理店マスタ、外部システムとのSSO・階層同期 |
| メタバース所有権・利用権管理 | `/admin/metaverse/plot-rights` | `metaverse_plot_rights`の手動登録(区画5と別系統) |

**該当画面が存在しないもの**: 外部注文一覧・登録・詳細画面(`/admin/external-orders`系)、購入者↔LINEユーザー紐付け確認画面、未処理案件ダッシュボード。

---

## 3. 現在の関連API

| API | 現状の役割 |
|---|---|
| `GET /api/me/plots` | `/my-land`用。`castle_plots.owner_user_id`で検索。res.okチェック済み(前回修正済み) |
| `GET /api/castles`, `GET /api/castles/[id]`, `GET /api/castles/[id]/plots` | 公開中の城・区画情報取得 |
| `POST /api/plots/[id]/reserve` | Stripe直販フロー用の区画仮予約(`plot_reservations`へinsert、`status='pending'`の部分ユニークインデックスで排他制御)。**現在UIから未使用** |
| `POST /api/purchase/castle-plot-checkout` | Stripe Checkoutセッション作成。**現在UIから未使用** |
| `POST /api/stripe/webhook` | 決済完了時に`completePlotPurchase()`→`postLandSaleCommission()`→LINE通知を実行 |
| `PATCH /api/admin/castle-plots/[id]` | 区画情報の編集。`status: "sold"`指定で`sold_at`/`sold_price_yen`を設定(owner_user_idは設定しない=LINEユーザーと未紐付け) |
| `POST /api/admin/purchases/[id]/refund` | Stripe返金+`castle_plots`を`available`へ戻す+報酬取消/反対仕訳。**`stripe_session_id`前提のためexternal_ordersには流用不可** |

**該当APIが存在しないもの**: 外部注文CRUD、購入者検索(氏名・メール・電話・LINE表示名横断)、購入者↔LINEユーザー紐付け確定/解除、区画割当(複数区画/1注文)、権利付与確定(まとめてトランザクション処理)、LINE通知再送、CSV取込。

---

## 4. 現在の関連DBテーブル

```text
castles                      -- 城マスタ
castle_lord_contracts        -- 城主契約(9状態)
castle_lord_contract_events  -- 契約状態変更履歴
castle_lord_plan_settings    -- シングルトン設定
castle_plots                 -- 区画マスタ + 所有権(owner_user_id/sold_at/sold_price_yen)
plot_allocations             -- 城主への販売枠付与
plot_reservations            -- Stripe直販の仮予約(現在未使用)
purchases                    -- Stripe決済のみ。plot_id/contract_id/selling_agent_id列あり
commission_rule_sets         -- 報酬配分ルール(内部計算用、今後の扱いは要判断)
commission_ledger            -- 報酬元帳(内部計算用)
commission_adjustments       -- 報酬取消・反対仕訳
payouts                      -- 内部報酬支払記録
regional_transactions        -- 構造のみ、書込ロジック無し
agents                       -- 代理店マスタ。external_id/parent_external_id列あり
admin_audit_logs             -- actor_name / action / details(自由記述)のみ
metaverse_plot_rights        -- メタバース内覧側の所有権・利用権(castle_plotsと非連携)
```

**存在しないテーブル**: `external_orders`, `external_order_items`, `external_order_customer_snapshots`, `external_order_agent_snapshots`, `external_order_status_histories`, `line_notification_logs`(指示書16章の概念例に相当するものは一切無い)。

---

## 5. 再利用可能な処理

- **区画の排他制御パターン**: `plot_reservations`の`unique index ... where status = 'pending'`と同じ「部分ユニークインデックスで同時実行を防ぐ」設計思想は、外部注文の区画割当排他制御にもそのまま使える(7-4「二重割当防止」)。
- **状態遷移マトリクスパターン**: `castle_lord_contracts`の9状態遷移を純粋関数`isValidContractTransition()`で表現し、API層で強制する設計(`src/lib/castle-lord-contracts.ts`)は、外部注文の状態遷移(DRAFT→...→RIGHTS_GRANTED等)にも流用可能。
- **監査ログ呼び出しパターン**: `logAdminAction(actorName, action, details)`はそのまま呼び出せる。ただし現状は`details`が自由記述の1文字列のみで、指示書12章が求める構造化フィールド(対象注文ID/対象ユーザーID/対象区画ID/変更前/変更後)は表現できない。
- **管理者ロール判定**: `requireManagerRole()`は既存のまま「本部管理者のみ」操作(権利付与確定・取消・強制登録等)のガードに使える。
- **LINE個別送信の下請け関数**: `pushMessage(accessToken, lineUserId, text)`はそのまま使えるが、呼び出し側(送達記録・再送・重複防止)は新規実装が必要。
- **シングルトン設定パターン**: `castle_lord_plan_settings`と同型のテーブル設計は今回新規テーブルには直接関係しないが、将来の設定系拡張時の参考になる。
- **管理画面の一覧+絞り込みUIパターン**: `/admin/purchases`や`/admin/castle-lord-contracts`の一覧画面(状態バッジ・絞り込み・ページング未実装だが構造は近い)は、`/admin/external-orders`のUI実装時の下敷きにできる。

---

## 6. 重複・不整合

1. **区画の「権利の正本」が2系統存在する(指示書8-2が直接警告している状態)**
   - `castle_plots.owner_user_id` / `sold_at` / `sold_price_yen`(全国お城プロジェクト)
   - `metaverse_plot_rights`(`property_id`, `user_id`, `agency_id`, `right_type`: ownership/special_usage_right/rental/management/reserved)
   - 両者の間に**マッピングは一切存在しない**(`castle_plots`↔`metaverse_properties`のFK・対応表が無い)。指示書13章が求める「城区画ID⇔メタバース物件ID」の対応付けは現状ゼロから作る必要がある。
2. **区画を「販売済み」にする経路が2つ併存**
   - `completePlotPurchase()`(Stripe webhook経由、owner_user_id設定あり)
   - 管理画面PATCH(前回PRで追加、owner_user_id設定なし=LINEユーザー未紐付けのまま`sold`になる)
   - 外部注文管理を実装する場合、後者は本格的な「注文→紐付け→割当→権利付与」フローに置き換わり、実質的に廃止される見込み。
3. **報酬計算(`commission_ledger`等)が、今後正となる外部システムの報酬と二重に存在しうる**
   - 現状`postLandSaleCommission()`はStripe webhook経由の購入でのみ発火する(外部注文では発火しない)ため、二重計上は技術的には起きていない。ただし監査資料16章が指摘する通り、管理画面上に「戦国パスポート内部で計算された(実際には使われない)報酬額」が表示され続けることが利用者の誤認を招く状態。
4. **`purchases`テーブルが「Stripe決済」を前提とした列構成**(`stripe_session_id not null unique`)
   - 外部注文はStripeセッションを持たないため、`purchases`をそのまま外部注文にも使う設計は取れない。新規テーブルが必要(指示書16章の方針と整合)。

---

## 7. 破壊的変更の可能性

- `castle_plots`への列追加(想定: 注文/紐付け関連の参照列)は既存のStripe直販コードパス(`completePlotPurchase`、返金route)に影響しないよう、既存列は変更せず追加のみに留める必要がある。
- `admin_audit_logs`に構造化フィールドを追加する場合、既存の`logAdminAction(actorName, action, details)`呼び出し(30箇所以上)を壊さないよう、新規引数はオプショナルにするか、別テーブルに分離する。
- `/admin/castle-plots/[id]` PATCH(前回追加の「販売済みにする」)は、外部注文管理の実装後は権利付与フローの一部に統合されるか、非推奨化する可能性がある。既存に叩いた実績があれば移行方法を検討する必要がある(本番でまだ使われていなければ影響なし)。
- 土地報酬ルール/元帳/支払画面を非表示化する場合、`requireManagerRole()`等の権限チェックロジック自体は監査ログや将来の再表示に備えて残し、UIのみ非表示にする方が安全(指示書20章「既存データを一括削除しない」)。

---

## 8. 既存データへの影響

- 本番Supabaseに城主プラン関連マイグレーションが適用されたのは今回のセッション終盤(2026-07-14)であり、現時点で実データ(城・区画・契約)はほぼ存在しないと推測される。**ただし監査資料27章P1に「既存購入者300〜400区画の移行方法」が明記されており、外部システム側に既に相当数の既存購入者がいる可能性が高い**。この移行(初期データ投入)の方法は指示書21章が「仕様確認事項」として明記すべき項目に該当し、現時点でコードからは判断できない(要ヒアリング)。
- `metaverse_plot_rights`に既存データがある場合、`castle_plots`との対応付けを後から追加する際に、どちらのuser_idを正とするかの整合作業が必要になる可能性がある。

---

## 9. 不明点(実装計画書の「仕様確認事項」へ引き継ぐ)

1. 1注文の一部区画だけ先に権利付与するか(指示書21章に明記された論点、コード調査だけでは決定不可)。
2. 城主販売枠(`plot_allocations`の`granted_capacity`)を、外部注文のどの時点(注文登録時/区画割当時/権利付与確定時)で消費とみなすか。
3. 土地報酬ルール/元帳/支払画面を「非表示」にするか「参照専用(閲覧のみ)」にするかの選択、およびそのタイミング(この調査と同時か、外部注文機能と同時か)。
4. 既存購入者(300〜400区画)の移行方法。CSV一括登録を想定するか、個別手動登録か。
5. `castle_plots`↔`metaverse_properties`の対応付けを、今回のフェーズでどこまで作るか(指示書13-2は「最低限」の対応のみ求めている)。
6. 購入者の電話番号・メールを、既存の戦国パスポートユーザー情報へ上書きするか、外部注文側のスナップショットとしてのみ保持するか。
7. `admin_audit_logs`の構造化(対象ID等)を、既存テーブルの列追加で行うか、新規テーブルに分離するか。

---

*本ドキュメントは「戦国パスポート 開発者向け実装指示書 v1.0」3章の必須調査に対応するもの。次のステップは `docs/external-purchase-implementation-plan.md` の作成。*
