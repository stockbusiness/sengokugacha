import { NextRequest, NextResponse } from "next/server";
import { getProvinceRequiredWarlords } from "@/lib/provinces";
import { getSession } from "@/lib/session";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await getProvinceRequiredWarlords(session.userId, id);
  return NextResponse.json(data);
}
