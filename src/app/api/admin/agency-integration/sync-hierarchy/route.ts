import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { syncHierarchyFromAgency } from "@/lib/agents";

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncHierarchyFromAgency();
    await logAdminAction(await getAdminActorName(), "agency_hierarchy_sync", `synced=${result.synced}`);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "同期に失敗しました" }, { status: 500 });
  }
}
