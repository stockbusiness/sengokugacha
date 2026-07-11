# 戦国メタバース 城下町マップ・区画座標 実装計画

対象仕様書(アップロード資料): 戦国メタバース 城下町マップ・区画座標実装指示書

方針確認結果(ユーザー回答):
- 指示書推奨の「モデル地域」(約50区画、4エリア: 創設代理店特区・一般販売プレミアム・商業文化・町屋居住)をフル実装
- Unity座標は列のみ用意(実際の値・変換ロジック・エクスポートAPIは未作成)
- バージョン管理(draft/review/published)+座標変更履歴を実装
- 区画の所有権・代理店特別利用権(plot_rights)の管理画面も実装

## 1. 既存スキーマとの対応(重複を避けるための統合方針)

指示書は`maps`/`areas`/`blocks`/`plots`/`buildings`という新規テーブル群を提案しているが、このアプリには既にVer2.5〜2.7で`metaverse_maps`/`metaverse_areas`/`metaverse_properties`(=区画/物件)/`metaverse_map_hotspots`が存在し、画像ギャラリー・内覧シーン・問い合わせ等が紐づいている。指示書のテーブルをそのまま並列追加すると二重管理になるため、以下のように統合する。

| 指示書のテーブル | 対応 |
|---|---|
| `maps` | 既存`metaverse_maps`に列追加(`map_code`/`version`/`viewbox_width`/`viewbox_height`/`origin_x`/`origin_y`/`unity_scale`/`status`/`published_at`) |
| `areas` | 既存`metaverse_areas`に列追加(`map_id`/`area_code`/`internal_type`/`polygon`)。`display_name`=既存`name`、`sort_order`=既存`display_order`、`status`は既存列を流用 |
| `blocks`(街区) | 新規`metaverse_blocks`テーブル(既存に対応する概念が無いため新設) |
| `plots`(区画) | 既存`metaverse_properties`に列追加(`block_id`/`internal_category`/`polygon`/`anchor_x`/`anchor_y`/`frontage_angle`/`road_id`/`unity_x`/`unity_y`/`unity_z`/`unity_rotation_y`/`size_rank`/`location_rank`/`map_version`)。`plot_code`=既存`property_code`をそのまま使う(指示書の`SNGK-KINKA-A01-001`形式は`property_code`にそのまま入力できる) |
| `buildings` | 独立テーブルにはせず、既存`metaverse_properties`に列追加(`exterior_variant`/`interior_variant`/`crest_asset`/`nameplate_text`)。既存`metaverse_building_types`(建物タイプマスタ)をそのまま`building_type`として利用する。区画:建物=1:1の現行構造を維持(将来1区画複数建物が必要になった場合は別テーブル化を検討) |
| `plot_rights` | 新規`metaverse_plot_rights`テーブル(既存に対応する概念が無いため新設。`user_id`/`agency_id`は既存`users`/`agents`を参照) |
| `roads` | 新規`metaverse_roads`テーブル |
| `points_of_interest` | 新規`metaverse_points_of_interest`テーブル |
| `plot_geometry_history` | 新規`metaverse_plot_geometry_history`テーブル(`metaverse_properties`のpolygon/anchor変更時に変更前後を記録) |

## 2. バージョン管理の簡略化(明記)

指示書は区画単位・地域単位まで含めた汎用的なマルチバージョン管理を示唆しているが、今回は**マップ単位のdraft/review/published**とする(`metaverse_maps.status`)。編集中は管理画面のみで確認でき、`published`になったマップの中身(エリア・街区・区画のポリゴン)だけがLIFF側に表示される。区画(物件)のポリゴン・アンカー変更は`metaverse_plot_geometry_history`に変更前後を記録する。エリア・街区単位の個別バージョニングは行わない(将来必要になれば拡張)。

## 3. スキーマ詳細

### `metaverse_maps` への追加列
`map_code text unique`, `version text not null default 'v0.1'`, `viewbox_width int not null default 4096`, `viewbox_height int not null default 4096`, `origin_x numeric not null default 2048`, `origin_y numeric not null default 2048`, `unity_scale numeric not null default 0.25`, `status text not null default 'draft' check (status in ('draft','review','published','archived'))`, `published_at timestamptz`

### `metaverse_areas` への追加列
`map_id uuid references metaverse_maps(id)`, `area_code text unique`, `internal_type text`(武家屋敷/商業/民家/土地のみ/土地建物セット), `polygon jsonb`(SVGポリゴン座標の配列)

### `metaverse_blocks`(新規)
`id, area_id references metaverse_areas(id), block_code text unique, display_name text, polygon jsonb, capacity int, status text, display_order int, created_at, updated_at`

### `metaverse_properties` への追加列
`block_id uuid references metaverse_blocks(id)`, `internal_category text`, `polygon jsonb`, `anchor_x numeric`, `anchor_y numeric`, `frontage_angle numeric`, `road_id uuid references metaverse_roads(id)`, `unity_x numeric`, `unity_y numeric`, `unity_z numeric`, `unity_rotation_y numeric`, `size_rank text`, `location_rank text`, `map_version text`, `exterior_variant text`, `interior_variant text`, `crest_asset text`, `nameplate_text text`

### `metaverse_plot_rights`(新規)
`id, property_id references metaverse_properties(id), user_id references users(id), agency_id references agents(id), order_reference text, right_type text check (in ('ownership','special_usage_right','rental','management','reserved')), start_date date, end_date date, status text, assigned_at timestamptz, created_at, updated_at`

### `metaverse_roads`(新規)
`id, road_code text unique, display_name text, path jsonb, road_type text, width numeric, status text, map_id references metaverse_maps(id)`

### `metaverse_points_of_interest`(新規)
`id, map_id references metaverse_maps(id), poi_type text, name text, map_x numeric, map_y numeric, unity_x numeric, unity_y numeric, unity_z numeric, detail_url text, status text`

### `metaverse_plot_geometry_history`(新規)
`id, property_id references metaverse_properties(id), old_polygon jsonb, new_polygon jsonb, old_anchor_x numeric, old_anchor_y numeric, new_anchor_x numeric, new_anchor_y numeric, changed_by text, changed_at timestamptz, reason text, map_version text`

## 4. UI実装方針

- **管理画面**: SVGポリゴンエディタ(クリックで頂点を追加→ダブルクリックまたはボタンで確定、既存の点ホットスポットエディタ(Ver2.7)の発展形)。地域→街区→区画の順に作成する導線。街区内の区画は「行数・列数・区画間隔」を入力した自動生成ツール(指示書13章)を用意する。区画のポリゴン/アンカーを変更した際は`metaverse_plot_geometry_history`に自動記録する。
- **公開API/LIFF側**: `viewBox`固定のSVGオーバーレイで地域→街区→区画をタップ選択(指示書17章の構成に準拠)。既存のカード一覧はフォールバックとして維持する。
- **区画詳細ページ**: 所有者本人が自分の区画を確認できる導線は、今回は`metaverse_plot_rights.user_id`が自分と一致する区画を「マイページ」的に一覧表示する程度に留める(指示書11章の全権限要件のうち、一般ユーザー・所有者向けの範囲を優先し、代理店ポータル(`/agency`)・管理者向けは管理画面側で対応)。

## 5. 今回のスコープ外(明記)

- Unity用JSONエクスポートAPI・2D→Unity座標変換ロジックの実装(列のみ用意)
- CSV/Excel/GeoJSONのインポート・エクスポート機能
- 購入データの自動取込〜仮割当〜本配置ワークフロー(指示書14章)。今回は管理画面から`metaverse_plot_rights`を手動登録する運用とする
- エリア・街区単位の個別バージョニング(マップ単位のみ実装)
- 1,200区画全体への拡張(今回はモデル地域の約50区画のみ)

## 6. 実装順序

1. マイグレーション(既存テーブルへの列追加+新規6テーブル)
2. `src/lib/metaverse.ts`へのデータアクセス関数追加(ポリゴン取得、plot_rights取得等)
3. 管理画面: 街区管理・区画ポリゴンエディタ・自動生成ツール・plot_rights管理画面
4. 公開API+LIFF側のSVGオーバーレイ表示(地域→街区→区画のタップ選択)
5. モデル地域(4エリア・約50区画)のデータ投入は運営側で行う想定(管理画面から)
6. 検証・ドキュメント更新・コミット
