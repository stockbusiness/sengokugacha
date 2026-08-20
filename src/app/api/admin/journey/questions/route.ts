import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const TYPES = ["quiz", "single", "multi", "free_text"];

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const versionId = typeof body?.content_version_id === "string" ? body.content_version_id : "";
  const questionType = typeof body?.question_type === "string" ? body.question_type : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!versionId || !TYPES.includes(questionType) || !text) {
    return NextResponse.json({ error: "バージョン・種別・設問文は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: version } = await supabase
    .from("learning_journey_content_versions")
    .select("status")
    .eq("id", versionId)
    .maybeSingle();
  if (version?.status !== "draft") {
    return NextResponse.json({ error: "下書きのバージョンにのみ設問を追加できます。" }, { status: 400 });
  }

  const { count } = await supabase
    .from("learning_journey_questions")
    .select("id", { count: "exact", head: true })
    .eq("content_version_id", versionId);

  const { data, error } = await supabase
    .from("learning_journey_questions")
    .insert({
      content_version_id: versionId,
      question_type: questionType,
      body: text,
      is_required: body.is_required !== false,
      display_order: (count ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
