import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { count } = await supabase
    .from("metaverse_properties")
    .select("id", { count: "exact", head: true })
    .eq("building_type_id", id);
  if (count && count > 0) {
    return NextResponse.json({ error: "この建物タイプを使用している物件が存在するため削除できません" }, { status: 400 });
  }

  const { error } = await supabase.from("metaverse_building_types").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
