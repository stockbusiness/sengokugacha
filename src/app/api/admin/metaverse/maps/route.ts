import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("metaverse_maps").select("*").order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = body?.name;
  if (typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  // マップ画像未アップロードの状態でも一覧に作れるよう、image_urlは空文字で仮登録する
  // (画像アップロードAPIで後から更新する。列自体はnot null制約のため空文字にする)。
  const { data, error } = await supabase.from("metaverse_maps").insert({ name, image_url: "" }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_map_create", `name=${name}`);
  return NextResponse.json(data);
}
