import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("castle_lord_contracts")
    .select("*, castles:castle_id(name), desired_castle:desired_castle_id(name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// 管理画面からの手動申込登録(draft状態でのinsert)。将来ユーザー向け申込APIを追加した
// 場合も同じテーブルへ同じ形でinsertするだけでよい設計にしている。
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const applicantUserId = typeof body?.applicant_user_id === "string" ? body.applicant_user_id : null;
  if (!applicantUserId) {
    return NextResponse.json({ error: "applicant_user_id は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_lord_contracts")
    .insert({
      applicant_user_id: applicantUserId,
      agent_id: body?.agent_id || null,
      desired_castle_id: body?.desired_castle_id || null,
      applicant_type: body?.applicant_type === "corporate" ? "corporate" : "individual",
      company_name: body?.company_name || null,
      contact_name: body?.contact_name || null,
      contact_email: body?.contact_email || null,
      contact_phone: body?.contact_phone || null,
      business_plan_text: body?.business_plan_text || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "castle_lord_contract_create", `contract_id=${data.id}`);

  return NextResponse.json(data);
}
