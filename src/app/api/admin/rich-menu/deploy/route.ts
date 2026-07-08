import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { getLineSettings } from "@/lib/line-settings";
import { deployRichMenu } from "@/lib/rich-menu";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getLineSettings();
  if (!settings?.messaging_channel_access_token) {
    return NextResponse.json({ error: "Messaging APIのチャネルアクセストークンが未設定です" }, { status: 400 });
  }

  try {
    const baseUrl = request.nextUrl.origin;
    const richMenuId = await deployRichMenu(
      settings.messaging_channel_access_token,
      baseUrl,
      settings.rich_menu_id
    );

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("line_settings")
      .update({ rich_menu_id: richMenuId, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) throw error;

    await logAdminAction(await getAdminActorName(), "rich_menu_deploy", `richMenuId=${richMenuId}`);

    return NextResponse.json({ ok: true, richMenuId });
  } catch (error) {
    console.error("リッチメニューのデプロイに失敗しました", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "デプロイに失敗しました" },
      { status: 500 }
    );
  }
}
