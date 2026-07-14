import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { listConquestRules } from "@/lib/conquest-rules";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const rules = await listConquestRules();
    return NextResponse.json(rules);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
