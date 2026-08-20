import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import { listMissions } from "@/lib/learning-journey-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId は必須です" }, { status: 400 });
  return NextResponse.json(await listMissions(courseId));
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const courseId = typeof body?.course_id === "string" ? body.course_id : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!courseId || !code || !title) {
    return NextResponse.json({ error: "コースID・コード・タイトルは必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from("learning_journey_missions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);

  const { data, error } = await supabase
    .from("learning_journey_missions")
    .insert({ course_id: courseId, code, title, display_order: (count ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAdminAction(await getAdminActorName(), "learning_journey_mission_create", `course_id=${courseId} code=${code}`,
    { targetType: "learning_journey_mission", targetId: data.id, after: { code, title } },
    { adminRole: await getAdminRole() });

  return NextResponse.json({ id: data.id });
}
