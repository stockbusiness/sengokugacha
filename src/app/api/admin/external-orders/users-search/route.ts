import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { searchLinkCandidateUsers } from "@/lib/external-orders";

// 購入者↔LINEユーザーの紐付け候補検索(6-1)。既存の/api/admin/usersとは別に、
// 外部注文の紐付けフロー専用の軽量な検索エンドポイントとして切り出している。
export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const users = await searchLinkCandidateUsers(q);
    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : "検索に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
