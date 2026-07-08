import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 退会処理。ゲームプレイデータ(所持武将・制圧状況・ガチャ履歴・ログイン履歴・実績)は削除する。
// 一方、purchases/agent_salesは会計記録として保持する必要があるため削除せず、
// users行はLINEユーザーIDと表示名のみ匿名化する(以降、同じLINEアカウントで再度利用開始すると
// 新規ユーザーとして登録され直す)。プライバシーポリシー記載の開示・訂正・削除等の請求に対応する。
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const userId = session.userId;

  const deletions = await Promise.all([
    supabase.from("user_warlords").delete().eq("user_id", userId),
    supabase.from("user_provinces").delete().eq("user_id", userId),
    supabase.from("gacha_logs").delete().eq("user_id", userId),
    supabase.from("login_logs").delete().eq("user_id", userId),
    supabase.from("achievements").delete().eq("user_id", userId),
  ]);
  const deletionError = deletions.find((r) => r.error)?.error;
  if (deletionError) {
    return NextResponse.json({ error: deletionError.message }, { status: 500 });
  }

  const { error: anonymizeError } = await supabase
    .from("users")
    .update({ line_user_id: `deleted-${randomUUID()}`, display_name: null })
    .eq("id", userId);
  if (anonymizeError) {
    return NextResponse.json({ error: anonymizeError.message }, { status: 500 });
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
