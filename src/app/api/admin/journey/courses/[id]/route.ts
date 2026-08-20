import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const STATUSES = ["draft", "published", "suspended"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) fields.title = body.title.trim();
  if ("description" in body) fields.description = body.description || null;
  if ("starts_at" in body) fields.starts_at = body.starts_at || null;
  if ("ends_at" in body) fields.ends_at = body.ends_at || null;
  if (Number.isInteger(body.display_order)) fields.display_order = body.display_order;

  // 公開停止(suspended)は緊急停止に相当するため本部管理者のみ。
  if (typeof body.status === "string" && STATUSES.includes(body.status)) {
    if (body.status === "suspended" && !(await requireManagerRole())) {
      return NextResponse.json({ error: "公開停止は本部管理者のみ実行できます" }, { status: 403 });
    }
    fields.status = body.status;
  }

  const supabase = createSupabaseServerClient();
  const { data: before } = await supabase.from("learning_journey_courses").select("*").eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("learning_journey_courses")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAdminAction(await getAdminActorName(), "learning_journey_course_update", `course_id=${id}`,
    { targetType: "learning_journey_course", targetId: id, before, after: data },
    { adminRole: await getAdminRole(), operationReason: typeof body.reason === "string" ? body.reason : null });

  return NextResponse.json(data);
}
