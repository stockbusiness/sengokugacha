# 城下町デジタル内覧 機能追加 — 実装計画

`docs/metaverse-tour-existing-system-analysis.md` の調査結果と、ユーザーとの確認内容を踏まえた実装計画。指示書(37章)をベースにしつつ、以下の点を既存システム・最新の事業方針に合わせて調整する。

## 0. 前提となる調整方針(指示書からの変更点)

### 0.1 販売情報をアプリ内に表示しない(最重要の調整)

創設メンバー・建国メンバー機能を「アプリ内での説明・販売はしない、アプリ外の説明会で行う」方針でアプリから撤去した直後の判断として、本機能も同じ方針を適用する。

- **表示しない**: 販売価格、価格帯、権利内容、オーナー特典、税区分、返金条件、解約条件、NFT発行有無、譲渡可否、維持費
- **表示する**: 物件名、区画番号、エリア名、建物タイプ、画像・内覧、特徴タグ、想定用途、担当代理店、公開状態(公開中/近日公開のみ。sold/limited/under_negotiation等の商業的な販売状態は使わない)
- **管理画面には保持する**: 価格・権利・特典等の列自体は管理画面(admin)の入力項目として用意し、社内の準備・将来の営業活動のために記録できるようにする。ただしプレイヤー向けAPI・画面には一切含めない(founding-memberのDB列を維持しつつプレイヤー向けUIだけ撤去した前例を踏襲)。
- 「担当者に相談する」CTA・相談フォームは維持するが、相談種別の選択肢から価格を前提としたニュアンスを弱め、「もっと詳しく知りたい」を主目的とする(実際の価格提示・商談はアプリ外で代理店が行う)。

### 0.2 API命名を既存規則に合わせる

`/api/v1/...` ではなく、既存の他機能同様バージョンプレフィックスなしにする。

- LIFF側: `/api/metaverse/...`
- 外部内覧側: `/api/public/metaverse/...`(未ログイン・トークンのみで叩けるエンドポイントであることを明示)
- 管理画面側: `/api/admin/metaverse/...`

### 0.3 マイページはホーム画面への追加として実装

独立した「マイページ」ルートが無いため、指示書19章の内容(最近見た物件・お気に入り・相談状況・担当代理店)は、ホーム画面に**折りたたみ式のカード**として追加する(常時全展開すると縦に長大化するため)。既に情報量の多いホーム画面への配慮として、「城下町デジタル内覧」1枚のサマリーカード(お気に入り件数・最近見た物件のサムネイル程度)のみを表示し、詳細は `/metaverse-tour/favorites` 等の専用ページに譲る。

### 0.4 管理画面ナビは「メタバース内覧管理」1エントリからのサブページ遷移にする

既存のフラットな横並びナビにこれ以上項目を増やすと崩れるため、ナビには **「メタバース内覧」1項目だけ追加**し、その配下(`/admin/metaverse`)にダッシュボード型のサブメニュー(カードリンク一覧、`/admin` トップページと同じパターン)を置く。既存ナビ構造を変更しない。

### 0.5 代理店の権限分離は段階実装にする

指示書28章の「代理店管理者は自代理店分だけ閲覧可能」を実現するには、代理店専用ログインの新設が必要でスコープが大きい。以下の2段階に分ける。

- **フェーズA(今回)**: 管理画面(共有パスワードでログインする既存の運営者)側で、問い合わせ一覧に代理店名列を表示し、代理店名でのフィルタができるようにする(運営者が代理店ごとの実績を見られる)。
- **フェーズB(将来・別スコープ)**: 代理店専用ログイン・ロールベースアクセス制御の新設。今回は着手しない(TODOとして明記)。

### 0.6 将来のメタバース座標との整合

`metaverse_areas` / `metaverse_properties` に `external_world_ref`(nullable text)を用意し、将来の本メタバース側のワールドID・オブジェクトIDを後から紐付けられるようにする。今回のシーン内hotspot座標(`position_x`/`position_y`、0〜100のパーセント)はあくまで2D画像内の位置であり、3D座標とは独立させる。

## 1. データベース設計

`supabase/migrations/20260714000001_metaverse_tour.sql`(1ファイルに集約。既存の流儀通り、後続の修正が必要になれば別マイグレーションで追加)。

```
metaverse_areas
  id, slug(unique), name, category, short_description, description,
  thumbnail_url, main_image_url, is_recommended, is_new,
  display_order, status(draft|published), published_at, closed_at,
  -- 管理用(非表示)
  internal_price_range_note text,
  created_at, updated_at

metaverse_building_types
  id, name, display_order, created_at

metaverse_properties
  id, property_code(unique), name, area_id(→areas), building_type_id(→building_types),
  short_description, description, main_image_url,
  feature_tags(text[]), intended_use text,
  status(draft|coming_soon|published|hidden)  -- 商業的な販売状態は持たない
  is_recommended, is_new, display_order,
  external_world_ref text,  -- 将来のメタバース座標紐付け用(nullable)
  -- 管理用(プレイヤーには非表示。将来の営業活動・社内記録用)
  internal_price_yen integer,
  internal_rights_note text,
  internal_benefits_note text,
  created_at, updated_at

metaverse_property_images
  id, property_id, image_url, display_order, created_at

metaverse_tour_scenes
  id, property_id, name, image_url, thumbnail_url, description,
  display_order, is_published, allow_zoom, is_auto_tour_target,
  created_at, updated_at

metaverse_scene_hotspots
  id, scene_id, title, description, position_x numeric, position_y numeric,
  icon, status(available_now|planned|future_concept),
  display_order, is_published, created_at

metaverse_maps
  id, name, image_url, created_at

metaverse_map_hotspots
  id, map_id, area_id, position_x numeric, position_y numeric, created_at

metaverse_favorites
  id, user_id, property_id, created_at
  unique(user_id, property_id)

metaverse_recent_views
  id, user_id, property_id, viewed_at
  -- 直近N件のみ保持(古いものは定期的にpurgeするか、都度上位N件のみ取得する運用でテーブル肥大化を回避)

metaverse_tour_sessions
  id, token_hash(unique), user_id, agent_id(nullable), property_id,
  return_url, issued_at, expires_at, access_count, status(active|expired|revoked)

metaverse_view_events
  id, session_id(nullable), user_id(nullable), event_type, property_id(nullable),
  scene_id(nullable), metadata jsonb, created_at
  -- IPアドレスは保存しない(指示書27章の方針通り)

metaverse_inquiries
  id, user_id, agent_id(nullable), property_id(nullable),
  inquiry_type, preferred_contact, consent_personal_info boolean,
  consent_agent_share boolean, preferred_datetime, memo,
  status(new|contacted|in_progress|closed), created_at, updated_at

metaverse_inquiry_histories
  id, inquiry_id, note, created_at
```

- `metaverse_common_contents`(共通文言管理)・`metaverse_admin_audit_logs` は新設せず、既存の `legal_pages` パターン(1行1キーの簡易CMS)・既存の `admin_audit_logs`(action種別を追加登録するだけ)を再利用する。テーブルを増やさない。
- RLSは既存方針(deny-all、service-roleでのみアクセス)を踏襲。

## 2. API設計

### LIFF側(要ログイン、既存の `getSession()` で認証)

```
GET  /api/metaverse/overview
GET  /api/metaverse/map
GET  /api/metaverse/areas
GET  /api/metaverse/areas/[areaId]
GET  /api/metaverse/properties
GET  /api/metaverse/properties/[propertyId]
GET  /api/metaverse/properties/[propertyId]/scenes

GET    /api/metaverse/favorites
POST   /api/metaverse/favorites
DELETE /api/metaverse/favorites/[propertyId]

GET  /api/metaverse/recently-viewed
POST /api/metaverse/events

POST /api/metaverse/properties/[propertyId]/tour-session

POST /api/metaverse/inquiries
GET  /api/metaverse/inquiries/me
```

### 外部内覧側(トークンのみ、ログイン不要)

```
GET  /api/public/metaverse/tour-session   -- トークン検証+シーン一覧取得
POST /api/public/metaverse/events
POST /api/public/metaverse/favorites      -- トークンからuser_idを解決して登録
```

### 管理画面側

```
CRUD /api/admin/metaverse/areas
CRUD /api/admin/metaverse/properties
CRUD /api/admin/metaverse/scenes
CRUD /api/admin/metaverse/scene-hotspots
CRUD /api/admin/metaverse/map-hotspots
CRUD /api/admin/metaverse/building-types

PATCH /api/admin/metaverse/properties/[id]/status
POST  /api/admin/metaverse/properties/[id]/images

GET   /api/admin/metaverse/inquiries
PATCH /api/admin/metaverse/inquiries/[id]/status
POST  /api/admin/metaverse/inquiries/[id]/histories

GET   /api/admin/metaverse/tour-sessions
GET   /api/admin/metaverse/analytics
```

## 3. 一時内覧トークン

- `POST /api/metaverse/properties/[propertyId]/tour-session` で発行。ペイロードに個人情報を含めず、ランダムトークン(例: `crypto.randomBytes(32).toString("base64url")`)をハッシュ化(`session.ts`同様のアプローチではなく、単方向ハッシュで比較。JWTではなく単純な乱数+DB照合方式にする。理由: 有効期限切れ・アクセス回数制限・失効(revoke)をDB側で厳密に管理したいため、ステートレスなJWTより適している)。
- 既定の有効期限60分、管理画面(`/admin/metaverse` 配下の設定)から変更可能にする(既存の `payment_settings` のような1行設定テーブル、または `line_settings` と同様の構成を踏襲)。
- 外部内覧ページはこのトークンをクエリパラメータで受け取り、`GET /api/public/metaverse/tour-session` で検証・シーンデータを取得する。

## 4. LIFF側画面

`src/app/(app)/metaverse-tour/**` に、既存の他ハブページ(`/academy`, `/market`, `/events`)と同じ構成パターンで実装する(`"use client"` + `ensureLiffSession()` + `fetch`)。

```
/metaverse-tour                  内覧トップ
/metaverse-tour/areas            エリア一覧(カード)
/metaverse-tour/areas/[areaId]   エリア詳細+物件一覧
/metaverse-tour/properties/[propertyId]  物件詳細
/metaverse-tour/favorites        お気に入り一覧
/metaverse-tour/inquiries/new    相談申込
/metaverse-tour/inquiries/[id]   相談状況確認
```

ホーム画面(`src/app/(app)/page.tsx`)には「城下町デジタル内覧」への入口カード1枚を追加(既存の `PriorityQuickActions` のタイル、または新規の `MetaverseTourEntryCard` として追加。管理画面で表示/非表示・バナー画像・タイトル・説明文・新着表示・公開期間を設定可能にする)。

## 5. 外部全画面内覧ページ

同一Next.jsアプリ内の公開ルートとして実装する(別リポジトリ・別デプロイは行わない。既存Vercelデプロイに相乗りさせることで運用コストを増やさない)。

```
/tour/property/[propertyCode]
/tour/map
```

これらは `src/app/(app)` レイアウトの外(LIFF共通ヘッダー・SideMenu・下部ナビ無し)に配置する新しいルートグループ(例: `src/app/tour/**`)とし、`ensureLiffSession()` を使わない独自の軽量レイアウトにする。スマートフォン横画面・タブレット・PCへのレスポンシブ対応が必要なため、`(app)` グループの縦画面前提レイアウトとは完全に分離する。

## 6. 管理画面

```
/admin/metaverse                 サブメニュー(ダッシュボード型)
/admin/metaverse/areas
/admin/metaverse/properties
/admin/metaverse/properties/new
/admin/metaverse/properties/[id]
/admin/metaverse/scenes          (物件詳細編集画面内にネストする形も検討)
/admin/metaverse/inquiries
/admin/metaverse/tour-sessions
/admin/metaverse/analytics
```

既存ナビ(`layout.tsx`)には「メタバース内覧」1リンクのみ追加し、`/admin/metaverse` トップページから各サブ機能へのカードリンクを配置する(既存の `/admin` トップページと同一パターン)。

## 7. 実装フェーズ(既存プロジェクトの流儀=小さな差分で段階的にPRを分ける)

1. **DB・基盤**: マイグレーション追加、`src/lib/metaverse.ts`(データアクセス層)、画像アップロード(`sharp`の既存プリセット `resizeForLine` を流用)
2. **管理画面**: エリア・建物タイプ・物件・シーン・hotspot管理のCRUD画面(サンプルデータ含む)
3. **LIFF側閲覧機能**: 内覧トップ・エリア一覧・物件一覧・物件詳細・お気に入り・最近見た物件・ホーム画面への入口カード
4. **一時内覧トークン+外部全画面内覧ページ**: トークン発行API、`/tour/**` ページ、スワイプ・ズーム・横画面対応、閲覧ログ
5. **相談申込**: LIFF内フォーム、代理店紐づけ、管理画面での問い合わせ管理
6. **分析・仕上げ**: 閲覧ログ集計画面、`/admin/help` への追記、実機確認、ドキュメント最終化

各フェーズをそれぞれ独立したPRとして提出し、都度動作確認(tsc/lint/vitest/build)を行う。フェーズ4(外部内覧ページのスワイプ・ズーム等の実装)が最もUI実装量が多いため、必要であれば4をさらに分割する。

## 8. テスト方針

- 単体テスト(vitest): 販売状態変換なし(商業ステータスを廃止したため)、公開状態変換、トークン発行・検証・期限切れ、お気に入り重複防止、問い合わせバリデーション
- 手動確認: Playwrightでの一時的な目視確認(既存の検証フローに合わせ、確認後に検証用ファイルは削除)
- 実機確認は本セッションでは実施できない旨を最終報告で明記する(過去の動画ガチャ・CDN問題と同様、ユーザー側での実機確認が必要)

## 9. 未実装として明記する項目

- 代理店専用ログイン・権限分離(0.5節フェーズB)
- 実際のメタバース座標との紐付け(0.6節、`external_world_ref` の実データ投入は将来)
- 価格・権利情報の管理画面入力欄(0.1節、管理用として保持するが今回はUIを最小限にとどめ、詳細な営業支援機能は作らない)
- 外部内覧ページの自動ツアー(`is_auto_tour_target`列は用意するが、自動再生ロジックはMVPでは実装しない)
