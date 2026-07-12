const PUBLIC_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  : null;

// Supabase Storageの公開URL(/storage/v1/object/public/...)は、CDN層でRangeリクエストの
// 応答が誤ってキャッシュされ、以後そのURL全体が壊れて配信され続ける不具合が実機で複数回
// 確認されている(cacheControl短縮だけでは再発する)。表示側では常にこの関数を通し、
// 自前のプロキシ(/api/storage-proxy、Storage SDKのdownload()経由=公開CDN層を経由しない)
// のURLに変換する。Supabase以外のURL(静的アセット等)はそのまま返す。
export function toDisplayUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!PUBLIC_PREFIX || !url.startsWith(PUBLIC_PREFIX)) return url;

  const rest = url.slice(PUBLIC_PREFIX.length); // "<bucket>/<path...>"
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return url;

  const bucket = rest.slice(0, slashIndex);
  const path = rest.slice(slashIndex + 1);
  return `/api/storage-proxy?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
}
