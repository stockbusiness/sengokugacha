import sharp from "sharp";

// LIFF(LINEアプリ内ブラウザ)での表示に十分な解像度を保ちつつ、モバイル回線での
// 読み込みが軽くなるようリサイズ・再圧縮する。長辺1080px・WebPは、ガチャ演出や
// 図鑑での表示サイズに対して十分な画質を保ちながらファイルサイズを抑えられる。
const MAX_DIMENSION = 1080;
const WEBP_QUALITY = 85;

export type ResizedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export async function resizeForLine(input: Buffer): Promise<ResizedImage> {
  const buffer = await sharp(input)
    .rotate() // EXIFのOrientation情報を反映してから正規化する
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return { buffer, contentType: "image/webp", extension: "webp" };
}

// LINEリッチメニュー(大サイズテンプレート)の必須解像度。
const RICH_MENU_WIDTH = 2500;
const RICH_MENU_HEIGHT = 1686;
// LINEの登録上限(1MB)に余裕を持って収める。
const RICH_MENU_MAX_BYTES = 950 * 1024;

export async function resizeForRichMenu(input: Buffer): Promise<ResizedImage> {
  const base = sharp(input)
    .rotate()
    .resize({
      width: RICH_MENU_WIDTH,
      height: RICH_MENU_HEIGHT,
      fit: "cover",
      position: "centre",
    });

  for (const quality of [85, 75, 65, 55, 45]) {
    const buffer = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.byteLength <= RICH_MENU_MAX_BYTES) {
      return { buffer, contentType: "image/jpeg", extension: "jpg" };
    }
  }

  throw new Error("画像を1MB以下に圧縮できませんでした。別の画像でお試しください。");
}
