# 戦国パスポート Ver2.0 実装メモ

「戦国パスポート Ver2.0 追加指示書」に基づく実装内容・影響範囲・未実装事項のまとめ。

## 変更内容

### 国家ダッシュボード(ホーム画面拡張)
- `src/app/(app)/page.tsx` を拡張し、既存のパスポート情報(石高・戦功・ガチャ券・所持武将数・制圧国数・連続登城)は維持したまま、国民証カード・国家建設率・本日の任務・AI寺子屋/マーケット導線を追加。
- 追加コンポーネント: `src/components/dashboard/NationalIdCard.tsx`, `NationBuildingRateCard.tsx`, `DailyMissionsCard.tsx`

### 国民証
- 国民番号・表示名・階級・所属国(最初に制圧した国)・国家貢献ポイント・国家開発区画番号・創設メンバー/建国メンバーバッジを表示。
- 国民番号は `users.national_number`(identity列、既存行にも自動採番)で実データ管理。指示書にあった `SNP-${userId.slice(0,6)}` 方式の仮生成ではなく、DB採番を採用。

### 本日の任務
- `src/lib/daily-missions.ts` に5つの固定ミッションを定義。「無料武将登用を行う」「連続ログインする」は既存ログ(`gacha_logs`, `login_logs`)から自動判定、「図鑑を確認する」「AI寺子屋を見る」「お知らせを読む」は各画面からの簡易な達成通知(`/api/missions/ping`, `src/components/MissionPing.tsx`)で判定。
- 報酬付与やDBでのミッション定義管理は行わない(指示書どおり簡易実装)。

### 国家建設率
- `src/lib/passport.ts` の `calcNationBuildingRate()` で、制圧国数・所持武将数・連続ログイン・本日の任務達成率の加重平均から簡易計算(0〜100%)。
- 完全な経済ロジックではなく、指示書の「ダミー値または簡易計算」方針に沿った実装。

### 武将登用(ガチャ)化
- ユーザー向け表示のみ「ガチャ」→「武将登用」に変更(ボトムナビ、リッチメニュー、ガチャ画面のタイトル/ボタン文言)。
- 内部ファイル名・ルート(`/gacha`)・DBテーブル名(`gacha_logs` 等)・管理画面の表記は変更していない。
- 武将登用の結果画面に「国家貢献 +XXpt」を表示し、`users.contribution_points` へ実際に加算する(`src/lib/gacha.ts` の `grantContributionPoints`)。ポイント配分はレアリティ(common/mid/rare)+新規獲得ボーナスの固定値で、経済ロジックの厳密な設計は未実装。

### 国盗り・国家建設の接続
- 日本地図画面(`/map`)、地方コンプ画面(`/regions`)に「国家建設率をホームで確認」導線を追加。国盗り・地方コンプの進捗が国家建設率の計算に反映されている旨を文言で明示。

### 創設メンバー・建国メンバー
- `users` テーブルに以下を追加(マイグレーション `20260709000006_nation_dashboard_v2.sql`)。
  - 創設メンバー: `is_founding_member`, `development_plot_id`, `founding_member_number`
  - 建国メンバー: `is_nation_builder`, `nation_builder_plan`, `nation_builder_joined_at`
- 現時点では手動フラグのみで、実際の紐付け(土地オーナーDB・高額決済との連携)は未実装。管理画面からの編集UIも今回は用意していない(DBを直接更新する運用を想定)。

## 影響範囲

- 既存テーブルは列追加のみで、削除・型変更は行っていない。既存のINSERT文(`findOrCreateUserByLineId` 等)は新規カラムに触れないため、デフォルト値がそのまま適用される。
- 既存API(`/api/me`, `/api/gacha/draw`, `/api/gacha/draw-paid` 等)のレスポンスは全フィールドを維持したままフィールドを追加しているため、既存クライアントコードとの後方互換性を壊さない。
- 既存のガチャ抽選・Stripe決済・図鑑・国盗り・天下統一・管理画面・動画ガチャ演出・代理店紐付け・LINEリッチメニュー・外部送客リンク管理には変更を加えていない(表示名・付随テキストの変更を除く)。

## 未実装事項(指示書13章のとおり、今回は対象外)

- NFTオンチェーン連携、実決済、3Dメタバース、チャット、GPS、本格EC
- 高額商品(創設メンバー・建国メンバー)のStripe決済フロー
- 複雑なミッションDB(管理画面からのミッション編集含む)
- 完全な国家経済ロジック(国家建設率の本格計算、今月の建設目標、次に建設される機能などの動的表示)
- 既存DB/API名の大規模リネーム

---

## Ver2.1: 創設メンバー移行・建国メンバー導線フェーズ

### 変更内容

- `users` テーブルに `development_area`(所属エリア)、`development_plot_status`(開発ステータス。preparing/nation_building/metaverse_pending/priority/confirming の5値)を追加(マイグレーション `20260710000001_founder_migration_v21.sql`)。創設メンバー/建国メンバーの主要フィールドはVer2.0で追加済みのため流用。
- 既存の外部送客リンク管理(`external_links`)に `nation_builder_program`(建国メンバー募集)を追加。新しいリンク管理機能は作らず、既存の `/admin/links` からURLを設定できるようにした。
- コンポーネント追加: `FoundingMemberBadge`, `FoundingMemberPanel`, `DevelopmentPlotCard`, `NationBuilderOfferCard`(`src/components/founding-member/`)。国民証(`NationalIdCard`)のバッジ表示も `FoundingMemberBadge` に統一。
- 国家ダッシュボード(ホーム)に、創設メンバーのみ表示される `FoundingMemberPanel` / `DevelopmentPlotCard` と、全ユーザーに表示される `NationBuilderOfferCard`(創設メンバーには特別価格98,000円、一般ユーザーには一般価格198,000円を表示)を追加。
- 創設メンバー専用案内ページ `/founding-member` を新設。創設メンバーとは・既存土地の扱い・国家開発区画・メタバース優先権・パスポート内特典・FAQ・建国メンバー導線を掲載。フッター(`LegalFooter`)からもリンク。
- 管理画面のユーザー検索(`/admin/users`)に、創設メンバー/建国メンバーのバッジ表示・会員区分フィルター(全員/創設メンバーのみ/建国メンバーのみ/一般国民のみ)・インライン編集フォーム(創設/建国フラグ、番号、区画ID、所属エリア、プラン名)を追加。`PATCH /api/admin/users/[id]` を新設。

### 影響範囲

- 既存テーブルへの列追加のみ。既存のINSERT文には影響なし(デフォルト値が適用される)。
- 既存API・既存ページの動作に変更なし(表示追加のみ)。`is_founding_member`/`is_nation_builder` が false のユーザーには、新規コンポーネントはいずれも「何も表示しない」か「一般ユーザー向け表示」になるため、既存の見た目への影響は最小限。

### 未実装事項

- `development_plots` の別テーブル化(座標情報等の本格管理)は見送り、`users` テーブルへの最小追加のみ
- 創設メンバー特別価格・建国メンバー価格の管理画面/環境変数からの変更UI(現在は `src/lib/founding-member.ts` の固定値)
- 実際の決済フロー、権利証NFT、メタバース座標の本格反映
- 管理画面ユーザー一覧の50件制限を超えたページネーション(既存の検索機能の制約をそのまま踏襲)

---

## Ver2.2: AI寺子屋・マーケット・外部送客導線統合フェーズ

### 変更内容

- 既存の外部送客リンク管理(`external_links`)に `event_reservation`(イベント予約)を追加(マイグレーション `20260711000001_academy_market_events_v22.sql`)。他のリンク(AI寺子屋=`ai_art_school`、マーケット=`nft_marketplace`、建国メンバー=`nation_builder_program`)は既存キーをそのまま流用し、カテゴリ列は追加せず `src/lib/external-services.ts` の `EXTERNAL_LINK_CATEGORY_BY_KEY` で既存キー名から判別する方式にした(指示書9章の「カテゴリがない場合は既存リンク名で判別する」を採用)。
- ハブページを3つ新設: `/academy`(AI寺子屋)、`/market`(戦国市場)、`/events`(イベント)。いずれもLIFFログイン必須、`/api/links` から取得したURLをカード表示し、未設定カテゴリは「近日公開」と表示する(`ExternalLinkCard` コンポーネントで共通化)。
- 建国メンバー案内ページを `/nation-builder` として新設(Ver2.1の `/founding-member` とは別ページ)。`/founding-member` は既存土地オーナー向けの説明、`/nation-builder` は「今日から受け取れる価値/将来広がる価値」を軸にした新規参加者向けの価値訴求ページという役割分担にした。
- `NationBuilderOfferCard` を拡張し、`href`/`external`/`ctaLabel` props で「内部リンク(ダッシュボード→`/nation-builder`)」と「外部リンク(`/nation-builder`→実際のLP、未設定時は準備中)」の両方に対応。ホーム・`/founding-member`・`/nation-builder` の3箇所から同じコンポーネントを異なる導線設定で利用している。
- ホーム(国家ダッシュボード)の送客導線を、AI寺子屋/マーケットへの直接外部リンクから、`AcademyHubCard`/`MarketHubCard`/`EventHubCard`(3つの内部ハブページへの入口)に置き換え。加えて `NationContributionCategoryCard` を追加し、AI寺子屋(教育)・作品投稿/NFT(文化)・戦国市場(商業)・イベント(観光)・武将登用(軍事)の対応を説明(実際の国家ステータス計算は行わない)。
- 「本日の任務」に3件追加(`view_market` 市場を確認する、`view_events` イベント情報を見る、`view_nation_builder_info` 建国メンバー案内を見る)。`DailyMissionDef`/`DailyMissionStatus` に `rewardPoint` を追加し、`DailyMissionsCard` にポイント数を表示するが、実際の `contribution_points` への付与は行わない(指示書6章: 「実際のポイント保存は後続フェーズでもよい」を採用し、表示のみ)。

### 影響範囲

- 既存テーブルへの変更はなし(`external_links` への行追加のみ)。
- ホーム画面のAI寺子屋/マーケットへの導線が「外部リンクへの直接遷移」から「内部ハブページ経由」に変わった。URLの遷移先自体(最終的に開く外部LP)は変わらないため、送客効果への影響はない想定。
- 既存機能(LIFFログイン、ガチャ、Stripe決済、図鑑、国盗り、管理画面)への変更なし。

### 未実装事項

- 講座受講管理、動画教材管理、本格EC、商品出品、イベント予約DB、チケット販売(指示書12章のとおりスコープ外)
- 本日の任務の実際のポイント付与(`contribution_points` への反映)
- 国家ステータス(教育/文化/商業/観光/軍事)の本格計算

---

## Ver2.3: OVE・国家貢献・経済圏エンジン フェーズ

### 変更内容

- `user_activity`(id, user_id, activity_type, point, created_at)テーブルを新規追加(マイグレーション `20260712000001_economy_engine_v23.sql`)。国家貢献ポイントの取得元(武将登用・AI寺子屋・イベント参加・市場閲覧・ログイン)を時系列で記録する。`users.contribution_points`(Ver2.0で追加済み)は引き続き「総国家貢献」の集計値として使い、月間/本日はこのテーブルから都度集計する。
- `src/lib/user-activity.ts` の `recordContribution()` を新設し、活動ログへのinsertと `contribution_points` への加算を1箇所にまとめた。従来 `src/lib/gacha.ts` に直書きされていた `grantContributionPoints` はこの関数に置き換え、集計元を一本化した。
- Ver2.2で「表示のみ」だった本日の任務(AI寺子屋を見る=30pt、市場を確認する=5pt、イベント情報を見る=20pt、ログイン=2pt)を、Ver2.3で実際にポイント付与するよう変更。`daily_mission_completions`/`login_logs` への upsert が実際に新規insertされた(=本日はじめての達成)場合のみ `recordContribution()` を呼ぶことで、ページの再読み込みで無限にポイントが増えないようにしている。図鑑確認・お知らせ・建国メンバー案内の3任務は指示書の取得例に含まれないため、完了状態の表示のみでポイント付与はしていない。
- 国家貢献カード(`ContributionCard`)、国家活動履歴(`ActivityTimelineCard`)、OVEウォレット(`OveWalletCard`、モック。保有予定OVEは国家貢献ポイントを1:1で仮換算した表示専用の値)、バッジ(`BadgeCard`。連続ログイン7日/AI寺子屋1回以上/武将10体以上/創設メンバー/建国メンバーの5種)を国家ダッシュボードに追加。いずれも新設の `GET /api/economy` から一括取得する。
- 国家ランキング画面 `/ranking` を新設(国家貢献・武将収集・国盗り・AI活動の4種、タブ切り替え)。`src/lib/rankings.ts` で集計するが、小規模運用を前提にDBビュー/RPCは追加せず、既存テーブルをJS側で集計している(`GET /api/rankings?type=...`)。
- 国家ニュース(`NationNewsCard`)は新しいニュース管理機能を作らず、既存のお知らせ(`announcements`テーブル・`/admin/announcements`管理画面)をそのまま流用。ダッシュボード向けに `GET /api/announcements` を新設した。

### 影響範囲

- 既存テーブルは `user_activity` の新規追加のみで、既存テーブルへの列変更はない。
- 武将登用のポイント付与ロジック自体(レアリティ別の計算式)は変更していない。付与の実行経路のみ `recordContribution()` に統一した。
- 「本日の任務」のうちAI寺子屋/市場/イベントの3件は、Ver2.2まではポイント表示のみだったが、Ver2.3から実際に `contribution_points` が増えるようになった(仕様変更点。指示書1章の取得例に基づく)。
- 既存機能(LIFFログイン、ガチャ、Stripe決済、図鑑、国盗り、管理画面)への影響なし。

### 未実装事項

- OVE送金、ブロックチェーン連携、NFT同期、報酬自動計算(指示書のとおりスコープ外)
- OVEの正式な換算レート(現在は国家貢献ポイントの1:1仮表示)
- ランキングの大規模化に伴うDBビュー/RPC化(現在はJS側での全件集計)

---

## Ver2.4: アートディレクション・演出強化・管理画面の使いやすさ改善フェーズ

### 変更内容

- アートディレクション&世界観実装指示書・画面デザインガイド(UIモックアップ)を反映。デザインシステム(カラーパレット・角丸トークン・英字ロゴフォント)を指示書の値に統一、サイドメニュー新設、図鑑のレアリティ別フィルタタブ・色分け、共通ローディングスピナー化などを実施(新規ページは増やさず既存画面の完成度向上に集中)。
- GSAPを新規導入し、コード駆動のアニメーション基盤を追加。`GachaReveal`(武将登用結果カード)の出現演出をCSSキーフレームから3Dフリップ(GSAPタイムライン)に刷新し、大名級では着地後に小刻みなシェイクが入るようにした。
- `CelebrationBurst`(`src/components/effects/CelebrationBurst.tsx`)を新設。家紋の光フラッシュ+パーティクルバースト+バナー登場のシーケンスで、国盗り・地方コンプリート・美濃国解放・天下統一達成のタイミングで全画面演出として再生する(`/gacha` の結果画面、`/tenka-toitsu` の代表武将登録完了時)。動画素材が未準備の段階でも着手できるよう、コード駆動アニメーションのみで構成した。
- 本番のSupabase DBにVer2.0〜2.3のマイグレーションが未適用だったことが判明(CIにマイグレーション適用ステップが存在しないため)。`supabase/migrations/20260713000001_repair_v20_v23_pending_schema.sql` として、`IF NOT EXISTS`等を用いた冪等な再発行マイグレーションを追加し、Supabaseダッシュボードから手動実行して復旧した。
- 管理画面に「使い方ガイド」(`/admin/help`)を新設。各設定ページの目的・わかりにくい項目の意味(排出率の階層適用ルール、動画演出の優先度/weight選定ロジック、ガチャ設定のbase/override関係等)・用語集(石高/戦功/国/スロット等)をまとめ、ナビ・ダッシュボード両方から導線を追加した。説明文が無かったページ(実績ログ・ガチャ設定・国マスタ・ユーザー検索・ログイン画面)にも説明文を追加し、DB列名・テーブル名の直書きや内部コード(`region_complete_kanto`等)の生表示を平易な日本語に置き換えた。
- **創設メンバー・建国メンバーの説明・導線をアプリ内から撤去**。これらの会員区分(一般価格198,000円/創設メンバー特別価格98,000円)の販売・説明は、アプリ内では行わずアプリ外の説明会等で行う方針に変更されたため、`/founding-member`・`/nation-builder` ページ、`FoundingMemberPanel`/`DevelopmentPlotCard`/`NationBuilderOfferCard`/`FoundingMemberBadge`(`src/components/founding-member/`)、`src/lib/founding-member.ts` を削除。国民証カードのバッジ表示・国家開発区画番号表示、フッター・AI寺子屋・イベント一覧・本日の任務・実績バッジからの関連導線もあわせて削除した。管理画面(`/admin/users`)での会員区分の記録・編集機能とDBスキーマ(`users.is_founding_member`等)は、社内での会員管理・記録用途のためそのまま維持している。

### 影響範囲

- 既存テーブルへの変更はなし(Ver2.4自体では新規マイグレーションを追加していない。上記の復旧マイグレーションはVer2.0〜2.3で追加済みの列・テーブルの再発行)。
- `src/app/globals.css` の `gacha-card-in`/`gacha-shake` キーフレームは、GSAPタイムラインへの置き換えに伴い削除。他のCSSキーフレーム(パーティクル・雷光演出等)は変更なし。
- 創設メンバー・建国メンバー関連ページの削除により、`/founding-member`・`/nation-builder` へのアクセスは404になる。LINEリッチメニュー(6ボタン: ホーム/ガチャ/図鑑/地図/購入/ヘルプ)にはこれらのページへの導線が元々無かったため、リッチメニュー側の変更は不要だった。
- 既存機能(LIFFログイン、ガチャ抽選、Stripe決済、図鑑、国盗り、管理画面、動画ガチャ演出)への影響なし。

### 未実装事項

- 画面デザインガイドのうち、国家ダッシュボードの民の数/総収入等や城下町の土地・資源マーケットなど、新規のゲーム経済システムが必要な項目(既存スコープ方針と衝突するため未着手)
- 動画素材(武将登用演出の本格的な動画版)。`docs/ASSET_GUIDE_ANIMATION.md` に必要な素材仕様をまとめ、素材到着後に差し込む前提で設計している
- Supabaseマイグレーションの自動適用(CI/CDへのSupabase CLI組み込み等)。今回は復旧のみで、再発防止の仕組み自体は未整備

---

## Ver2.5: 城下町デジタル内覧フェーズ

「戦国城下町デジタル内覧」ハイブリッド機能追加指示書に基づく。実装前の既存システム調査・実装計画は
`docs/metaverse-tour-existing-system-analysis.md` / `docs/metaverse-tour-implementation-plan.md` を参照。

### 変更内容

- 未完成の戦国メタバース内に建設予定の武家屋敷・商人屋敷等を画像ベースで疑似内覧できる機能を、LIFF内(閲覧・お気に入り・相談申込)+外部全画面内覧ページ(高解像度画像・スワイプ・ズーム)のハイブリッド構成で追加。
- **販売情報(価格・権利内容・特典・商業的な販売状態)はプレイヤー向け画面に一切表示しない方針で実装した**。指示書は本来「価格表示+相談フォームで代理店へ誘導」という設計だったが、直前のVer2.4で創設/建国メンバーの説明・販売をアプリ内から撤去したばかりであり、同じ方針をこの機能にも適用すべきとユーザーと確認した上で調整した。価格・権利・特典は管理画面の入力欄(`internal_price_yen`等)としてのみ保持し、社内の営業活動・将来準備のための記録に留める。
- DB: `metaverse_areas`, `metaverse_building_types`, `metaverse_properties`, `metaverse_property_images`, `metaverse_tour_scenes`, `metaverse_scene_hotspots`, `metaverse_maps`, `metaverse_map_hotspots`, `metaverse_favorites`, `metaverse_recent_views`, `metaverse_tour_sessions`, `metaverse_tour_settings`, `metaverse_view_events`, `metaverse_inquiries`, `metaverse_inquiry_histories` を新規追加(`supabase/migrations/20260714000001_metaverse_tour.sql`)。データアクセス層は `src/lib/metaverse.ts` に集約。
- 一時内覧トークンはJWTではなく、`crypto.randomBytes`のランダム値をSHA-256でハッシュ化してDBに保存する方式にした。有効期限(既定60分、管理画面から変更可)・アクセス回数・失効状態をDB側で厳密に管理でき、個人情報(userId等)をトークン自体にもレスポンスにも含めない設計にできるため。
- LIFF側: `/metaverse-tour`(内覧トップ)、`/metaverse-tour/areas`、`/metaverse-tour/areas/[areaId]`、`/metaverse-tour/properties/[propertyId]`、`/metaverse-tour/favorites`、`/metaverse-tour/inquiries/new`・`[id]`。ホーム画面に入口カード(`MetaverseTourEntryCard`)を追加。
- 外部全画面内覧ページ: `/tour/property/[propertyCode]`。既存の`(app)`ルートグループ(SideMenu/BottomNav/LegalFooter付き、縦画面前提)とは別の`src/app/tour/`ルートグループとして実装し、スマートフォン横画面・タブレット・PCを想定したシンプルな専用レイアウトにした。スワイプ・矢印キー・サムネイル切替・ダブルタップズーム・説明ポイント表示・UI表示切替・「LINEに戻って相談する」に対応。
- 管理画面: `/admin/metaverse`配下にエリア・物件(内覧シーン・説明ポイント・画像ギャラリーを含む)・問い合わせ・外部内覧セッション・閲覧分析を追加。既存のフラットな横並びナビをこれ以上増やさないよう、ナビには「メタバース内覧」1項目だけ追加し、`/admin`トップページと同じ「ハブ+カードリンク」パターンでサブ機能へ遷移する構成にした。
- 相談申込は既存の代理店紐づけ(`users.referring_agent_id`)をそのまま利用。新しい代理店ロジックは作らず、問い合わせ登録時にユーザーの紹介元代理店IDを参照して`metaverse_inquiries.agent_id`に保存する。
- 閲覧ログ(`tour_home_view`は未実装だが`property_detail_view`/`tour_start`/`scene_view`/`zoom`/`favorite_add`/`tour_complete`/`return_to_liff`等)をLIFF側・外部内覧側の両方から記録し、管理画面の「閲覧分析」で人気物件・内覧完了率・相談転換率・代理店別実績を、既存の`rankings.ts`と同じ方針(DBビュー/RPCを使わずJS側で集計)で簡易表示する。
- API命名は指示書の`/api/v1/...`ではなく、既存の他機能と同じバージョンプレフィックスなしの構成にした(`/api/metaverse/...`、外部内覧向けは`/api/public/metaverse/...`、管理画面向けは`/api/admin/metaverse/...`)。
- エリア・物件の画像未設定時に使う共通のデフォルト画像を追加(`metaverse_tour_settings.default_property_image_url`/`default_area_image_url`、マイグレーション`20260715000001_metaverse_default_images.sql`)。「独自画像かデフォルトか選べるようにしたい」という要望に対し、区画単位で個別に画像をアップロードした場合はそちらを優先し、未アップロード(null)のままなら共通のデフォルト画像にフォールバックする方式にした(`src/lib/metaverse.ts`の`getDefaultImages()`+`mapPropertyRow()`等での`??`適用)。管理画面のエリア一覧ページ(`/admin/metaverse/areas`)にエリアごとの画像アップロードUI(一覧サムネイル/詳細メイン画像。これまで未実装だった)と、共通デフォルト画像の設定パネルを追加。物件編集ページには「メイン画像をデフォルトに戻す」ボタンを追加。
- 内覧シーンに、静止画に加えて動画(館内ウォークスルー等)をアップロードできる機能を追加(`metaverse_tour_scenes.video_url`/`video_duration_ms`/`video_mime_type`/`video_file_size_bytes`、マイグレーション`20260716000001_metaverse_scene_video.sql`)。既存の「動画ガチャ演出」機能と同じ土台(MP4アップロード、sharp不使用、`src/lib/mp4-probe.ts`の独自パーサーで長さを検証)を再利用し、専用バケット`metaverse-videos`にアップロードする(サイズ上限50MB・長さ上限60秒。`METAVERSE_VIDEO_MAX_BYTES`/`METAVERSE_VIDEO_MAX_DURATION_SECONDS`で変更可)。`image_url`は動画のポスター画像・動画未対応時のフォールバックとして必須のまま維持し、`video_url`が設定されているシーンのみ外部内覧ページ(`/tour/property/[propertyCode]`)で`<video>`再生に切り替わる(動画非対応シーンは従来どおり画像+ズーム表示)。管理画面はシーン編集(物件編集ページ内)に動画アップロード・プレビュー・削除UIを追加(`/api/admin/metaverse/scenes/[id]/video`)。

### 影響範囲

- 既存テーブルへの変更はなし(新規テーブル追加のみ)。既存機能(LIFFログイン、ガチャ抽選、Stripe決済、図鑑、国盗り、管理画面、動画ガチャ演出)への影響なし。
- LINEリッチメニュー(6ボタン: ホーム/ガチャ/図鑑/地図/購入/ヘルプ)には新規ページへの導線を追加していない(ホーム画面の入口カード経由でのみ到達する)。

### 未実装事項

- 指示書28章の代理店専用ログイン・権限分離(自代理店の問い合わせ・実績のみ閲覧可能にする)。今回は運営者(共有パスワードでログインする既存の管理画面ユーザー)が全代理店分を閲覧できる状態のまま。
- 実際のメタバース座標との紐付け。`external_world_ref`列は用意したが、実データの投入・座標変換ロジックは将来のメタバース仕様確定後に対応する。
- 城下町マップ(指示書24章)の本格実装。当初はDB(`metaverse_maps`/`metaverse_map_hotspots`)のみ用意し表示画面は省略していたが、Ver2.6で管理画面のマップ画像アップロード+クリックでのホットスポット配置UI、LIFF側の全体マップ表示(タップでエリア詳細へ遷移)を追加した(下記Ver2.6セクション参照)。ただしピンチズームや外部内覧側での全画面マップ表示は引き続き未実装。
- 自動ツアー(`is_auto_tour_target`列は用意したが自動再生ロジックは未実装)、初回アクセス時の簡単な利用案内モーダル(指示書7章)。
- 実機(iPhone/Android/LINE内ブラウザ/Safari/Chrome/横画面/タブレット/PC)での動作確認は未実施。開発環境でのPlaywright目視確認のみ。

## Ver2.6: 外部代理店システム(sengoku-ai.com)連携フェーズ

「代理店連携API仕様書」「代理店システム連携 開発者向け説明書」「代理店システム SSO連携仕様書」(いずれもVersion 3.6.40/3.6.45)に基づく。
実装計画は `docs/agency-integration-implementation-plan.md` を参照。

### 変更内容

- `agents`テーブルに`external_id`(一意)・`parent_agent_id`/`parent_external_id`(階層)・`contact_name`/`contact_email`/`login_email`/`phone`/`line_url`・`status`・`role_level`・`source`(`local`/`sengoku-ai`)・`lp_urls`・`updated_at`を追加(マイグレーション`20260717000001_agency_integration.sql`)。既存の`rank`(`アドバイザー`/`ディレクター`/`エージェント`)は仕様書の`role_level` 1/2/3の`role_label`と完全一致していたため、そのまま同期先として利用した。
- 受信API `POST /api/integrations/agencies`(仕様書指定の固定パス、`/api/admin/...`ではない)を新設。`x-api-key`/`Authorization: Bearer`のどちらでも認証し、`external_id`をキーにupsert、`parent_external_id`で親を解決(親が未登録でもエラーにせず保存し、該当の親が後で届いた時点で子側を再紐付けする)。`event=connection_test`/`dry_run=true`は認証確認のみで保存しない。
- 双方向同期: 管理画面で代理店を新規作成・編集すると、設定がONの場合`src/lib/agents.ts`の`pushAgentToExternal()`がsengoku-ai.comへbest-effortでPOSTする(失敗してもログ記録のみで管理画面の保存処理は継続する。仕様書の「AI側は外部送信に失敗しても本体処理を止めない」という方針を踏襲)。ローカル作成の代理店には`local-<uuid>`形式で`external_id`を自動採番する。
- 階層取得API(`GET /api/hierarchy.php`)を使った手動一括同期(`/admin/agency-integration`の「階層を手動で全件同期」ボタン)。
- SSOログイン(代理店ポータル): `RS256`署名JWTを`jose`の`createRemoteJWKSet`で検証(`src/lib/agency-sso.ts`)。`iss`/`aud`/`exp`/`jti`を検証し、`jti`の再利用は`agency_sso_used_jti`テーブルのunique制約(23505)で防止する。検証成功後は代理店専用セッションCookie(`sengoku_agent_session`、JWT、`src/lib/agent-session.ts`)を発行する。ポータル本体(`/agency`)では紹介URL・紹介実績(簡易集計)・配下代理店(表示のみ)を表示する。LIFF共通レイアウトを持たない専用ルートグループ`src/app/agency/**`として実装した(`/tour/**`と同じ方針)。これまで存在しなかった「代理店が自分の紹介URLを確認できる手段」を提供する。
- 受信用APIキーは内覧トークンと同じ「ランダム値+SHA-256ハッシュ」方式(`src/lib/agents.ts`の`regenerateInboundApiKey()`)。発行時のみ平文を管理画面に表示し、以降は末尾4桁のみ表示する。送信用APIキー(sengoku-ai.com発行)は実際にリクエストへ使う必要があるため、`payment_settings`のStripeキーと同じ方針で平文保存する。
- 接続設定(送信先URL・送信用APIキー・SSO設定・ON/OFFトグル)は`agency_integration_settings`テーブル(シングルトン。`payment_settings`/`line_settings`と同じパターン)で管理する。

### 影響範囲

- 既存の`agents`/`agent_sales`テーブルへの列追加のみ(削除・型変更なし)。既存の紹介コード方式(`?ref=<referral_code>`によるURL紐付け)への影響なし。sengoku-ai.com同期で作成される代理店の`referral_code`は`external_id`と同じ値を自動採番するため、同期直後から紹介URLとして機能する。
- 既存の管理画面(`/admin/agents`)の代理店作成・編集フローに変更はなく、双方向同期は追加の非同期送信として動作する(同期無効時は一切外部通信しない)。

### 未実装事項

- 階層に応じた報酬按分計算(ユーザー確認の上で「表示・参照のみ」の方針としたため、意図的に未実装)。
- sengoku-ai.com側の実装(このアプリはRP/受信側としてのみ動作する。IdP側の実装はスコープ外)。
- 実際の接続情報(送信先URL・送信用APIキー・受信用APIキーのsengoku-ai.com側への登録)を用いた本番疎通確認は未実施。管理画面から入力後、双方の「接続テスト」機能で確認する必要がある。
- 代理店ポータル(`/agency`)の実機・実際のSSOフロー(sengoku-ai.com側のSSO起動URLからの遷移)を通した動作確認は未実施。

## Ver2.7: 城下町 全体マップ+エリアホットスポット表示

デザイン検討用モック(全体マップ画像+エリアカードのUI案)をもとに、「全体画像→エリア画像→建物選択」という画面遷移の要望に対応。マップイラスト素材自体は未用意のため、まずは仕組み(管理画面での画像アップロード+ホットスポット配置、LIFF側の表示)を実装し、画像は後から差し替えられる設計にした。

### 変更内容

- `metaverse_maps`に`is_active`/`updated_at`、`metaverse_map_hotspots`に`label`/`icon`/`display_order`/`updated_at`を追加(マイグレーション`20260718000001_metaverse_map_hotspots.sql`)。既存の`area_id`による単純な点(ピン)方式のホットスポットとし、指示書段階で参考にしたモック画像にあったポリゴン(色分け領域)方式は今回のスコープでは採用しなかった(マップ素材が未確定のため、まずシンプルな方式で仕組みを用意する方針)。
- 管理画面`/admin/metaverse/maps`(新設。ハブページにカード追加): マップ画像のアップロード、画像をクリックしてエリアを選び配置するホットスポットエディタ(`src/lib/metaverse.ts`の`getActiveMap()`が参照する`metaverse_map_hotspots`を直接編集)。ピンをクリックすると削除できる。既存のシーン説明ポイント(`metaverse_scene_hotspots`)は入力フォーム方式だったのに対し、今回はクリック位置から`%`座標を計算する方式にした(`(clientX - rect.left) / rect.width * 100`)。
- 公開API`/api/metaverse/map`(LIFFセッション認証)、データ層`getActiveMap()`: 有効(`is_active`)かつ画像アップロード済み(`image_url`が空文字でない)のマップを1件返す。マップが無い場合は`null`を返し、呼び出し側は何も表示しない(既存のカード一覧のみのフォールバック)。
- LIFF側`/metaverse-tour/areas`にマップ画像+タップ可能なホットスポットを追加(既存のカード一覧はそのまま維持し、マップは上部に追加表示)。ホットスポットはエリア詳細ページへの通常の`Link`。マップ未設定の間は見た目に変化がない(既存ユーザー体験を壊さない)。
- クリック位置からのホットスポット配置ロジックは、一時的なdev-previewページ+Playwrightで座標計算の正しさ(クリック位置と配置位置が一致すること)を確認した上でコードから削除した(検証用ファイルはコミットしていない)。

### 影響範囲

- 既存テーブルへの列追加のみ。マップ未設定(デフォルト状態)ではLIFF側の表示に変更なし。

### 未実装事項

- ポリゴン(色分け領域)方式のホットスポット、ピンチズーム、外部内覧側(`/tour/**`)での全画面マップ表示は未実装。
- 実際のマップイラスト素材を使った本番確認は未実施(素材が用意でき次第、管理画面からアップロードして確認する運用)。
