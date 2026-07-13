import { NextResponse } from "next/server";
import { getAgentSession } from "@/lib/agent-session";
import { getPublicPlotById } from "@/lib/castle-plots";
import { getLineSettings } from "@/lib/line-settings";
import { generateReferralQrDataUrl } from "@/lib/referral-qr";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 要件書5章「代理店専用URL・QR発行」。LIFF URLに区画ページへのパスを付与することで、
// LINEアプリ内で当該区画の詳細ページへ直接遷移させる(LIFFのディープリンク機能。
// 既存の登録紹介URL(agency/page.tsxの`?ref=`)と同じくreferral_codeをクエリで渡す)。
export async function POST(_request: Request, { params }: { params: Promise<{ plotId: string }> }) {
  const session = await getAgentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plotId } = await params;
  const plot = await getPublicPlotById(plotId);
  if (!plot) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = createSupabaseServerClient();
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("referral_code")
    .eq("id", session.agentId)
    .maybeSingle();
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "代理店情報が見つかりません" }, { status: 404 });

  const lineSettings = await getLineSettings();
  if (!lineSettings?.liff_id) {
    return NextResponse.json({ error: "LIFF IDが未設定のため、紹介URLを発行できません" }, { status: 400 });
  }

  const url = `https://liff.line.me/${lineSettings.liff_id}/castles/${plot.castle_id}/plots/${plot.id}?ref=${agent.referral_code}`;
  const qrDataUrl = await generateReferralQrDataUrl(url);

  return NextResponse.json({ url, qrDataUrl });
}
