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

const UPLOAD_VERIFY_MAX_ATTEMPTS = 3;

// リトライ時に同じパスへ再アップロードすると、読み取り経路側に何らかのキャッシュ/整合性の
// 問題がある場合(実機で、直後の再ダウンロードが全く別サイズの中身を返す事象が確認された)、
// 同じキーに対して何度リトライしても同じ壊れた結果を引き続けてしまう。そのため試行ごとに
// 別パス(拡張子の直前に -retry2 のようなサフィックスを挿入)を使い、毎回まっさらな
// オブジェクトとして書き込み直す。
function withRetrySuffix(path: string, attempt: number): string {
  if (attempt <= 1) return path;
  const lastDot = path.lastIndexOf(".");
  const suffix = `-retry${attempt}`;
  return lastDot === -1 ? `${path}${suffix}` : `${path.slice(0, lastDot)}${suffix}${path.slice(lastDot)}`;
}

// Supabase Storageへのアップロード直後、再ダウンロードした内容が書き込んだバイト列と
// (サイズからして別物と分かるレベルで)一致しない事象が実機で確認されている。CDN層の
// Rangeキャッシュ不具合とは別に、書き込み〜配信経路の整合性そのものに問題があるとみられる。
// アップロードして終わりにせず、その場で再ダウンロードしてバイト列の完全一致を検証し、
// 一致しなければ「別の新しいパス」に再アップロードして再検証する。これにより「保存自体は
// 200 OKで成功したが、後から見ると画像が壊れている」というサイレントな破損を、アップロード
// 操作そのものの失敗としてユーザーに伝えられるようにする。
export async function uploadImageAndVerify(
  supabase: SupabaseServerClient,
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ publicUrl: string }> {
  let lastErrorMessage = "不明なエラー";

  for (let attempt = 1; attempt <= UPLOAD_VERIFY_MAX_ATTEMPTS; attempt++) {
    const attemptPath = withRetrySuffix(path, attempt);
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(attemptPath, buffer, { contentType, upsert: true, cacheControl: "60" });
    if (uploadError) {
      lastErrorMessage = uploadError.message;
      continue;
    }

    const { data: verifyData, error: verifyError } = await supabase.storage.from(bucket).download(attemptPath);
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
    } = supabase.storage.from(bucket).getPublicUrl(attemptPath);
    return { publicUrl };
  }

  throw new ImageUploadVerificationError(
    `画像の保存後の検証に失敗しました。時間をおいて再度お試しください。(${lastErrorMessage})`
  );
}
