const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/";

// Supabase Storageの公開URL(/storage/v1/object/public/...)は、CDN層でRangeリクエストの
// 応答が誤ってキャッシュされ、以後そのURL全体が壊れて配信され続ける不具合が実機で複数回
// 確認されている(cacheControl短縮だけでは再発する)。表示側では常にこの関数を通し、
// 自前のプロキシ(/api/storage-proxy、Storage SDKのdownload()経由=公開CDN層を経由しない)
// のURLに変換する。Supabase以外のURL(静的アセット等)はそのまま返す。
//
// マッチングはNEXT_PUBLIC_SUPABASE_URLとの完全一致(startsWith)ではなく、URL中の
// "/storage/v1/object/public/" というパス構造で判定する。環境変数の末尾スラッシュや
// 大文字小文字の違い、ビルド時と実行時での値のズレなどで変換が黙って素通りしてしまう
// (＝壊れた直リンクがそのまま表示される)事故を避けるため。
export function toDisplayUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const markerIndex = url.indexOf(STORAGE_PUBLIC_MARKER);
  if (markerIndex === -1) return url;

  const rest = url.slice(markerIndex + STORAGE_PUBLIC_MARKER.length); // "<bucket>/<path...>"
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return url;

  const bucket = rest.slice(0, slashIndex);
  const path = rest.slice(slashIndex + 1);
  return `/api/storage-proxy?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
}
