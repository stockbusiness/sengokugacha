import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("label" in body) {
    fields.label = body.label;
  }

  if ("url" in body) {
    const url = body.url;
    if (url === null || url === "") {
      fields.url = null;
    } else if (typeof url === "string" && isSafeHttpUrl(url)) {
      fields.url = url;
    } else {
      return NextResponse.json({ error: "urlはhttp(s)形式で入力してください" }, { status: 400 });
    }
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("external_links").update(fields).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
