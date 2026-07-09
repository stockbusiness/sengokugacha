import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Ver2.1: 創設メンバー/建国メンバーのフラグ・付随情報のみ管理画面から編集可能にする。
// その他のユーザー項目(石高・戦功等)はゲーム内処理でのみ変動させるため、ここでは扱わない。
const EDITABLE_FIELDS = [
  "is_founding_member",
  "founding_member_number",
  "development_plot_id",
  "development_area",
  "is_nation_builder",
  "nation_builder_plan",
] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) fields[key] = body[key];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("users").update(fields).eq("id", id).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "user_member_status_update", `id=${id}`);

  return NextResponse.json(data);
}
