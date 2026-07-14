import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAssignablePlots } from "@/lib/external-orders";

// 割当可能区画一覧(7-3)。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const plots = await getAssignablePlots(id);
    return NextResponse.json(plots);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
