# カード収集型「国取り」× 城主経済圏 連携 現状監査

「戦国パスポート カード収集型『国取り』× 城主経済圏 連携実装指示書v1.0」12章フェーズ0に対応する、実装着手前の現状調査記録。国取り側・経済圏側・城主プラン側の既存実装を横断的に調査し、指示書が要求する新機能との接続点・不整合・移行リスクを洗い出す。

---

## 1. 既存画面(関連範囲)

| 画面 | パス | 内容 |
|---|---|---|
| 国家ダッシュボード(ホーム) | `/`(`src/app/(app)/page.tsx`) | 石高・戦功・ガチャ券・所持武将数・制圧国数などの一覧、経済圏カード群 |
| 武将登用(ガチャ) | `/gacha` | 無料/有料ガチャ。抽選確定と同時に国取り判定・貢献ポイント付与まで同期実行 |
| 図鑑・所持武将一覧 | `/collection` | 所持武将数と全体数の表示 |
| 日本地図・国盗り進捗 | `/map` | 地方ごとの制圧状況を地図で可視化 |
| 地方コンプ | `/regions` | 地方コンプ達成状況・石高ボーナス |
| 天下統一達成フロー | `/tenka-toitsu` | 全国制覇の演出・代表武将選択・実績記録 |
| 国家ランキング | `/ranking` | 4種のランキング(表示専用) |
| 城一覧・城詳細 | `/castles` → `/castles/[castleId]` | 城の紹介・販売区画閲覧。歴史情報と城主情報は分離されていない |
| メタバース内覧 | `/metaverse-tour/...` | エリア→街区→区画(物件)の階層。城主プランとは非連携 |
| 城主ダッシュボード | `/castle-lord/dashboard` | 契約状況・販売枠・報酬 |

管理側は `/admin/castles`、`/admin/castle-lord-contracts`、`/admin/provinces`、`/admin/warlords`、`/admin/gacha-rates` 等(詳細は既存の `docs/featureinventory.md` 参照)。

---

## 2. 既存API(関連範囲)

- `GET/POST /api/gacha/draw`, `/api/gacha/draw-paid` — ガチャ抽選。`src/lib/gacha.ts` の `performDraw()` を呼び、抽選確定と同一リクエスト内で国取り判定まで完了する。
- `GET /api/rankings` — `src/lib/rankings.ts` の `getRanking()` を4種のランキング種別で呼び出し。
- `GET /api/economy` — 国家貢献ポイント・OVE表示用のサマリー。
- `GET /api/castles`, `/api/castles/:id`, `/api/castles/:id/plots` — 城・区画の公開情報。
- `POST /api/purchase/castle-plot-checkout` — Stripe直販ルート(現在は代理店経由の外部購入管理に置き換わり未使用)。
- 管理者向け: `/api/admin/castle-lord-contracts/*`(状態遷移)、`/api/admin/external-orders/*`(外部購入管理)等。

汎用的な「国制覇条件API」「城解放API」「報酬受取API」は**存在しない**(指示書8章が新設を要求している範囲)。

---

## 3. 既存DB(関連テーブル)

### 国取り・武将

| テーブル | 主要カラム | 備考 |
|---|---|---|
| `provinces` | `id, name(unique), region(text), is_final_province, unlock_condition_count, display_order, landmark_name, theme_description, has_castle_town, castle_town_concept_art_url` | **`regions`独立マスタは無い**。地方名は`region`列の自由入力text。地方の一覧・表示名は`src/lib/regions.ts`の`REGION_TITLES`/`REGION_SLUGS`にハードコード(FKなし、文字列一致のみ) |
| `warlords` | `id, province_id(FK not null), name, rarity, slot_type(common/mid/rare), stats_json, lore, image_url, ...` | `unique(province_id, slot_type)`制約により**1国につき厳密に3体固定**。人物ID(`person_id`)やバリエーション概念は存在しない |
| `user_warlords` | `id, user_id, warlord_id, count(default 1), acquired_at` | `unique(user_id, warlord_id)`。重複所持は新規行ではなく`count`インクリメントのみ(カードとして別扱いにはならない) |
| `user_provinces` | `user_id, province_id, is_conquered, conquered_at` | `unique(user_id, province_id)`。永続実績として保存 |
| `achievements` | `id, user_id, achievement_type(text), referring_agent_id, achieved_at, selected_warlord_id` | 地方コンプ(`region_complete_<slug>`)・天下統一(`tenka_toitsu`)を汎用textカラムで管理。新しい`achievement_type`の追加は容易 |
| `gacha_logs` | `id, user_id, warlord_id, is_paid, conquered_provinces_count_at_draw, created_at, animation_asset_id, animation_key` | ガチャ履歴。確定は完全同期(キュー・非同期処理なし) |

### 経済圏・報酬

| テーブル | 主要カラム | 備考 |
|---|---|---|
| `users.contribution_points` | 累積残高int | 単純な残高カラムのみ(専用の増減履歴テーブルではない) |
| `user_activity` | `id, user_id, activity_type, point, created_at` | 貢献ポイント加算の全履歴(`recordContribution()`経由) |
| — OVEウォレット | 専用テーブルなし | `contribution_points`をその場で1:1表示するのみ。増減履歴付き台帳(指示書6-13)は**未実装** |
| — 報酬受取箱 | 該当なし | 達成時は全て即時付与。「受け取る」操作を要する仕組み(指示書6-12)は**未実装** |

### 城主プラン・区画

| テーブル | 主要カラム | 備考 |
|---|---|---|
| `castles` | `id, name, prefecture, region(text), status(draft/recruiting/published/hidden), description, main_image_url, unity_reference, display_order` | **`province_id`のようなFKは存在しない**。`region`は自由入力textで`provinces.region`とは無関係。史実城主・監修状態のカラムも無い |
| `castle_lord_contracts` | 9状態(`draft/screening/approved/payment_pending/training/active/suspended/expired/terminated`) | `src/lib/castle-lord-contracts.ts`の状態機械で管理。史実城主フィールドなし(申込者=候補者情報のみ) |
| `castle_plots` | 8状態(`draft/available/reserved/application_pending/payment_pending/sold/cancelled/suspended`)、`owner_user_id, sold_at, sold_price_yen` | 所有権は専用テーブルを持たず本体に直接記録 |
| `metaverse_areas/blocks/properties/...` | — | `castles`/`castle_plots`との接続カラムは**一切存在しない**(`castle_id`なし)。完全に独立した別階層 |

---

## 4. 国制覇判定の現状

- `src/lib/gacha.ts` の `maybeConquerProvince(userId, provinceId)` が唯一の判定ロジック。
- 条件は「その国に紐づく3体の武将(`warlords`, `unique(province_id, slot_type)`)を全て所持しているか」という**完全ハードコード**判定で、管理画面から条件を変更する仕組みは無い。
- 判定タイミングはガチャ抽選確定と**同一リクエスト内で同期実行**(`performDraw()` → `addWarlordToUser` → `maybeConquerProvince`)。DBトランザクションではなく逐次クエリ。
- 判定結果は`user_provinces.is_conquered`に永続保存(`unique(user_id, province_id)`により再判定しても重複しない=概ね冪等)。

指示書6-3が要求する「指定武将N種類以上」「レアリティ条件」「条件のAND/OR」等の**条件エンジンは存在しない**(1国=3体全部、の固定ロジックのみ)。

## 5. 地方制覇・天下統一判定の現状

- 地方コンプ: `maybeCompleteRegion(userId, region, allProvinces)`。指定地方内(美濃国除く)の全国が`is_conquered`かを確認し、`recordAchievementOnce()`で`achievements(achievement_type="region_complete_<slug>")`へ冪等保存、石高ボーナス(地方内国数×100)を付与。
- 天下統一: `src/lib/tenka-toitsu.ts` の `completeTenkaToitsu(userId, selectedWarlordId)`。美濃国制圧が前提、`achievements(achievement_type="tenka_toitsu", selected_warlord_id)`へ保存。
- どちらも**永続実績**としてDB保存済み(既に本番運用中のユーザーデータが存在する前提で扱う必要がある=指示書11-1「既存互換性」に直結)。

## 6. 既存ランキングの参照データ

`/api/rankings` → `src/lib/rankings.ts` の `getRanking()`。4種(`contribution`/`warlord_collection`/`province_conquest`/`academy`)全てDBビュー/RPCを使わずJS側で都度集計。画面上「表示のみ、報酬付与は行わない」と明記済み。指示書4-1「国家ランキングは勝敗判定に使用しない」という既存方針とすでに整合している。

## 7. OVE表示の現状

`src/components/economy/OveWalletCard.tsx` が `users.contribution_points` をそのまま「OVE(予定)」として1:1表示しているのみ。専用テーブル・換算計算ロジックは存在しない。指示書2-1が要求する「暗号資産ウォレットではない」旨の注意書きは、現行UIには**明示されていない**(要追加)。増減履歴付き台帳(6-13)も同様に未実装。

## 8. 城マスタの現状

- `castles`は`provinces`と**完全に未接続**(FKなし、`region`列も自由入力textで別管理)。
- 史実城主/公式城主パートナーの分離表示という概念自体がまだ存在しない(`description`一つに情報が集約)。
- 解放条件・公開レベル(指示書6-6)は`status`(draft/recruiting/published/hidden)の単純な二値的切替のみで、`provinces.unlock_condition_count`のような条件付き解放パターンは城側に無い。
- メタバース内覧との接続もゼロ(内覧導線を城詳細に出す=指示書6-7の要求には新規カラム/中間テーブルが必須)。

## 9. 再利用可能な既存処理

- **状態機械パターン**: `castle-lord-contracts.ts`の`isValidContractTransition()`/`transitionContract()`(履歴テーブルへの記録込み)は、指示書が要求する報酬状態(`REWARD_AVAILABLE`等)や城主コンテンツ承認状態(`DRAFT→SUBMITTED→...`)にそのまま応用できる設計。
- **条件付き解放パターン**: `provinces.unlock_condition_count` + `getEligibleProvinces()`は、城の解放条件(6-6)を実装する際の直接の雛形になる。
- **冪等化パターン3種**が既に確立している。用途に応じて使い分け可能。
  - ユニーク制約 + upsert(`user_provinces`, `daily_mission_completions`)
  - 存在チェック関数(`recordAchievementOnce()`)
  - ステータスガード + 部分ユニークインデックス(`purchases.status`, `commission_ledger`, `line_notification_logs`)
- **LINE通知の本格実装パターン**: `external-order-notifications.ts`(`line_notification_logs`テーブルで送達記録・重複防止・再送)が、`castle-notifications.ts`(記録なしのベストエフォート)より優れた設計として既に存在する。新機能の通知はこちらのパターンを踏襲すべき。
- **監査ログ**: `logAdminAction(actorName, action, details?, target?)`は対象種別・ID・変更前後スナップショットまで既に対応済みで、そのまま利用可能。
- **管理者2ロール**: `requireManagerRole()`をそのまま財務影響操作(報酬確定・調整等)のガードに使える。

## 10. 不整合・設計ギャップ

1. **国(provinces)と城(castles)が完全に未接続。地方(region)の正本も分散している** — `provinces.region`(text)と`castles.region`(text)はどちらも自由入力で、FKもマスタテーブルも共有していない。指示書6-1が要求する`castle_province_relations`等の新設時に、既存の自由入力region文字列同士の突き合わせ(データクレンジング)が必要になる可能性が高い。
2. **武将の人物ID・バリエーション概念が存在しない** — 現行スキーマは「1国=3体固定」で完結しており、指示書6-2が言う「同一人物の複数バリエーション」自体が現時点では発生し得ない。将来カード追加时の拡張余地としてスキーマ設計する必要はあるが、**今回のスコープでは複雑な人物マスタ新設は過剰設計になりうる**。
3. **国制覇条件エンジンが存在しない** — 現状は3体全部所持のハードコード。指示書6-3の条件設定機能(管理画面から変更可能)は新規実装。
4. **報酬受取箱・OVEポイント台帳が存在しない** — 現状は全て即時付与、増減履歴もない。指示書6-12/6-13は完全新規機能。
5. **城の解放条件・監修状態カラムが存在しない** — `status`の単純切替のみ。
6. **メタバース内覧と城主プランが未接続** — 城詳細への内覧導線(6-7)には新規の中間カラム/テーブルが必要。
7. **城イベント・城主コンテンツ申請承認フロー(7-4)が存在しない** — 完全新規。
8. **LINE通知の実装が2パターン混在** — 新機能では`external-order-notifications.ts`パターンへ統一すべき(`castle-notifications.ts`の簡易版を模倣しない)。
9. **報酬付与処理が分散している** — `grantPurchase()`(webhook内ローカル関数)、`recordContribution()`、`recordAchievementOnce()`、`daily_mission_completions`のupsertがそれぞれ独立した冪等化パターンを持つ。指示書6-11「報酬マスタ+報酬受取箱」を新設する際、これら既存の即時付与処理と共存させる設計(既存処理を壊さず、新規達成イベントのみ受取箱経由にする等)が必要。
10. **汎用機能フラグが存在しない** — 個別の`status`/nullable列で代替する既存方針を踏襲する。

## 11. 移行リスク

- `user_provinces.is_conquered`、`achievements`(`tenka_toitsu`、`region_complete_*`)は**本番稼働中の永続データ**。新しい国制覇条件エンジンを導入しても、既存の達成済みユーザーの状態を意図せず未達成へ戻さないこと(指示書6-3「条件変更で既に制覇した国を原則未制覇へ戻さない」と完全に整合する設計が必須)。
- `warlords.province_id`は既存の`maybeConquerProvince()`が直接依存している。城取り連携のための`castle_province_relations`等の新設は、この既存ロジックに影響を与えない付加テーブルとして設計する。
- `castles.region`と`provinces.region`の文字列不一致がある場合、突き合わせ時にデータクレンジング(手動マッピング表の作成)が必要になる可能性がある。
- OVE名称変更(6-1)はUIラベルのみの変更であれば低リスクだが、既存の`contribution_points`を触らずに表示文言のみ変えることで既存の石高/戦功/貢献ポイント計算に影響を与えないこと。

---

*関連ドキュメント: `docs/collection-conquest-implementation-plan.md`(次工程で作成)、`docs/featureinventory.md`、`docs/external-purchase-current-state-audit.md`*
