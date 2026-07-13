import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { bulkCreateDraftPlots } from "@/lib/castle-plots";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const count = Number(body?.count);
  const codePrefix = typeof body?.code_prefix === "string" ? body.code_prefix.trim() : "";
  const priceYen = Number(body?.price_yen);

  if (!Number.isFinite(count) || count <= 0 || count > 200) {
    return NextResponse.json({ error: "件数は1〜200の範囲で指定してください" }, { status: 400 });
  }
  if (!codePrefix) {
    return NextResponse.json({ error: "区画コードのプレフィックスは必須です" }, { status: 400 });
  }
  if (!Number.isFinite(priceYen) || priceYen <= 0) {
    return NextResponse.json({ error: "価格は必須です" }, { status: 400 });
  }

  try {
    const plots = await bulkCreateDraftPlots(id, count, codePrefix, priceYen);
    await logAdminAction(
      await getAdminActorName(),
      "castle_plots_bulk_create",
      `castle_id=${id} count=${plots.length}`
    );
    return NextResponse.json(plots);
  } catch (error) {
    const message = error instanceof Error ? error.message : "作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
