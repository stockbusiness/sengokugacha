import { NextRequest, NextResponse } from "next/server";
import { createInquiry } from "@/lib/metaverse";
import { getSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: userRow } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", session.userId)
    .maybeSingle();

  try {
    const id = await createInquiry({
      userId: session.userId,
      agentId: userRow?.referring_agent_id ?? null,
      propertyId: typeof body.propertyId === "string" ? body.propertyId : null,
      inquiryType: body.inquiryType,
      preferredContact: body.preferredContact,
      consentPersonalInfo: !!body.consentPersonalInfo,
      consentAgentShare: !!body.consentAgentShare,
      preferredDatetime: typeof body.preferredDatetime === "string" ? body.preferredDatetime : null,
      budget: typeof body.budget === "string" ? body.budget : null,
      purpose: typeof body.purpose === "string" ? body.purpose : null,
      memo: typeof body.memo === "string" ? body.memo : null,
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "送信に失敗しました。" },
      { status: 400 }
    );
  }
}
