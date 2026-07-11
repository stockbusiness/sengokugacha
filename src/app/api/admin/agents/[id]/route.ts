import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { pushAgentToExternal } from "@/lib/agents";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Phase1は代理店ランクの自動判定を行わない(02_additional_considerations 5章)ため、
// 管理画面から手動で更新できるのはランクのみとする。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const rank = body?.rank;

  if (!["アドバイザー", "ディレクター", "エージェント"].includes(rank)) {
    return NextResponse.json({ error: "invalid rank" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("agents").update({ rank, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 外部連携(双方向同期)は失敗しても本体の保存処理には影響させない。
  pushAgentToExternal(id).catch((err) => console.error("代理店データの外部送信に失敗しました", err));

  return NextResponse.json(data);
}
