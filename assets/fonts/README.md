# カードテンプレート合成用フォント

`src/lib/card-template.ts`(`next/og`の`ImageResponse`)が、武将カード画像に
武将名・スキル名・ステータス等の日本語テキストを合成する際に使うフォント。

- 元フォント: [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)(Google Fonts、[SIL Open Font License 1.1](https://openfontlicense.org/)、商用利用・再配布・埋め込み可)
- Bold(weight 700)のみを使用。常用漢字2136字+ひらがな・カタカナ+基本ラテン文字+
  カード表示で使う可能性のある国名・用語(旧国名・統率/知略/武勇 等)に文字を絞り込んで
  `fonttools`でサブセット化し、WOFF形式に変換したもの(元は約9.6MBの可変フォント→約580KB)。
- `next/og`の`ImageResponse`はフォントを明示的に埋め込む必要があり(サーバー環境に
  日本語フォントが入っている保証がないため)、`ttf`/`otf`/`woff`のみ対応(`woff2`は非対応)。

## 再生成する場合

サブセット対象の文字を増やしたい場合(例: 常用漢字外の武将名を使いたい)は、
`fonttools`(`pip install fonttools brotli`)で以下の手順を再実行する。

1. [Noto Sans JPの可変フォント](https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf)を取得
2. `python3 -m fontTools.varLib.instancer <元ファイル> wght=700 -o instance.ttf` でBold単体を抽出
3. 必要な文字を1行のテキストファイルにまとめ、
   `python3 -m fontTools.subset instance.ttf --text-file=chars.txt --output-file=NotoSansJP-Bold.woff --flavor=woff --layout-features='*' --no-hinting --desubroutinize`
