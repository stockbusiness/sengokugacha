import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { listEnrollments } from "@/lib/learning-journey-admin";

// ユーザー別進捗。不正疑いの検知結果も併せて返すが、表示のみで自動遮断はしない(指示書§11)。
export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await listEnrollments(request.nextUrl.searchParams.get("courseId")));
}
