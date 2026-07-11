import { NextRequest, NextResponse } from "next/server";
import { createTourSession } from "@/lib/metaverse";
import { getSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  const body = await request.json().catch(() => ({}));
  const returnUrl = typeof body?.returnUrl === "string" ? body.returnUrl : null;

  const supabase = createSupabaseServerClient();
  const [{ data: userRow }, { data: propertyRow }] = await Promise.all([
    supabase.from("users").select("referring_agent_id").eq("id", session.userId).maybeSingle(),
    supabase.from("metaverse_properties").select("property_code").eq("id", propertyId).maybeSingle(),
  ]);

  if (!propertyRow) {
    return NextResponse.json({ error: "対象の物件が見つかりません。" }, { status: 404 });
  }

  try {
    const result = await createTourSession(session.userId, propertyId, userRow?.referring_agent_id ?? null, returnUrl);
    return NextResponse.json({
      success: true,
      data: {
        tourUrl: `/tour/property/${propertyRow.property_code}?token=${result.rawToken}`,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "内覧セッションの発行に失敗しました。" },
      { status: 400 }
    );
  }
}
