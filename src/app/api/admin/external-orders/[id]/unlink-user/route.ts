import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import { ExternalOrderPermissionError, getExternalOrderDetail, unlinkUserFromOrder } from "@/lib/external-orders";
import { InvalidExternalOrderTransitionError } from "@/lib/external-order-state";

// 誤紐付け解除(6-4)。権利付与前は本部担当者でも実行できるが、権利付与後は
// 遷移マトリクス側でブロックされ、本部管理者であっても単純な解除はできない
// (専用の移管処理が必要、実装計画10章の仕様確認事項7を参照)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : null;
  if (!reason) return NextResponse.json({ error: "解除理由は必須です" }, { status: 400 });

  const adminRole = (await getAdminRole()) ?? "operator";

  try {
    await unlinkUserFromOrder(id, await getAdminActorName(), reason, adminRole);
    const detail = await getExternalOrderDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof InvalidExternalOrderTransitionError || error instanceof ExternalOrderPermissionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "紐付け解除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
