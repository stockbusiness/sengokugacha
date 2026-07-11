import { NextResponse } from "next/server";
import { getInquiriesForUser } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const inquiries = await getInquiriesForUser(session.userId);
  return NextResponse.json(inquiries);
}
