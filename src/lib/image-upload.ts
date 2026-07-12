import sharp from "sharp";
import type { createSupabaseServerClient } from "@/lib/supabase-server";

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

// ガチャ動画演出のポスター画像(読み込み中・通信失敗時に表示)。仕様書7章の推奨値
// (720×1280 WebP、300KB以下目安)に合わせる。
const POSTER_WIDTH = 720;
const POSTER_HEIGHT = 1280;
const POSTER_MAX_BYTES = 300 * 1024;

export async function resizeForGachaPoster(input: Buffer): Promise<ResizedImage> {
  const base = sharp(input)
    .rotate()
    .resize({
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      fit: "cover",
      position: "centre",
    });

  for (const quality of [85, 75, 65, 55, 45]) {
    const buffer = await base.clone().webp({ quality }).toBuffer();
    if (buffer.byteLength <= POSTER_MAX_BYTES) {
      return { buffer, contentType: "image/webp", extension: "webp" };
    }
  }

  throw new Error("ポスター画像を300KB以下に圧縮できませんでした。別の画像でお試しください。");
}

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export class ImageUploadVerificationError extends Error {}

const UPLOAD_VERIFY_MAX_ATTEMPTS = 2;

// Supabase Storageへのアップロード直後にごく稀に、書き込んだバイト列と実際に取得できる
// バイト列が一致しない(=保存された時点で既に壊れている)事象が実機で確認されている。
// アップロードして終わりにせず、その場で再ダウンロードしてバイト列の完全一致を検証し、
// 一致しなければ同じパスに再アップロードして再検証する。これにより「保存自体は200 OKで
// 成功したが、後から見ると画像が壊れている」というサイレントな破損を、アップロード操作
// そのものの失敗としてユーザーに伝えられるようにする。
export async function uploadImageAndVerify(
  supabase: SupabaseServerClient,
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ publicUrl: string }> {
  let lastErrorMessage = "不明なエラー";

  for (let attempt = 1; attempt <= UPLOAD_VERIFY_MAX_ATTEMPTS; attempt++) {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: true, cacheControl: "60" });
    if (uploadError) {
      lastErrorMessage = uploadError.message;
      continue;
    }

    const { data: verifyData, error: verifyError } = await supabase.storage.from(bucket).download(path);
    if (verifyError || !verifyData) {
      lastErrorMessage = verifyError?.message ?? "アップロード後の検証用ダウンロードに失敗しました";
      continue;
    }

    const verifyBuffer = Buffer.from(await verifyData.arrayBuffer());
    if (!verifyBuffer.equals(buffer)) {
      lastErrorMessage = `保存されたファイルがアップロードしたデータと一致しません(${verifyBuffer.length}バイト / 期待値${buffer.length}バイト)`;
      continue;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    return { publicUrl };
  }

  throw new ImageUploadVerificationError(
    `画像の保存後の検証に失敗しました。時間をおいて再度お試しください。(${lastErrorMessage})`
  );
}
