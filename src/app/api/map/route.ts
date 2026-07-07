import { NextResponse } from "next/server";
import { getProvinceProgress } from "@/lib/provinces";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await getProvinceProgress(session.userId);
  return NextResponse.json(data);
}
