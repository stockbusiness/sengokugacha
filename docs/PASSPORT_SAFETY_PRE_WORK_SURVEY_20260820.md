# Passport 安全化 作業前確認レポート

`01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` §「作業前確認」および
`00_4SYSTEM_EXECUTION_ORDER_20260820.md` §4 に基づく着手前調査。

**本レポートの承認を受けるまで、本番設定変更・マイグレーション適用・既存データ削除・マージ・デプロイは行いません。**

| 項目 | 値 |
|---|---|
| 調査日 | 2026年8月20日 |
| 対象リポジトリ | `stockbusiness/sengokugacha` |
| 指示書の監査基準Commit | `d16b9d77dc7496902118d140a8b482de1f411448` |

---

## 1. 現在のブランチと最新コミット

| 項目 | 値 |
|---|---|
| ブランチ | `claude/sengoku-economy-os-j0d2nl` |
| HEAD | `36cb030` feat(ops): マイグレーションの適用漏れを運用監視で検知する |
| `origin/main` | `d17efb4` Merge pull request #163 |
| 未コミット差分 | **なし** |
| 使用DB | Supabase（PostgreSQL）。マイグレーションは手動適用運用 |

### ★ 監査基準コミットとの差分（要判断）

指示書の監査基準 `d16b9d7` は **「はじまりの旅」PR2〜PR4 がマージされる前**の状態です。以降4コミット進んでいます。

| コミット | 内容 |
|---|---|
| `af97e95` | 「はじまりの旅」ミッション基盤（PR2） |
| `f5581e2` | 「はじまりの旅」参加者画面（PR3） |
| `ac7724d` | 「はじまりの旅」管理画面（PR4） |
| `36cb030` | マイグレーション適用漏れ検知（PR #164、未マージ） |

**実施順序書§3-7 は「上記が安定してから『はじまりの旅』と段階的3,000 OVE付与を実装する」としていますが、既に実装・マージ済みです。**

ただし以下の状態にあり、**実質的に稼働していません**。

- `learning_journey_settings` の機能フラグは**全て `false`**（DBに設定行すら無く、コード上の既定値が全てOFF）
- コースが0件のため参加者側の入口ごと非表示
- OVE付与は行わず、付与要求を `PENDING` で記録するだけ。送信アダプタは未実装

**判断をお願いしたい点**: このまま「フラグOFFで凍結」として扱ってよいか、それとも実施順序に合わせて何らかの措置（コードの巻き戻し等）を取るか。
巻き戻しは既に本番へ出ているコードの削除になり、リスクが上がるため、**フラグOFFのまま凍結**を推奨します。

### staging DBの適用状況

| version | 状態 |
|---|---|
| 〜`20260815000001` | 適用済み（記録81件） |
| `20260816000001` | **未適用**（PR #164 が未マージのため） |

なお本調査の直前、`20260814000001` の適用漏れにより相談申込が動かない事象が発生し、適用済みです。同種の再発を検知する仕組みが PR #164 です。

---

## 2. 指示書と現行実装の差分

### PR-P1: 旧コミッション・支払機能の新規書込み停止

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| 書込み停止フラグを既存の設定機構に追加、既定は停止 | **存在しない** | 新規に追加が必要 |
| サービス層で一括ガード | **ガード無し**。各APIが直接書く | 集約点の新設が必要 |
| 停止中は管理画面を参照専用にし、移管済みを表示 | 常時編集可 | UI変更が必要 |
| APIは削除せず機械判定可能なエラーコードを返す | エラーコード体系が無い（`{ error: string }` のみ） | コード体系の追加が必要 |
| 既存履歴・確定額・支払記録は保持 | 保持されている | **差分なし** |

### PR-P2: Entitlement適用範囲の制限

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| 権利種別を明示的なallowlistにする | **実質的に既にallowlist**。`process_entitlement_grant()`（`20260808000003`）が `kokudaka` / `gacha_ticket` 以外を `v_column := null` にする | **コード上は満たしている**。明示化・可視化が不足 |
| NFT・未知の権利種別をローカル残高へ適用しない | 適用されない（`v_column` が null なら残高更新をスキップし、台帳記録のみで `applied` にする） | **差分なし** |
| 未知イベントは受信記録と理由を残す | 記録はされるが、「未知種別だから残高非適用」という**理由が残らない**。`application_status` は `applied` になり、適用されたのか対象外なのか後から区別できない | 理由の記録が必要 |
| 再送で重複適用しない | `claim_entitlement_application()` で担保済み | **差分なし** |
| 商品所有者マップ（NFT=Market / OVE=Wallet / ゲーム=Passport） | **存在しない** | 新規に追加が必要 |

**評価**: 受入条件「NFT/未知Entitlementを受けても国高・ガチャチケットが変化しない」は**現時点で既に満たされています**。PR-P2の主眼は、それを暗黙のDB関数依存ではなく明示的な設定として可視化し、「対象外」を記録に残すことになります。

### PR-P3: OVE誤表示の解消

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| `contribution_points` を1:1でOVE表示する処理を廃止 | **該当処理が存在する**。`OveWalletCard` に `economy.contribution.total` をそのまま渡している | 廃止が必要 |
| Wallet未接続時は正しい単位で表示するかカード自体を非表示 | 「OVE移行予定ポイント（準備中）」として `pt` 単位で表示 + 注意書き | 指示書の要求は「OVEとして見せない」。現状は名称に「OVE」を含む |
| Wallet接続時のみWallet残高を「OVE」表示 | **Wallet接続処理が存在しない** | 新規に追加が必要（ただしWallet未稼働のため接続分は設計のみ） |
| タイムアウト時に前回値をOVEとして確定表示しない | 該当処理が無い | 接続実装時に必要 |

**補足**: `OveWalletCard.tsx` には「呼び出し元やDBには『OVE』という語を焼き込まない」という設計判断が既に明記されており、名称を1箇所に集約済みです。差し替えは容易です。
なお `ContributionCard` は別途「国家貢献ポイント」として正しい単位で表示しており、**同じ値が2箇所に別名で出ている**状態です。

### PR-P4: 管理画面認証の安全化

| 指示書の要求 | 現状 | 差分 |
|---|---|---|
| roleなし旧Cookieのmanagerフォールバック廃止 | **フォールバックが存在する**。`getAdminRole()` が `adminRole` クレーム欠落時に `manager` を返す | 廃止が必要 |
| 認証済み管理者IDを監査ログに記録 | 実行者名は**ログイン時の任意入力（自己申告）** | 個別アカウント基盤が前提。互換期間の設計が必要 |
| 共有パスワードから個別アカウントへの互換期間 | 共有パスワード2本（manager / operator）のみ | 新規に追加が必要 |

**注**: PR-P4は「P1完了後」と指示書に明記されています。

---

## 3. 実際に有効になっている機能フラグ・設定

### 環境変数（値は伏せます）

| 変数名 | 用途 | 設定状況 |
|---|---|---|
| `SESSION_SECRET` | JWT署名 | 設定済み（稼働中のため） |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | DB接続 | 設定済み |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_OPERATOR` | 管理画面の共有パスワード（2ロール） | 設定済み |
| `CRON_SECRET` | outbox自動再送の認証 | **未設定**。自動再送が停止中（手動drainのみ） |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | エラー監視 | 不明 |
| `GACHA_VIDEO_MAX_*` / `METAVERSE_VIDEO_MAX_*` | アップロード上限 | 未設定なら既定値 |

**機能のON/OFFに使われている環境変数は1つもありません。** 設定は全てDBの設定テーブルです。

### 設定テーブル（いずれも単一行運用）

| テーブル | 用途 |
|---|---|
| `payment_settings` | 決済設定 |
| `line_settings` | LIFF/LINE設定 |
| `agency_integration_settings` | 代理店システム連携 |
| `sen_no_kuni_hub_settings` | 共通顧客HUB連携 |
| `castle_lord_plan_settings` | 城主プラン（料金・契約期間・販売枠） |
| `metaverse_tour_settings` | メタバース内覧 |
| `ai_image_settings` | AI画像生成 |
| `learning_journey_settings` | 「はじまりの旅」。**全フラグ `false`、DBに行が無く既定値が使われている** |

**コミッション・支払機能を止めるフラグは現時点で存在しません。** これがPR-P1で追加するものです。

**[要確認]** 各設定テーブルの実際の値（接続先URL、有効/無効の状態）は staging/本番DBの中身であり、このサンドボックスからは確認できません。運用画面での確認をお願いします。

---

## 4. 対象機能の書込み経路

### `commission_rule_sets`（報酬ルール）

| 経路 | 種別 | 権限 |
|---|---|---|
| `POST /api/admin/commission-rule-sets` | 新規作成 | admin |
| `PATCH /api/admin/commission-rule-sets/[id]` | 更新 | admin |
| `DELETE /api/admin/commission-rule-sets/[id]` | **削除** | admin |
| `POST /api/admin/commission-rule-sets/[id]/publish` | 公開 | admin |
| 参照のみ | `src/lib/commission-rule-sets.ts`（2箇所） | — |

管理画面: `/admin/castle-commission-rules`

### `commission_ledger`（報酬元帳）

| 経路 | 種別 | 起点 |
|---|---|---|
| `postLandSaleCommission(purchaseId)` → `insert` | **新規計上** | Stripe決済確定後の付与処理（`run-purchase-grant.ts` の `commission_posted` ステップ） |
| `confirmMaturedCommissions()` → `update status='confirmed'` | 確定 | `POST /api/admin/commission-ledger/confirm-matured` |
| `applyRefundAdjustments()` → `update status='reversed'` + `commission_adjustments` へ insert | 返金連動の取消 | `POST /api/admin/purchases/[id]/refund` |
| `POST /api/admin/payouts` → `update status='paid'` | 支払済みへ遷移 | 支払処理 |

管理画面: `/admin/castle-commissions`

**最も重要な自動書込みは `postLandSaleCommission()` です。** 土地区画の決済が確定するたびに元帳へ行が挿入されます。ここを止めるのがPR-P1の中心になります。

### `payouts`（支払）

| 経路 | 種別 | 権限 |
|---|---|---|
| `GET /api/admin/payouts` | 参照 | admin |
| `POST /api/admin/payouts` | **新規作成 + 元帳を paid へ更新** | **manager限定** |

管理画面: `/admin/castle-payouts`

### purchase / external order / Stripe / entitlement

| ルート | 対象 |
|---|---|
| `/api/purchase` | 参加者からの購入開始 |
| `/api/stripe/webhook` | Stripe決済確定 → 付与処理 → コミッション計上 |
| `/api/admin/purchases`（`[id]/refund`、`[id]/retry-grant` 等） | 購入管理・返金 |
| `/api/admin/external-orders`、`/api/admin/external-order-items`、`/api/admin/external-order-plot-assignments` | 外部ショップ経由の注文 |
| `/api/admin/entitlements` | Entitlement管理 |

**商品種別**

| 定義箇所 | 値 |
|---|---|
| `purchases.item_type` | `kokudaka` / `gacha_ticket` / `tenka_pass` / `land_plot` / `castle_lord_plan` |
| `commission_ledger.product_type` | `land_plot` のみ |
| `external_order_items.product_type` | `land_plot` のみ |
| `entitlements.entitlement_type` → 残高適用 | **`kokudaka` と `gacha_ticket` のみ**。それ以外は残高非適用 |

### OVE表示の取得元

| コンポーネント | 値の取得元 | 表示 |
|---|---|---|
| `OveWalletCard` | `/api/economy` → `contribution.total`（= `users.contribution_points`） | 「OVE移行予定ポイント（準備中）」/ 単位 `pt` |
| `ContributionCard` | 同上 | 「国家貢献ポイント」/「総国家貢献」 |

**同じ `users.contribution_points` が、同一画面に2つの異なる名前で表示されています。**

---

## 5. DB変更の必要性

| PR | DB変更 | 内容 | 型 |
|---|---|---|---|
| PR-P1 | **必要** | `commission_write_settings`（仮）を新設。または既存の `castle_lord_plan_settings` へ停止フラグ列を追加 | 追加型 |
| PR-P2 | **必要** | `entitlements` へ「対象外と判定した理由」を記録する列を追加。および `process_entitlement_grant()` の更新（allowlist外を `applied` ではなく `not_applicable` として記録） | 追加型 |
| PR-P3 | 不要 | 表示ロジックのみ | — |
| PR-P4 | **必要になる可能性** | 管理者アカウントテーブル。互換期間の設計次第 | 追加型 |

いずれも**追加型**で、既存テーブル・履歴の削除は行いません（実施順序書§4）。

**設計上の選択（承認をお願いしたい点）**: PR-P1の停止フラグを

- (a) 新規テーブル `commission_write_settings` にするか
- (b) 既存 `castle_lord_plan_settings` に列を足すか

**(a) を推奨します。** コミッション・支払は城主プラン設定とは責務が異なり、Agencyへ移管する対象なので、独立したテーブルの方が後で切り離しやすいためです。

---

## 6. 他システムとの契約・仕様上の不明点

| # | 不明点 | 影響するPR | 確認先 |
|---|---|---|---|
| 1 | **Agency側の報酬計算がいつ稼働するか。** Passportで新規計上を止めた瞬間から、土地販売の報酬はどこにも記録されなくなる | PR-P1 | 運営 / Agency |
| 2 | 停止フラグの既定値は「停止」と指示書にあるが、**Agency側が未稼働の期間に土地販売が発生した場合の扱い**（記録が欠落してよいか、暫定的に記録だけ残すか） | PR-P1 | 運営 |
| 3 | 機械判定可能なエラーコードの**体系**（他システムと共通の命名規則があるか） | PR-P1 | 4システム共通 |
| 4 | Marketが送ってくる **Entitlementの `entitlement_type` の実際の値**（NFT作品・シリアル・デジタルコレクションで何を送るか） | PR-P2 | NFT Market |
| 5 | 商品所有者マップの**粒度**（`entitlement_type` 単位か `product_code` 単位か） | PR-P2 | 4システム共通 |
| 6 | **Wallet残高照会APIの利用可否。** 既に調査済みで `GET /api/v1/service/accounts/{externalUserId}/balance` は存在するが、`service_integrations` の `SENGOKU_PASSPORT` 行が未発行 | PR-P3 | OVEW Wallet |
| 7 | Wallet未接続期間の表示方針（「国家貢献ポイント」表示に統一するか、カード自体を消すか） | PR-P3 | 運営 |
| 8 | 個別管理者アカウントの**認証方式**（Passport独自か、Agency SSOに寄せるか） | PR-P4 | 4システム共通 |

**#1 と #2 は PR-P1 の設計を左右します。** 「新規計上を止める」だけでは、Agencyが受け皿として動くまでの間、土地販売の報酬記録が失われます。指示書§4の実施順序（Passport停止 → Market送信 → Agency受信）どおりだと、この期間が必ず発生します。

---

## 7. PRの分割案

指示書のPR単位を尊重し、以下に分割します。1PRに異なる目的を混在させません（実施順序書§4）。

| # | PR | 内容 | DB変更 | 依存 |
|---|---|---|---|---|
| 1 | **PR-P1** 旧コミッション・支払の新規書込み停止 | 停止フラグ（既定=停止）、サービス層の一括ガード、管理画面の参照専用化、エラーコード体系 | あり（追加型） | #1・#2 の回答 |
| 2 | **PR-P2** Entitlement適用範囲の明示 | allowlistの明示化、商品所有者マップ、対象外理由の記録 | あり（追加型） | #4・#5 の回答（無くても既定値で進行可） |
| 3 | **PR-P3** OVE誤表示の解消 | `contribution_points` のOVE表示を廃止、Wallet接続時のみOVE表示（接続部は設計のみ） | なし | #7 の回答 |
| 4 | **PR-P4** 管理画面認証の安全化 | roleフォールバック廃止、認証済み管理者IDの記録、互換期間 | あり（追加型） | **PR-P1完了後**、#8 の回答 |

### 着手順の提案

**PR-P3 → PR-P2 → PR-P1 → PR-P4** を提案します。指示書の番号順とは異なります。

理由:

- **PR-P3 は依存が最も少なく、DB変更も不要**で、誤表示という利用者に見える問題を最短で解消できます
- **PR-P2 は受入条件が既に満たされており**、実質的には可視化と記録の追加なので、リスクが低いです
- **PR-P1 は #1・#2 の運営判断が前提**です。判断前に着手すると設計をやり直す可能性があります
- PR-P4 は指示書が「P1完了後」と明記しています

番号順（P1から）をご希望であれば、#1・#2 の回答をいただいた時点で着手します。

---

## 8. 想定される影響とロールバック方法

### PR-P1

| 項目 | 内容 |
|---|---|
| 影響 | **土地区画の決済が確定しても報酬元帳に行が作られなくなります。** 支払処理も実行できなくなります |
| 影響を受けない | 既存の元帳・確定額・支払記録の参照、CSV出力、集計値。購入・決済そのもの |
| リスク | Agency側が未稼働の期間、土地販売の報酬が**どこにも記録されない** |
| ロールバック | 停止フラグをONに戻すだけ。コードを戻す必要はありません。追加列・受信記録は削除しません |

### PR-P2

| 項目 | 内容 |
|---|---|
| 影響 | allowlist外のEntitlementが `applied` ではなく「対象外」として記録されます。**残高への影響は現状と変わりません**（現時点で既に適用されていないため） |
| リスク | allowlistの取りこぼし。`kokudaka` / `gacha_ticket` 以外にローカル残高へ効くべき種別があった場合、それが止まります |
| 緩和 | 現行の `process_entitlement_grant()` が既に2種別しか適用していないので、**実質的にリスクはありません** |
| ロールバック | フラグでガードを停止。`application_status` の値は既存行を書き換えません |

### PR-P3

| 項目 | 内容 |
|---|---|
| 影響 | ホーム画面から「OVE移行予定ポイント」カードが消えるか、「国家貢献ポイント」表記に変わります |
| リスク | 利用者から「ポイントが消えた」と見える可能性。`ContributionCard` は残るので値自体は見えます |
| 緩和 | 表記変更の趣旨（OVEとは別物であること）を画面に添える |
| ロールバック | 表示のみの変更なのでコードを戻せば即座に復帰。DB変更が無いためデータ影響はありません |

### PR-P4

| 項目 | 内容 |
|---|---|
| 影響 | **既存の管理セッションのうち、`adminRole` クレームを持たない古いCookieが manager 権限を失います** |
| リスク | 互換期間を設けないと、Cookie更新前の管理者が突然操作できなくなります |
| 緩和 | 互換期間中は「再ログインしてください」と明示。期限を設けて段階的に無効化 |
| ロールバック | フラグでフォールバック復活。監査ログの追加列は削除しません |

### 共通のロールバック方針

実施順序書§5「ロールバックはデータ削除ではなくフラグ停止で実行できる」に従い、**全PRでフラグによる停止を先に用意します**。コードのrevertは最終手段とし、追加した列・記録は削除しません。

---

## 承認をお願いしたい事項

| # | 事項 | 推奨 |
|---|---|---|
| 1 | 「はじまりの旅」（実装済み・フラグOFF）の扱い | **フラグOFFのまま凍結** |
| 2 | Agency側が未稼働の期間に土地販売が発生した場合の報酬記録の扱い | 運営判断（§6 #1・#2） |
| 3 | PR-P1の停止フラグの置き場所 | **新規テーブル `commission_write_settings`** |
| 4 | 着手順 | **PR-P3 → PR-P2 → PR-P1 → PR-P4** |
| 5 | Wallet未接続期間のOVE表示方針 | 運営判断（§6 #7） |

秘密情報（`SESSION_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_PASSWORD`、HMACシークレット、LINEアクセストークン）の値は本書に一切記載していません。
