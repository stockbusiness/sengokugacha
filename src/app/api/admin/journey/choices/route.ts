import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const questionId = typeof body?.question_id === "string" ? body.question_id : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!questionId || !text) {
    return NextResponse.json({ error: "設問と選択肢の文言は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: question } = await supabase
    .from("learning_journey_questions")
    .select("learning_journey_content_versions(status)")
    .eq("id", questionId)
    .maybeSingle();
  const status = (question?.learning_journey_content_versions as unknown as { status: string } | null)?.status;
  if (status !== "draft") {
    return NextResponse.json({ error: "下書きのバージョンにのみ選択肢を追加できます。" }, { status: 400 });
  }

  const { count } = await supabase
    .from("learning_journey_choices")
    .select("id", { count: "exact", head: true })
    .eq("question_id", questionId);

  const { data, error } = await supabase
    .from("learning_journey_choices")
    .insert({
      question_id: questionId,
      body: text,
      is_correct: body.is_correct === true,
      display_order: (count ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
