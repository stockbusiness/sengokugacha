import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { testOutboundConnection } from "@/lib/agents";

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await testOutboundConnection();
  return NextResponse.json(result);
}
