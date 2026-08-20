import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function assertDraft(choiceId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("learning_journey_choices")
    .select("learning_journey_questions(learning_journey_content_versions(status))")
    .eq("id", choiceId)
    .maybeSingle();
  const question = data?.learning_journey_questions as unknown as
    | { learning_journey_content_versions: { status: string } | null }
    | null;
  return question?.learning_journey_content_versions?.status === "draft";
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await assertDraft(id))) {
    return NextResponse.json({ error: "下書きのバージョンの選択肢だけを変更できます。" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const fields: Record<string, unknown> = {};
  if (typeof body?.body === "string" && body.body.trim()) fields.body = body.body.trim();
  if (typeof body?.is_correct === "boolean") fields.is_correct = body.is_correct;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "変更する項目がありません" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_choices")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await assertDraft(id))) {
    return NextResponse.json({ error: "下書きのバージョンの選択肢だけを削除できます。" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("learning_journey_choices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
