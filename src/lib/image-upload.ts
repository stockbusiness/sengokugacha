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
