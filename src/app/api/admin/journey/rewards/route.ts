import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { listRewardRequests } from "@/lib/learning-journey-admin";

// 付与要求の一覧と、付与総量の使用状況・上限到達状況(指示書§4.2)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await listRewardRequests());
}
