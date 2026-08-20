import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import { JourneyAdminRejectedError, publishVersion } from "@/lib/learning-journey-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 下書きの編集。公開済みはDBのトリガーが本文の書き換えを拒否する(ADR-3)。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (body.publish === true) {
    try {
      await publishVersion(id);
      await logAdminAction(await getAdminActorName(), "learning_journey_content_version_publish", `version_id=${id}`,
        { targetType: "learning_journey_content_version", targetId: id },
        { adminRole: await getAdminRole() });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof JourneyAdminRejectedError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error("教材バージョンの公開に失敗しました", error);
      return NextResponse.json({ error: "公開に失敗しました。" }, { status: 500 });
    }
  }

  const fields: Record<string, unknown> = {};
  for (const key of ["body_text", "video_url", "image_url", "video_alt_text"]) {
    if (key in body) fields[key] = body[key] || null;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "変更する項目がありません" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_content_versions")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    // 公開済みの書き換えはDBトリガーが拒否する。利用者に分かる文言へ変換する。
    if (error.message?.includes("published_immutable")) {
      return NextResponse.json(
        { error: "公開済みの教材は書き換えられません。新しい下書きを作成してください。" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
