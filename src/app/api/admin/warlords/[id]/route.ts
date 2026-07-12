import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// province_id / slot_type はガチャ抽選ロジックが「1国3体(common/mid/rare)」を前提にしているため、
// 管理画面からの変更は対象外とする(組み替えが必要な場合はSQLで慎重に行う)。
const EDITABLE_FIELDS = [
  "name",
  "rarity",
  "lore",
  "skill_name",
  "stats_json",
  "image_url",
  "gacha_reveal_animation_url",
  "tenka_toitsu_image_url",
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

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("warlords").update(fields).eq("id", id).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
