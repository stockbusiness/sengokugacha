import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { upsertConquestRule } from "@/lib/conquest-rules";

// 国制覇条件の作成・更新(本部管理者限定)。ゲーム進行に直結するため財務影響が
// なくてもmanager限定とする(実装計画5章)。
export async function PUT(request: NextRequest, { params }: { params: Promise<{ provinceId: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "国制覇条件の変更は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { provinceId } = await params;
  const body = await request.json().catch(() => null);
  const isActive = Boolean(body?.isActive);
  const requiredWarlordIds: string[] = Array.isArray(body?.requiredWarlordIds)
    ? body.requiredWarlordIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (isActive && requiredWarlordIds.length === 0) {
    return NextResponse.json({ error: "有効にする場合は必須武将を1体以上選択してください" }, { status: 400 });
  }

  try {
    await upsertConquestRule(provinceId, isActive, requiredWarlordIds, await getAdminActorName());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
