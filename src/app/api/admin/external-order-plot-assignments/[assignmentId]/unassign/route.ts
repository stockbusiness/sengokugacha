import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { unassignPlotFromOrderItem } from "@/lib/external-orders";

// 区画割当の解除(7章)。実装計画5章のパス案(external-order-items/[itemId]/unassign-plot)は
// lib層の関数がassignment単位で操作する設計になったため、assignmentIdベースのパスへ変更している。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assignmentId } = await params;
  try {
    await unassignPlotFromOrderItem(assignmentId, await getAdminActorName());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "区画割当の解除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
