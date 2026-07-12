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

## Ver2.8: 城下町マップ・区画座標基盤(ポリゴン・街区・所有権)

「戦国メタバース 城下町マップ・区画座標実装指示書」に基づく。実装計画は`docs/plot-coordinate-implementation-plan.md`を参照。Ver2.7の点(ピン)方式のホットスポットを、区画IDを基準にしたポリゴン方式へ拡張し、将来のUnityメタバース連携を見据えた座標基盤を整備した。

### 変更内容

- 指示書の`maps`/`areas`/`plots`/`buildings`テーブル案は、二重管理を避けるため既存の`metaverse_maps`/`metaverse_areas`/`metaverse_properties`への列追加として統合した(詳細は実装計画のマッピング表を参照)。`metaverse_properties`(=区画/plot)に`polygon`/`anchor_x`/`anchor_y`/`frontage_angle`/`block_id`/`road_id`/`unity_x,y,z,rotation_y`(列のみ、値・変換ロジックは未実装)/`exterior_variant`等を追加。新規テーブルとして`metaverse_blocks`(街区)・`metaverse_roads`・`metaverse_points_of_interest`・`metaverse_plot_rights`(所有権・代理店特別利用権)・`metaverse_plot_geometry_history`(座標変更履歴)を追加(マイグレーション`20260719000001_metaverse_plot_coordinates.sql`)。
- バージョン管理は指示書のようなエリア・街区単位までの汎用マルチバージョンではなく、**マップ単位のdraft/review/published**に簡略化した(`metaverse_maps.status`)。区画のポリゴン・建物アンカーの変更は都度`metaverse_plot_geometry_history`に記録する(`src/lib/metaverse.ts`の`recordPlotGeometryChange()`、`/api/admin/metaverse/properties/[id]`のPATCHでpolygon/anchor変更時に自動記録)。
- ポリゴン描画は新規共通コンポーネント`src/components/admin/PolygonCanvas.tsx`(SVG+`getScreenCTM().inverse()`によるクリック位置→viewBox座標変換。画像のアスペクト比に関わらず正確にクリック位置を取得できる)を作成し、管理画面の3箇所で再利用: `/admin/metaverse/maps`(エリアポリゴン。既存の点ホットスポットモードと切替式)、`/admin/metaverse/blocks`(新設。街区ポリゴン+街区内の区画ポリゴン。エリア/街区の範囲だけ`viewBox`を絞ることで、専用の画像を用意せず同じマップ画像を「ズームした」ように表示する)。
- 区画の自動生成(指示書13章): 街区ポリゴンの外接矩形を行数×列数で分割し、区画番号の接頭辞から連番で`metaverse_properties`を一括作成するツールを`/admin/metaverse/blocks`に実装。
- 所有権・代理店特別利用権の管理画面`/admin/metaverse/plot-rights`(新設)。区画・権利種別(所有権/特別利用権/賃貸/管理委託/予約)・城主(既存`/api/admin/users`の検索を流用)・代理店(既存`agents`)・期間を登録する。購入データの自動取込みは行わず、手動登録の運用とした(指示書14章の「仮割当→承認」フローは今回のスコープ外)。
- LIFF側: `/metaverse-tour/areas`のマップ表示をSVGポリゴンオーバーレイに対応(エリアにポリゴンがあればそちらを優先表示し、無いエリアは従来の点ホットスポットにフォールバック)。エリア詳細ページ(`/metaverse-tour/areas/[areaId]`)に街区フィルタのチップUIを追加(街区が無いエリアは従来どおり全物件をカード表示)。ただしユーザーの選択操作としての街区・区画レベルはユーザー提供モックの「建物選択」画面と同じ**カード一覧**を維持し、ポリゴンタップ操作は全体マップ(エリア選択)レベルのみに絞った(モック自体もこの2段階構成だったため)。
- LIFF側「あなたの区画」(`/metaverse-tour`トップページ): `metaverse_plot_rights.user_id`が自分と一致し`status=active`な区画を一覧表示する(`getMyPlotRights()`)。

### 影響範囲

- 既存テーブルへの列追加のみ(削除・型変更なし)。ポリゴン・街区・所有権いずれも未設定の状態では、既存の物件カード一覧の挙動に変化はない。

### 未実装事項

- Unity用JSONエクスポートAPI、2D→Unity座標変換ロジック(列のみ用意)。
- CSV/Excel/GeoJSONのインポート・エクスポート機能。
- 購入データの自動取込〜仮割当〜本配置ワークフロー(指示書14章)。
- エリア・街区単位の個別バージョニング(マップ単位のみ実装)。
- `metaverse_roads`/`metaverse_points_of_interest`の管理画面UI(テーブルのみ用意。区画の`road_id`は手動でAPI経由の設定を想定)。
- モデル地域(約50区画・4エリア)への実データ投入は運営側の作業として未着手。
- 実機・実際のマップイラスト素材を用いた動作確認は未実施。ポリゴンのクリック位置計算ロジックは一時的なdev-previewページ+Playwrightで正確性を確認した上でコードから削除した(検証用ファイルはコミットしていない)。

## Ver2.9: AI画像生成機能(武将カード・城下町デジタル内覧)

`05_midjourney_guide_v1.0.md`/`06_chatgpt_image_guide_v1.0.md`にまとまっていた手作業の一貫性確保ノウハウ(固定スタイルワード・参照画像によるスタイル統一・レアリティ別演出・実名をプロンプトに含めない安全策)を、OpenAI(gpt-image-1)の画像生成APIで自動化し、管理画面内で完結させた。

### 変更内容

- マイグレーション`20260720000001_ai_image_generation.sql`: 設定シングルトン`ai_image_settings`(APIキー・モデル名・共通スタイルプロンプト・武将用/内覧用の基準参照画像URL・武将/内覧それぞれの有効化フラグ)と、生成イベント履歴`ai_generated_images`(採用有無に関わらず記録。各エンティティのテーブルにはカラムを追加せず、独立した監査テーブルとした)を追加。
- `src/lib/ai-image.ts`の`generateImage()`が実際のAPI呼び出しを担う。共通スタイルプロンプトを自動で先頭に付加し、参照画像が指定されていれば`/v1/images/edits`(画像添付・同一人物/建物の再現目的)、無ければ`/v1/images/generations`(テキストのみ・全体の画風統一目的)を呼び分ける。失敗時は`AiImageGenerationError`(ステータス・APIのエラーメッセージ付き)を投げる。
- `src/lib/ai-image-targets.ts`でクライアントから生のテーブル名/カラム名を受け取らないよう、生成対象を`warlord`/`metaverse_area`/`metaverse_property`/`metaverse_scene`/`metaverse_map`の5種類にサーバー側でホワイトリスト化(管理セッションを任意テーブル書き込みの手段にしないため)。
- APIは生成〜採用を2段階に分離: `POST /api/admin/ai-image/generate`(Base64のまま返す。まだ何も保存しない)→ `POST /api/admin/ai-image/adopt`(採用ボタン押下時に同じBase64を送り直し、既存の`resizeForLine()`→Storageバケット→対象テーブルのカラム更新という、手動アップロードと全く同じパイプラインに通す)。これによりAI生成画像も手動アップロード画像も最終的に同一形式(WebP・最大1080px・同じバケット)になり、表示側のコードは一切変更していない。物件のメイン画像採用時のみ、既存の`metaverse_property_images`ギャラリーにも追加する(手動アップロードのギャラリー追加ロジックを踏襲)。
- 管理画面`/admin/ai-image-settings`(新設・ナビ追加): APIキー(末尾4桁表示・空欄送信で変更なしの既存`payment_settings`と同じマスク方式)、モデル名、共通スタイルプロンプト(初期値は06番ガイドの共通スタイル指示文)、武将用/内覧用の基準参照画像アップロード、有効化トグル。
- 共通コンポーネント`src/components/admin/AiImageGeneratePanel.tsx`(状態遷移: アイドル→プロンプト編集→生成中→プレビュー(採用/再生成/キャンセル)→採用中)を、武将マスタ・エリア管理(サムネイル/メイン)・物件編集(メイン画像+各内覧シーン画像)・全体マップ管理の既存アップロードUIの隣に追加。参照画像は「参照画像なし/全体のスタイル基準を使う/現在の画像を参照する(同じ人物・建物として再現)」の3択。生成前に`window.confirm`でAPI利用料発生の確認を行う(共有パスワード管理画面のため、v1ではこれ以上のコスト制限は設けていない)。武将の自動プロンプトは国名・レアリティ(スロット)から05/06番ガイドのレアリティ別演出差を元に自動構成し、実名は含めない。

### 影響範囲

- 既存テーブルへの列追加は無し(新規テーブル2つのみ)。既存の手動アップロードフロー・表示側のコードに変更は無く、AI生成は既存機能に追加する形の新規導線。設定を何も行わない(APIキー未設定)場合、生成ボタン押下時にエラーメッセージが出るのみで、既存の管理画面・LIFF・外部内覧ページの動作に影響しない。

### 未実装事項

- OpenAI以外のプロバイダ(Stable Diffusion等)対応。`generateImage()`の内部実装のみ差し替えれば将来対応可能な設計にはしてある。
- 生成コストの上限・レート制限(`window.confirm`のみ)。
- `ai_generated_images`の一覧・ギャラリー閲覧UI(データは記録するが閲覧画面は未実装)。
- 動画・シーンサムネイルのAI生成(静止画のみ対象。シーン動画は引き続き手動アップロードのみ)。
- 実際のOpenAI APIキーを使った本番生成確認は未実施(このサンドボックス環境の送信プロキシがapi.openai.comへの疎通を許可していないため)。`generateImage()`のエラーハンドリング・分岐ロジックはfetchをモックしたユニットテストで検証済み(検証用テストファイルはコミットしていない)。APIキー設定後の実際の生成確認はユーザー側で実施が必要。

### 追記: Gemini(2.5 Flash Image)を第2プロバイダとして追加

「同じ人物・建物として再現する」再現性は、OpenAIの`/v1/images/edits`(画像編集ベース)よりGoogle Gemini(2.5 Flash Image、通称Nano Banana)の方が強いという報告が多いため、比較・使い分けができるよう2プロバイダ対応にした。

- マイグレーション`20260721000001_ai_image_gemini_provider.sql`: `ai_image_settings`に`gemini_api_key`/`gemini_model`(既定値`gemini-2.5-flash-image`)を追加。プロバイダごとにAPIキーを別カラムで保持し、切り替え時に誤って別プロバイダへキーを送ってしまわないようにした(既存の`provider`カラムでどちらを使うか切り替える)。
- `src/lib/ai-image.ts`の`generateImage()`を`generateWithOpenAi()`/`generateWithGemini()`に分割し、`settings.provider`で呼び分ける構成にした。呼び出し側(APIルート)の変更は不要。Geminiは`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`(`x-goog-api-key`ヘッダ、`generationConfig.responseModalities: ["IMAGE"]`)を呼び、参照画像は`inline_data`としてcontentsに含める。GeminiのAPIにはOpenAIの`size`のような明示的なアスペクト比指定パラメータが無いため、正方形指定等は各生成画面の自動プロンプト文言(「正方形の構図で描いてください」等)に委ねている。
- 管理画面`/admin/ai-image-settings`に「使用するAPI」ラジオボタンとGemini用のAPIキー・モデル欄を追加。OpenAI/Geminiの両方のAPIキーを同時に保存しておき、ラジオボタンで切り替えて比較できる。
- 検証: OpenAI/Gemini双方の分岐をfetchモックしたユニットテストで確認(検証用テストファイルはコミットしていない)。実際のAPIキーでの生成品質比較はユーザー側で実施が必要。

## Ver2.10: 武将カードテンプレート合成(レアリティ別の枠・バッジ・ステータス表示)

実際にAI生成画像を試したところ、見本の完成カードイメージ(枠・レアリティバッジ・武将名・スキル名・ステータス数値・フレーバーテキストが焼き込まれたもの)と、AI生成の素のイラストとの間に大きな差があることが判明。`GachaReveal.tsx`には「カード画像自体にテキストが焼き込まれている前提」というコメントがあったが、実際にはCSS枠のみで文字要素は存在しなかった。AI画像生成に正確な日本語テキスト(特にDBの実データと一致する数値)を安定して描かせるのは現実的でないため、**AIはイラストのみ生成し、枠・バッジ・武将名・スキル名・ステータス・フレーバーテキストはコード側(`next/og`のImageResponse=Satori+resvg)で正確に合成する**方式にした。

### 変更内容

- マイグレーション`20260722000001_warlord_skill_name.sql`: `warlords`に`skill_name`列を追加(スキル名は独立した表示要素のため、既存の`stats_json`/`lore`とは別カラム)。
- `assets/fonts/NotoSansJP-Bold.woff`(新規、約580KB): `next/og`のImageResponseは日本語フォントの明示的な埋め込みが必須(サーバー環境に日本語フォントが入っている保証がないため)。Google Fonts「Noto Sans JP」(OFL-1.1)のBold(700)を、`fonttools`で常用漢字2136字+かな+基本英数字+旧国名等に絞ってサブセット化(元は可変フォント約9.6MB→約580KBのWOFF)。取得・再生成手順は`assets/fonts/README.md`に記載。
- `src/lib/card-template.tsx`(新規)の`renderWarlordCard()`: AI生成イラストを背景に、レアリティ表示名(足軽級〜大名級)ごとに割り当てたバッジ文字(C/UC/R/SR/SSR)・枠色・コーナー装飾サイズで、武将名・国名・スキル名・ステータス上位3件(`stats_json`から動的取得)・フレーバーテキスト(`lore`を46文字に切り詰め)を合成した1024×1536のPNGを返す。SR/SSRほど枠色を明るく(金→金白)・コーナー装飾を大きくして質感の差を付けている。
- `/api/admin/ai-image/adopt`: `entity_type === "warlord"`の場合のみ、`resizeForLine()`の前に`renderWarlordCard()`を挟むよう変更(合成後の画像を最終的な1080px上限のWebPに変換して保存する)。メタバース内覧側の画像生成には影響しない。
- `src/lib/ai-text.ts`(新規)の`generateSkillName()`: OpenAIのChat Completions API(`gpt-4o-mini`固定)で、国名・レアリティ・逸話から短いスキル名を1つ生成する。画像生成と同じ`ai_image_settings.api_key`(OpenAI)を再利用する。05/06番ガイドの方針を踏襲し、武将の実名はプロンプトに含めない。
- `/api/admin/warlords/[id]/skill-name`(新規POST): 1件分のスキル名を生成して保存。管理画面の武将マスタページに「AIで生成」ボタンと、既存75体分をまとめて処理する「未設定のスキル名をAIで一括生成」ボタン(サーバーレス関数のタイムアウトを避けるため、サーバー側で一括処理せずクライアント側で1件ずつ順番にリクエストするループにした)を追加。

### 影響範囲

- 既存の`warlords`テーブルへの列追加のみ。スキル名が未設定の武将は、カード合成時にスキル名の欄が表示されないだけで、既存の画像アップロードフロー・表示側のコードには影響しない。
- カード合成が適用されるのはAI生成→採用フローを通した場合のみ。手動アップロードした既存の武将画像は今回変更されない。

### 未実装事項

- 家紋・国章のグラフィック合成(専用素材が無いため、今回は国名の文字バッジのみ)。
- レアリティ以外の動的演出(箔押し風グラデーションやアニメーション等)。
- カードテンプレートのレイアウト自体を管理画面から編集する機能(現状はコード側で固定)。
- 常用漢字外の文字(一部の人名・地名等)を含む場合、埋め込みフォントに無い字形は正しく表示されない可能性がある(サブセット対象を増やすには`assets/fonts/README.md`の手順で再生成が必要)。
- Vercel本番環境でのフォント読み込み(`next.config.ts`の`outputFileTracingIncludes`で明示的に含めているが)・実際のカード合成結果の確認はユーザー側で実施が必要。

## Ver2.10追記: 内覧画像用スタイルプロンプトを武将カードと分離

城下町デジタル内覧の画像は、将来Unity製メタバースとして実装される想定の「予告編」的な位置付け。共通スタイルプロンプトが1つしか無かったため、武将カード向けの「シネマティックで高級感のある」指示がそのまま内覧画像にも適用され、写真のようなフォトリアルな画像が生成されていた。これだと、実際に完成するメタバース(ゲームエンジンで描画されたスタイライズド3D)との見た目のギャップが大きくなり、ユーザーが違和感を持つ懸念があるとの指摘を受けて対応。

### 変更内容

- マイグレーション`20260723000001_ai_image_style_prompt_split.sql`: `ai_image_settings`の`style_prompt_template`(単一)を`warlord_style_prompt_template`/`metaverse_style_prompt_template`の2列に分離(既存値は武将用にコピー)。参照画像(`warlord_reference_image_url`/`metaverse_reference_image_url`)は元々用途別に分かれていたため、それと同じ考え方に揃えた形。
- `src/lib/ai-image-settings.ts`: 内覧画像用のデフォルトスタイルプロンプトを新設。「将来Unity製メタバースとして実装される想定のコンセプトアート」「過度なフォトリアルは避ける」「ゲームエンジンで描画したような、やや簡略化されたスタイライズド3Dの質感」「陰影は控えめ」「毛穴・シワ・写真的なノイズ等の過度な質感の書き込みは避ける」を明記。武将カード用は従来の「シネマティックで高級感のある」指示のまま維持(カードイラストなのでメタバースとの一貫性は不要なため)。
- `src/lib/ai-image.ts`の`generateImage()`に`audience: "warlord" | "metaverse"`オプションを追加し、対応するスタイルプロンプトを自動選択するようにした(戻り値も`Buffer`から`{ buffer, stylePromptUsed }`に変更し、実際に使われたスタイル文を呼び出し側で記録できるようにした)。
- `/api/admin/ai-image/generate`: `entity_type`が武将かどうかで`audience`を自動判定して渡す。既存の管理画面側の呼び出し(`AiImageGeneratePanel`)は変更不要。
- 管理画面`/admin/ai-image-settings`: 「共通スタイルプロンプト」を「武将カード用」「城下町内覧画像用」の2つのテキストエリアに分割。

### 影響範囲

- 既存テーブルへの列追加のみ(既存の`style_prompt_template`列は削除していない)。武将カードの生成挙動は変わらない。内覧画像(エリア・物件・シーン・全体マップ)の生成のみ、デフォルトのスタイル指示が変わる。

### 未実装事項

- スタイルプロンプトの効果(実際にどの程度フォトリアルを避けられるか)は、モデル・プロンプトの解釈に依存するため、実際のAPIキーでの生成確認・文言の微調整が引き続き必要。
