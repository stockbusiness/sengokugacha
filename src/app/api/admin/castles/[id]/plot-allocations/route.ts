import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getPlotAllocationsForCastle } from "@/lib/castle-plots";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const allocations = await getPlotAllocationsForCastle(id);
  return NextResponse.json(allocations);
}
