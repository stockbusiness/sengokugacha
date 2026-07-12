import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Supabase Storageの公開URL(/storage/v1/object/public/...)は、CDN層でRangeリクエストの
// 応答が誤ってキャッシュされ、以後そのURL全体が壊れて配信され続ける不具合が実機で複数回
// 確認されている。このルートはStorage SDKの認証済みdownload()(公開CDNの配信経路とは別の
// エンドポイント)経由で取得し直すことで、この不具合を回避する。表示側は常に
// src/lib/image-url.tsのtoDisplayUrl()を通してこのルートのURLを使う。
const ALLOWED_BUCKETS = new Set(["warlord-images", "metaverse-images", "rich-menu-images", "gacha-animations"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  const path = searchParams.get("path");

  if (!bucket || !path || !ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
