import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { AiTextGenerationError, generateSkillName } from "@/lib/ai-text";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // persist=trueの場合のみDBに保存する(一括生成用)。既定は画像生成と同じくプレビューのみで、
  // 実際の保存は管理画面の「保存」ボタンを押すまで行わない。
  const body = await request.json().catch(() => null);
  const persist = (body as { persist?: unknown } | null)?.persist === true;

  const supabase = createSupabaseServerClient();

  const { data: warlord, error: fetchError } = await supabase
    .from("warlords")
    .select("rarity, lore, provinces(name)")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!warlord) return NextResponse.json({ error: "武将が見つかりません" }, { status: 404 });

  const province = warlord.provinces as unknown as { name: string } | { name: string }[] | null;
  const provinceName = Array.isArray(province) ? (province[0]?.name ?? "") : (province?.name ?? "");

  let skillName: string;
  try {
    skillName = await generateSkillName({ provinceName, rarity: warlord.rarity, loreExcerpt: warlord.lore });
  } catch (error) {
    if (error instanceof AiTextGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("スキル名の生成に失敗しました", error);
    return NextResponse.json({ error: "スキル名の生成に失敗しました。" }, { status: 500 });
  }

  if (!persist) {
    return NextResponse.json({ skill_name: skillName, persisted: false });
  }

  const { data, error: updateError } = await supabase
    .from("warlords")
    .update({ skill_name: skillName })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "warlord_skill_name_generate", `warlord_id=${id}`);

  return NextResponse.json({ ...data, persisted: true });
}
