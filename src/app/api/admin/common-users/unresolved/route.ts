import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { listUnresolvedCommonUsers } from "@/lib/common-user-resolution";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §5.7。
// common_user_id未解決ユーザーの一覧取得(読み取りのみのためoperator/manager両方許可)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const users = await listUnresolvedCommonUsers();
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "読み込みに失敗しました" }, { status: 500 });
  }
}
