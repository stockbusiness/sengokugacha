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
