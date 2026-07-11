import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("metaverse_property_images").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
