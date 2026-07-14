import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { setCastlePrimaryProvince } from "@/lib/castles";

// 城の主要国を設定・解除する(実装指示書v1.0 6-1)。
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const provinceId = typeof body?.provinceId === "string" ? body.provinceId : null;

  try {
    await setCastlePrimaryProvince(id, provinceId, await getAdminActorName());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
