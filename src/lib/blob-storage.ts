import { del, put } from "@vercel/blob";

// Supabase Storageで、保存直後の読み取りが別サイズの中身を返す(=書き込み〜配信経路の
// 整合性そのものが壊れている)事象が実機で繰り返し確認されたため、画像・動画の保存先を
// Vercel Blobに切り替える。既存データ(Supabase Storage上のURL)はそのまま
// /api/storage-proxy 経由での表示を維持しつつ、新規アップロード分のみここを通す。
export async function uploadToBlob(pathname: string, buffer: Buffer, contentType: string): Promise<{ publicUrl: string }> {
  const result = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });
  return { publicUrl: result.url };
}

export async function deleteFromBlob(urls: string[]): Promise<void> {
  const targets = urls.filter((url) => !!url);
  if (targets.length === 0) return;
  await del(targets);
}
