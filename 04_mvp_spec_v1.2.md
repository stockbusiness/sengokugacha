# 戦国経済圏OS(戦国パスポート) MVP機能仕様書 Ver.1.0

作成日: 2026年7月6日
対象: 開発着手用。単独開発(田中氏)を前提に、実装範囲・DB設計・API・管理画面項目まで落とし込む。
前提ドキュメント: 戦国経済圏OSプロジェクト整理ドキュメント Ver.1.0 / ガチャゲームデザイン案 Ver.1.3

---

## 0. スコープ(MVP=Phase1で作るもの)

### 含むもの
- 戦国パスポート(LIFFアプリ、LINEログイン)
- 無料/有料ガチャ(石高・ガチャ券消費)
- 国盗りメタゲーム(初期25国+美濃国、ビンゴ型蓄積)
- 代理店紐付け(URLパラメータ方式、記録のみ・自動集計はPhase2)
- 管理画面(カード/国/ガチャ設定/イベントプリセット)
- Stripe決済(石高・ガチャ券購入、天下統一パス)

### 含まないもの(Phase2以降)
- 代理店売上の自動集計・ランク自動昇格
- 軍団(ギルド)機能
- ビンゴ(国盗り以外の通常ビンゴ)、ミッション機能のフル実装(MVPでは簡易版のみ)
- NFT自動連携(ウォレット連携)、マーケットプレイス連携
- 全国マップの本格演出(MVPは簡易塗り絵UI)

## 0.5 グラフィック・演出方針(重要・優先度高)

ガチャは単なる継続接点ではなく、**戦国メタバース(将来構想)の世界観を体験させる予告編、および開発資金源**という位置づけを持つ。そのため、当初「軽量でよい」としていたグラフィック・演出は、以下の通り優先投資領域とする。

- 武将カードイラストは、紋章・アイコンではなく**城下町の情景を感じさせる1枚絵**(シネマティック・実写風)にする
- 一貫したアートスタイル(桜・城・石畳・夕景等)をスタイルガイドとして固定し、AI画像生成で75武将+66国分の素材を統一感を保ちつつ量産する
- 国制圧演出に、その国の城下町コンセプトアートをフェードイン表示し、「この城下町は将来、戦国メタバースで実際に歩けるようになります」という一文を添える
- ガチャ当たり演出は、リアルタイム3Dではなく**事前レンダリング済み動画/Lottieアニメーション**を再生する形式(LIFF内WebViewの処理負荷回避と見栄えの両立)

### 戦国メタバース本体との関係(将来構想・現時点では未着手)
```
戦国パスポート(LINE/LIFF) ← 今作っているもの。日常の接点・ガチャ・国盗り・資金調達
        ↓(将来)
戦国メタバース(独立Webアプリ・3D城下町、VR不採用) ← ガチャ収益を開発資金に充当
```
- VRヘッドセットは不採用。ブラウザ上のウォークスルー型3D空間を想定
- 3D城下町はLIFF内では処理負荷上厳しいため、メタバース本体は将来LINEの外の独立Webアプリとして切り出す想定(現時点では設計のみ)
- 資金源としての訴求は「応援・体験の前払い」に留め、「投資すれば価値が上がる」という表現は使わない(13章の射幸性・投資的表現の回避方針と一貫)

---



| # | 画面名 | 概要 |
|---|---|---|
| 1 | ホーム(パスポート) | ランク、石高、戦功、所持武将数、制圧国数を表示。各機能への導線 |
| 2 | ガチャ画面 | 無料/有料ガチャ実行、演出、排出結果表示 |
| 3 | 図鑑・所持武将一覧 | 獲得済み武将のコレクション表示(国別・レアリティ別) |
| 4 | 日本地図(国盗り進捗) | 制圧済み/未制圧の国を色分け表示。美濃国は解放条件未達なら鍵アイコン表示 |
| 5 | 地方コンプ画面 | 8地方ごとの達成状況・特典受け取り |
| 6 | 天下統一達成演出画面 | 美濃国制圧時、代表武将選択→NFT生成演出 |
| 7 | 購入画面(石高/ガチャ券/天下統一パス) | Stripe Checkoutへの外部遷移含む |
| 8 | 紹介リンク表示画面 | 自分の紹介URL・QRコード表示(ユーザー間紹介用) |
| 9 | 送客導線(AIアート教室/NFTマーケット/評議員) | 外部LP・LINEリッチメニューへの遷移ボタン |
| 10 | 管理画面(Web/認証必須) | 下記4章参照 |

---

## 2. データベース設計(Supabase / PostgreSQL想定)

### ユーザー・パスポート関連
```sql
users
- id (uuid, PK)
- line_user_id (text, unique)
- display_name (text)
- rank (text)  -- 足軽/侍/武将/軍師/奉行/大名/将軍
- kokudaka (int)  -- 石高
- senko (int)     -- 戦功
- gacha_tickets (int)  -- ガチャ券
- referring_agent_id (uuid, nullable, FK -> agents.id)  -- 登録時の紹介元代理店
- created_at (timestamptz)
```

### 武将・国データ
```sql
provinces
- id (uuid, PK)
- name (text)  -- 例: 美濃、尾張
- region (text)  -- 8地方区分
- is_final_province (boolean, default false)  -- 美濃国のみtrue
- unlock_condition_count (int, nullable)  -- 例: 60 (他60国制圧で解放)
- display_order (int)
- landmark_name (text, nullable)  -- 将来の3D空間内シンボル建造物名(例:岐阜城)
- theme_description (text, nullable)  -- 将来の3D空間演出用の世界観設定文
- has_castle_town (boolean, default false)  -- 将来、城下町3D空間を持つ国かどうかのフラグ
- castle_town_concept_art_url (text, nullable)  -- 制圧演出で表示する城下町コンセプトアート

warlords (武将マスタ)
- id (uuid, PK)
- province_id (uuid, FK -> provinces.id)
- name (text)
- rarity (text)  -- 足軽級/侍級/武将級/軍師級/大名級
- slot_type (text)  -- common/mid/rare (国内3体のうちどのスロットか)
- stats_json (jsonb)  -- 統率/知略/勇猛など
- lore (text)  -- 逸話
- image_url (text)  -- カードイラスト(城下町の情景を感じさせる1枚絵)
- gacha_reveal_animation_url (text, nullable)  -- 当たり演出用の事前レンダリング動画/Lottieファイル
- tenka_toitsu_image_url (text, nullable)  -- 天下統一verの合成済み画像URL

user_warlords (所持武将)
- id (uuid, PK)
- user_id (uuid, FK)
- warlord_id (uuid, FK)
- count (int, default 1)  -- 被り枚数(合成素材用)
- acquired_at (timestamptz)

user_provinces (国の制圧状況)
- id (uuid, PK)
- user_id (uuid, FK)
- province_id (uuid, FK)
- is_conquered (boolean, default false)
- conquered_at (timestamptz, nullable)
```

### ガチャ関連
```sql
gacha_config (管理画面から編集する設定テーブル。1行運用)
- id (uuid, PK)
- base_daily_free_limit (int, default 1)
- base_daily_paid_limit (int, default 3)
- event_free_limit_override (int, nullable)
- event_paid_limit_override (int, nullable)
- event_start_at (timestamptz, nullable)
- event_end_at (timestamptz, nullable)
- preset_name (text, nullable)  -- 通常/小規模イベント/大型イベント

gacha_logs (実行ログ。KPI集計・不正検知用)
- id (uuid, PK)
- user_id (uuid, FK)
- warlord_id (uuid, FK)
- is_paid (boolean)  -- 無料/有料の別
- conquered_provinces_count_at_draw (int)  -- 抽選時点の制圧済み国数(排出率検証用)
- created_at (timestamptz)
```

### 代理店関連(Phase1は記録のみ)
```sql
agents (代理店)
- id (uuid, PK)
- name (text)
- rank (text)  -- アドバイザー/ディレクター/エージェント (Phase1は手動更新)
- referral_code (text, unique)  -- URLパラメータに使う識別子

agent_sales (売上イベント。Phase1は記録のみ、集計はPhase2)
- id (uuid, PK)
- agent_id (uuid, FK)
- buyer_user_id (uuid, FK)
- amount (int)  -- 円
- type (text)  -- self/referral
- source (text)  -- gacha/pass/nft等、何の購入か
- created_at (timestamptz)

achievements (実績イベント。天下統一等の記録)
- id (uuid, PK)
- user_id (uuid, FK)
- achievement_type (text)  -- 例: "tenka_toitsu", "region_complete_kanto" 等
- referring_agent_id (uuid, nullable, FK -> agents.id)  -- 参考データのみ
- achieved_at (timestamptz)
```

### 決済関連
```sql
purchases (購入履歴)
- id (uuid, PK)
- user_id (uuid, FK)
- stripe_session_id (text)
- item_type (text)  -- kokudaka/gacha_ticket/tenka_pass
- amount (int)
- status (text)  -- pending/completed/failed
- created_at (timestamptz)
```

---

## 3. 主要ロジック仕様

### 3.1 ガチャ抽選ロジック

```
1. ユーザーの conquered_provinces_count を取得
   (user_provinces で is_conquered=true の件数をカウント)

2. 難易度ティアを判定:
   0-5国: レア枠15% / 中間枠30% / コモン枠55%
   6-15国: 10% / 30% / 60%
   16-30国: 6% / 28% / 66%
   31-50国: 3% / 25% / 72%
   51-66国: 1.5% / 20% / 78.5%

3. 未制圧国(美濃国は解放条件を満たすまで対象外)からランダムに1国を選び、
   その国の3スロット(コモン/中間/レア)のいずれかを上記確率で決定

4. 該当武将を user_warlords に加算(既に所持していれば count+1)

5. gacha_logs に記録

6. その国の3武将すべてが揃っていれば user_provinces.is_conquered = true に更新
   → 制圧演出をトリガー(城下町コンセプトアートのフェードイン+メタバース訴求文を表示)
   → 地方コンプ判定(同地方の全国制圧済みか確認)
   → 美濃国解放条件(60国制圧)を満たしたか確認
```

### 3.2 ガチャ実行可否判定(回数制限)

```
1. gacha_config から本日有効な free_limit / paid_limit を取得
   (event期間内なら event_*_override を優先、なければ base_*_limit)

2. 本日の gacha_logs 件数(is_paid別)と比較し、上限に達していれば実行不可
```

### 3.3 代理店紐付けロジック

```
1. LIFF起動時、URLパラメータ ?ref=AGENT_CODE を取得
2. 該当の agents.referral_code と一致する代理店を検索
3. 戦国パスポート新規登録時のみ、users.referring_agent_id に記録
   (登録完了後は変更不可。アトリビューションはファーストタッチ確定方式)
4. 以後の購入イベント(gacha, pass等)は agent_sales に記録
   (type: self=本人購入, referral=紹介経由。ただしPhase1では集計・ランク反映はしない)
```

### 3.4 天下統一達成フロー

```
1. 美濃国の3武将が揃う(is_conquered=true)
2. 天下統一達成演出画面へ遷移
3. ユーザーが代表武将を1体選択
4. 選択武将ベースの記念NFT画像を生成(合成ロジック。実装詳細は別途)
5. achievements テーブルに記録(referring_agent_idも記録)
6. 称号「天下人」付与、特典クーポン発行
```

---

## 4. 管理画面 仕様(Web、認証必須)

| 項目 | 内容 |
|---|---|
| 武将マスタ管理 | warlords テーブルのCRUD(名前・国・レアリティ・ステータス・画像) |
| 国マスタ管理 | provinces テーブルのCRUD、美濃国の解放条件数値変更 |
| ガチャ設定 | gacha_config の各値編集、プリセットボタン(通常/小規模/大型) |
| 代理店管理 | agents テーブルのCRUD、referral_code発行 |
| 売上ログ閲覧 | agent_sales の一覧・CSV出力(Phase1は手動集計用) |
| 実績ログ閲覧 | achievements の一覧(天下統一達成者・紐付け代理店の確認) |
| ユーザー検索 | users テーブル検索(サポート対応用) |

---

## 5. 決済フロー(Stripe)

```
1. 購入画面で「石高◯◯円分」「ガチャ券1枚」「天下統一パス」いずれかを選択
2. LIFF内から外部ブラウザを起動(window.open等でLINE内ブラウザを回避)
3. Stripe Checkoutセッションを生成、遷移
4. 決済完了 → Webhookで purchases.status = completed に更新
   → 該当アイテム(石高加算/ガチャ券加算/パス有効化)を users テーブルに反映
5. 完了画面からLIFFへ復帰を促す導線(LINEに戻るボタン等)
```

---

## 6. KPI計測項目(既存11章のKPIに対応)

| KPI | 取得方法 |
|---|---|
| 初回ガチャ実行率 | gacha_logs の初回レコード有無 |
| 3日継続率 | users.created_at から3日後のログイン有無(要ログイン記録テーブル追加検討) |
| ガチャ実行回数(1日) | gacha_logs の日次集計 |
| 国制圧数分布 | user_provinces の集計 |
| 地方コンプ達成率 | achievements(region_complete系)の集計 |
| 天下統一達成者数 | achievements(tenka_toitsu)の件数 |

---

## 7. 開発優先順位(単独開発向け・実装順の目安)

1. LINEログイン + 戦国パスポート基本画面(ユーザー登録・表示)
2. 武将マスタ・国マスタのDB投入(管理画面より先に、まずSQL直接投入でも可)
3. ガチャ抽選ロジック(無料枠のみ)+ 結果表示画面
4. 国盗り判定ロジック(制圧・地方コンプ・美濃国解放条件)
5. 日本地図の進捗表示画面(簡易版)
6. Stripe決済(石高購入)+ 有料ガチャ
7. 代理店紐付け(URLパラメータ→登録時記録)
8. 天下統一達成演出・NFT生成
9. 管理画面(ガチャ設定・武将/国マスタ編集)
10. 送客導線(AIアート教室・NFTマーケット・評議員への遷移ボタン)

---

## 8. 素材制作方針(確定)

### AI画像生成ツール
- Midjourneyを採用(初期75武将+25国分の城下町コンセプトアート)。手動生成、`--sref`によるスタイル一貫性確保。詳細手順は別紙「戦国経済圏OS Midjourney制作ガイド」参照
- Phase2以降、追加コンテンツの生成負荷が高まればAPI化(Stable Diffusion等)を再検討

### ガチャ当たり演出
- Lottieではなく**事前レンダリング動画(mp4)方式**を採用(実写風・シネマティックな質感を優先)
- 個別武将75体分は作らず、**レアリティ別(5パターン)の演出動画+個別武将カードのフェードイン**という2段構成にして制作負荷を抑える
- ファイルサイズは軽量圧縮(H.264、数MB以内)、読み込み中はローディング演出で対応

### 天下統一記念NFT(75枚)の制作スケジュール
```
Phase1(リリース前後): 先行サンプル3〜5体
  - 美濃国ゆかり(斎藤道三・織田信長)+ 著名武将(徳川家康・武田信玄等)を優先
  - LP・SNS告知・代理店営業資料に活用し、初期からゴールの魅力を訴求
Phase2(リリース後、通常運用と並行): 残り70枚を順次追加
Phase3(最初の達成者接近時): 未完成分を優先的に仕上げ
```

### ログイン記録
- `login_logs` テーブルを追加し実装する(3日継続率KPI計測のため。1日1回のユニーク記録)

---

## 9. 残課題:なし

素材制作・演出・スケジュールに関する主要論点はすべて確定した。次のステップは実装着手(7章の開発優先順位に沿って進める)、または美濃国以外の国データ(地域固有要素等)の詳細確定。
