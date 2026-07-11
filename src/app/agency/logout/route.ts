import { NextRequest, NextResponse } from "next/server";
import { clearAgentSessionCookie } from "@/lib/agent-session";

export async function POST(request: NextRequest) {
  await clearAgentSessionCookie();
  return NextResponse.redirect(new URL("/agency/login", request.url));
}
