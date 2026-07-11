import { NextRequest, NextResponse } from "next/server";
import { AgencySsoError, verifyAgencySsoToken } from "@/lib/agency-sso";
import { setAgentSessionCookie } from "@/lib/agent-session";

// 代理店システムSSO連携仕様書 5・11章に準拠。トークン検証後は即座に通常セッションを作り、
// URL上のtokenが残らないURL(/agency)へリダイレクトする。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/agency/login?error=sso_expired", request.url));
  }

  try {
    const agent = await verifyAgencySsoToken(token);
    await setAgentSessionCookie(agent.id, agent.external_id, agent.name);
    const res = NextResponse.redirect(new URL("/agency", request.url));
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  } catch (error) {
    const code = error instanceof AgencySsoError ? error.code : "sso_expired";
    return NextResponse.redirect(new URL(`/agency/login?error=${code}`, request.url));
  }
}
