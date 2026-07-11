import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const note = body?.note;
  if (typeof note !== "string" || note.length === 0) {
    return NextResponse.json({ error: "note は必須です" }, { status: 400 });
  }

  const actorName = await getAdminActorName();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_inquiry_histories")
    .insert({ inquiry_id: id, note: actorName ? `[${actorName}] ${note}` : note })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
