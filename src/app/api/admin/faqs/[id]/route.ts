import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_FIELDS = ["question", "answer", "display_order"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) fields[key] = body[key];
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("faqs").update(fields).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "faq_update", `id=${id}`);

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("faqs").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "faq_delete", `id=${id}`);

  return NextResponse.json({ ok: true });
}
