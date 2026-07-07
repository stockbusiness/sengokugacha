# 戦国経済圏OS Midjourney 制作ガイド Ver.1.0

作成日: 2026年7月6日
対象: 武将カードイラスト(75枚)・城下町コンセプトアート(25〜26国分)の制作

---

## 1. 導入手順

1. **アカウント作成**: midjourney.com にアクセスし、Googleアカウント等でサインアップ
2. **プラン契約**: 月額サブスクリプションプランに加入(生成量に応じてプラン選択。まずは標準プランで様子を見るのが無難)
3. **Web版で生成開始**: サインイン後、画面上部の入力欄にプロンプトを入力してEnter
4. **結果確認**: 1回の生成で4枚のバリエーションが表示される
5. **選定・高解像度化**: 気に入った1枚をクリックし、「Upscale」または類似ボタンで高解像度版を生成
6. **ダウンロード**: 高解像度画像を保存し、`image_url` に相当するストレージ(Supabase Storage等)へアップロード

---

## 2. 一貫性を保つためのポイント

### 2.1 スタイルガイド(固定で使う語彙)
毎回のプロンプトに、以下の共通ワードを必ず含める。これにより全素材のトーンが揃う。

```
共通スタイルワード:
cinematic, photorealistic, Japanese sengoku-era, golden hour lighting,
dramatic atmosphere, highly detailed, 8K
```

### 2.2 スタイル参照機能(--sref)の活用
Midjourneyには「Style Reference(--sref)」という、過去に生成した画像や参考画像のスタイルを他の生成に引き継げる機能がある。

- 最初に理想の1枚(武将カード用・城下町用それぞれ)を作ったら、その画像URLを控えておく
- 以降のプロンプト末尾に `--sref [画像URL]` を追加することで、同じ画風を保ったまま量産できる
- これは75枚+25国分の一貫性を保つ上で**最も重要なテクニック**なので、最初の1枚が決まったら必ず控えておくこと

### 2.3 シード値(--seed)の活用(応用)
同じシード値を使うと、構図の傾向が近い画像を生成しやすくなる。武将カードなど「同じ構図パターンで人物だけ変える」場合に有効。必須ではないが、量産時に試す価値がある。

### 2.4 アスペクト比
- 武将カード: `--ar 3:4`(縦長・肖像向き)
- 城下町コンセプトアート: `--ar 9:16`(縦長・アプリ画面向き。今回の参考画像と同じ比率)

---

## 3. 武将カード用プロンプトテンプレート

### 基本テンプレート
```
Cinematic photorealistic portrait of a Japanese sengoku-era warlord,
[人物の特徴], [鎧・衣装の特徴], [表情・ポーズ],
background of a misty castle town with cherry blossoms,
golden hour lighting, dramatic atmosphere, highly detailed, 8K
--ar 3:4 --sref [控えた参照画像URL]
```

### レアリティ別の演出差(スロット設計との連動)

| スロット | 演出の方向性 |
|---|---|
| コモン枠(足軽級/侍級) | 素朴な鎧、簡素な背景、控えめな表情 |
| 中間枠(武将級) | やや豪華な鎧・家紋入り旗、背景に城の一部 |
| レア枠(軍師級/大名級) | 豪華な鎧・金の装飾、背景に城全体・戦の気配、威厳ある表情 |

### 記入例(織田信長・尾張国・レア枠想定)
```
Cinematic photorealistic portrait of a Japanese sengoku-era warlord,
a young ambitious daimyo with sharp eyes, wearing dark armor with
a golden crest, holding a fan, standing confidently,
background of a grand castle town with cherry blossoms and banners,
golden hour lighting, dramatic atmosphere, highly detailed, 8K
--ar 3:4 --sref [参照画像URL]
```

### 記入例(雑兵・美濃国・コモン枠想定)
```
Cinematic photorealistic portrait of a Japanese sengoku-era foot soldier,
simple armor, holding a spear, modest expression,
background of a quiet castle town street with cherry blossom trees,
golden hour lighting, dramatic atmosphere, highly detailed, 8K
--ar 3:4 --sref [参照画像URL]
```

---

## 4. 城下町コンセプトアート用プロンプトテンプレート

### 基本テンプレート
```
Cinematic aerial view of a Japanese sengoku-era castle town,
wooden buildings with tiled roofs, stone pathways, cherry blossom trees,
a castle visible on a hill in the background, mountains beyond,
[国ごとの固有要素],
golden hour lighting, photorealistic, highly detailed, 8K
--ar 9:16 --sref [控えた参照画像URL]
```

### 国ごとの固有要素の例
| 国 | 固有要素の例 |
|---|---|
| 尾張 | a bustling market street, merchant banners |
| 近江 | a large lake visible in the distance, fishing boats |
| 甲斐 | steep mountains surrounding the town, a river gorge |
| 播磨 | a coastal view with distant sea, white castle walls |
| 美濃(最終国・岐阜) | a majestic castle on a tall mountain, symbolizing unification, more grand and imposing than other towns |

### 記入例(近江国)
```
Cinematic aerial view of a Japanese sengoku-era castle town,
wooden buildings with tiled roofs, stone pathways, cherry blossom trees,
a castle visible on a hill in the background, mountains beyond,
a large lake visible in the distance with fishing boats,
golden hour lighting, photorealistic, highly detailed, 8K
--ar 9:16 --sref [参照画像URL]
```

### 記入例(美濃国・特別扱い)
```
Cinematic aerial view of a majestic Japanese sengoku-era castle town,
grand wooden buildings with tiled roofs, wide stone pathways,
abundant cherry blossom trees, an imposing castle atop a tall mountain
dominating the skyline, symbolizing the unification of the land,
golden hour lighting, photorealistic, highly detailed, 8K
--ar 9:16 --sref [参照画像URL]
```

---

## 5. 制作の進め方(推奨フロー)

1. **試作(1枚ずつ)**: まず武将カード1枚・城下町1枚を上記テンプレートで生成し、狙った世界観に近いか確認する
2. **スタイル確定**: 気に入った結果が出たら、その画像を `--sref` 用に保存(以降すべての生成でこのURLを使う)
3. **量産フェーズ**: 25国×3武将=75枚のカード、25枚の城下町アートを、固有要素だけ差し替えながら生成
4. **選定・保存**: 各生成で4枚出るバリエーションから最も良いものを選び、高解像度化してダウンロード
5. **アップロード**: Supabase Storage等にアップロードし、`warlords.image_url` / `provinces.castle_town_concept_art_url` に登録

---

## 6. 制作時の注意点

- 生成された画像に**実在の人物や著作権のあるキャラクターに酷似したもの**が出た場合は使用しない(Midjourneyは稀に既存キャラクターに寄せた生成をすることがある)
- 武将の名称(織田信長、豊臣秀吉等)をプロンプトに直接入れると、意図しない実在の肖像画・既存作品に寄せた生成になることがあるため、**プロンプトには外見の特徴のみを記述し、名称は入れない**方が安全(生成後にDB側でどの武将かを紐付ける)
- 大量生成にはそれなりの時間がかかるため、最初にまとめて25国分の固有要素(表)を一覧化しておくと、作業を淡々と進めやすい
