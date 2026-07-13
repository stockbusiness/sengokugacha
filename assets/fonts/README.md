# カードテンプレート合成用フォント

`src/lib/card-template.ts`(`next/og`の`ImageResponse`)が、武将カード画像に
武将名・スキル名・ステータス等の日本語テキストを合成する際に使うフォント。
用途別に2書体を使い分けている。

## NotoSansJP-Bold.woff(本文・ラベル・数値用)

- 元フォント: [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)(Google Fonts、[SIL Open Font License 1.1](https://openfontlicense.org/)、商用利用・再配布・埋め込み可)
- Bold(weight 700)のみを使用。常用漢字2136字+ひらがな・カタカナ+基本ラテン文字+
  カード表示で使う可能性のある国名・用語(旧国名・統率/知略/武勇 等)に文字を絞り込んで
  `fonttools`でサブセット化し、WOFF形式に変換したもの(元は約9.6MBの可変フォント→約580KB)。

### 再生成する場合

1. [Noto Sans JPの可変フォント](https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf)を取得
2. `python3 -m fontTools.varLib.instancer <元ファイル> wght=700 -o instance.ttf` でBold単体を抽出
3. 必要な文字を1行のテキストファイルにまとめ、
   `python3 -m fontTools.subset instance.ttf --text-file=chars.txt --output-file=NotoSansJP-Bold.woff --flavor=woff --layout-features='*' --no-hinting --desubroutinize`

## ShipporiMincho-Bold.woff(武将名の見出し用)

武将名がゴシック体だと安っぽく見えるという指摘を受け、名前部分のみ明朝体に変更した。

- 元フォント: [Shippori Mincho](https://fonts.google.com/specimen/Shippori+Mincho)(Google Fonts、[SIL Open Font License 1.1](https://openfontlicense.org/)、商用利用・再配布・埋め込み可)。
  npmの[`@fontsource/shippori-mincho`](https://www.npmjs.com/package/@fontsource/shippori-mincho)パッケージ経由で取得(Google Fontsを再配布しているミラー)。
- Bold(weight 700)のみを使用。NotoSansJP-Boldと同じ考え方で、常用漢字2136字+
  ひらがな・カタカナ(拗音・長音符・々・ヶ含む)+基本ラテン文字に絞り込んで
  `fonttools`でサブセット化(元は約1.9MBの静的フォント→約620KB)。

### 再生成する場合

1. `npm install @fontsource/shippori-mincho` で取得し、
   `node_modules/@fontsource/shippori-mincho/files/shippori-mincho-japanese-700-normal.woff`を元ファイルとする
   (この書体は可変フォントではなく太さごとに静的ファイルが分かれているため、instancerの手順は不要)
2. 必要な文字を1行のテキストファイルにまとめ、
   `python3 -m fontTools.subset <元ファイル> --text-file=chars.txt --output-file=ShipporiMincho-Bold.woff --flavor=woff --layout-features='*' --no-hinting --desubroutinize`

## next/ogの制約

`next/og`の`ImageResponse`はフォントを明示的に埋め込む必要があり(サーバー環境に
日本語フォントが入っている保証がないため)、`ttf`/`otf`/`woff`のみ対応(`woff2`は非対応)。
