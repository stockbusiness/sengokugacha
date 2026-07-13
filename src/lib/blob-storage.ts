import { del, put } from "@vercel/blob";

// Supabase Storageで、保存直後の読み取りが別サイズの中身を返す(=書き込み〜配信経路の
// 整合性そのものが壊れている)事象が実機で繰り返し確認されたため、画像・動画の保存先を
// Vercel Blobに切り替える。既存データ(Supabase Storage上のURL)はそのまま
// /api/storage-proxy 経由での表示を維持しつつ、新規アップロード分のみここを通す。
export async function uploadToBlob(pathname: string, buffer: Buffer, contentType: string): Promise<{ publicUrl: string }> {
  // Node.jsの小さいBufferはSlab(内部共有プール)から割り当てられることがあり、その場合
  // buffer.bufferはプールを指す共有ArrayBufferになる。これをそのままfetch()のbodyに渡すと
  // "TypeError: ArrayBuffer: SharedArrayBuffer is not allowed."で失敗する
  // (put()の内部実装がfetch()を使っているため)。Blobでラップして渡すことで、共有プールの
  // 参照を持たない独立したコピーとして送信されるようにする。
  const result = await put(pathname, new Blob([new Uint8Array(buffer)], { type: contentType }), {
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
