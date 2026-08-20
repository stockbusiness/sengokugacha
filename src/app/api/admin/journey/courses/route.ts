import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import { listCourses } from "@/lib/learning-journey-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await listCourses());
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!code || !title) {
    return NextResponse.json({ error: "コードとタイトルは必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_courses")
    .insert({ code, title, description: body.description || null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAdminAction(await getAdminActorName(), "learning_journey_course_create", `code=${code}`,
    { targetType: "learning_journey_course", targetId: data.id, after: { code, title } },
    { adminRole: await getAdminRole() });

  return NextResponse.json({ id: data.id });
}
