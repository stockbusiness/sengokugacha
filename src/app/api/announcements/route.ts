import { NextResponse } from "next/server";
import { getAnnouncements } from "@/lib/announcements";
import { getSession } from "@/lib/session";

// 国家ダッシュボードの「国家ニュース」カード向け。既存のお知らせ(announcements)を
// そのまま流用する(指示書: 「新規システムへ置き換えないこと」)。
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const announcements = await getAnnouncements();
  return NextResponse.json(announcements.slice(0, 5));
}
