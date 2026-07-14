import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { grantExternalOrderRights } from "@/lib/external-orders";

// 区画権利付与確定(8章、本部管理者限定)。LINE通知は実装計画5章の方針により
// この関数の外側(呼び出し元)でベストエフォート実行する想定(別PRで追加)。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "権利付与確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await grantExternalOrderRights(id, await getAdminActorName());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "権利付与に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
