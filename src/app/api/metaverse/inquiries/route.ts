import { NextRequest, NextResponse } from "next/server";
import { resolveAgentIdByReferralCode } from "@/lib/agents";
import { getPublicPlotById } from "@/lib/castle-plots";
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

  // 相談対象の区画は、公開されている区画(下書きでない)であることを確認してから受け付ける。
  // 存在しないIDをそのまま保存すると、管理画面で「どの区画の相談か分からない行」が残るため。
  const castlePlotId = typeof body.castlePlotId === "string" ? body.castlePlotId : null;
  if (castlePlotId) {
    const plot = await getPublicPlotById(castlePlotId);
    if (!plot) {
      return NextResponse.json({ error: "指定された区画が見つかりません。" }, { status: 400 });
    }
  }

  const supabase = createSupabaseServerClient();
  const { data: userRow } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", session.userId)
    .maybeSingle();

  // 相談の担当は「その区画を紹介した代理店」を最優先にする。
  //
  // 代理店は /agency/plots で区画ごとに紹介URL・QR(?ref=代理店コード)を発行して
  // 商談に使う。そのURLから来た相談は、登録時の紹介元(users.referring_agent_id)が
  // 誰であれ、実際にその区画を紹介した代理店が受けるべきなので、refを先に見る。
  // 予約(reservePlot)が selling_agent_id を決めるときと同じ考え方。
  //
  // refが無い・コードが一致しない場合のみ登録時の紹介元へ、それも無ければ
  // 未割り当てのままにして本部が管理画面で割り振る。
  const referralCode = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim() : null;
  const referringAgentId = await resolveAgentIdByReferralCode(referralCode);

  try {
    const id = await createInquiry({
      userId: session.userId,
      agentId: referringAgentId ?? userRow?.referring_agent_id ?? null,
      propertyId: typeof body.propertyId === "string" ? body.propertyId : null,
      castlePlotId,
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
