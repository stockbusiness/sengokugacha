import { NextResponse } from "next/server";
import { getLineSettings } from "@/lib/line-settings";

// LIFF初期化(=ログイン前)に必要な設定を返すため、認証は要求しない。
// liff_idはLIFFアプリのURLにも含まれる非機密情報。
export async function GET() {
  const settings = await getLineSettings();
  return NextResponse.json({ liffId: settings?.liff_id ?? null });
}
