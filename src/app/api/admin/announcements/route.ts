import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("published_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = body?.title;
  const bodyText = body?.body;
  const publishedAt = body?.published_at ?? new Date().toISOString();

  if (typeof title !== "string" || !title.trim() || typeof bodyText !== "string" || !bodyText.trim()) {
    return NextResponse.json({ error: "title, body は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ title, body: bodyText, published_at: publishedAt })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "announcement_create", `title=${title}`);

  return NextResponse.json(data);
}
