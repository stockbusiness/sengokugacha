import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 下書きの設問の削除。公開済みバージョンの設問は消させない(過去の回答が辿れなくなるため)。
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { data: question } = await supabase
    .from("learning_journey_questions")
    .select("content_version_id, learning_journey_content_versions(status)")
    .eq("id", id)
    .maybeSingle();

  const status = (question?.learning_journey_content_versions as unknown as { status: string } | null)?.status;
  if (status !== "draft") {
    return NextResponse.json({ error: "下書きのバージョンの設問だけを削除できます。" }, { status: 400 });
  }

  const { error } = await supabase.from("learning_journey_questions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
