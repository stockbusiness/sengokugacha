import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { LEGAL_PAGE_SLUGS } from "@/lib/legal-pages";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  if (!(LEGAL_PAGE_SLUGS as string[]).includes(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const title = body?.title;
  const pageBody = body?.body;
  if (typeof title !== "string" || typeof pageBody !== "string") {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("legal_pages")
    .upsert(
      { slug, title, body: pageBody, updated_at: new Date().toISOString() },
      { onConflict: "slug" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
