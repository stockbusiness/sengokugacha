import { NextResponse } from "next/server";
import { getCastleUnlockStatus } from "@/lib/castle-unlock";
import { getCastleById, getOfficialLordPartner } from "@/lib/castles";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const castle = await getCastleById(id);
  if (!castle || (castle.status !== "recruiting" && castle.status !== "published")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const unlocked = await getCastleUnlockStatus(session.userId, id);
  if (!unlocked) {
    // 実装指示書v1.0 6-6: 未解放の城は歴史解説・城主情報等の詳細を公開しない。
    return NextResponse.json({
      id: castle.id,
      name: castle.name,
      prefecture: castle.prefecture,
      region: castle.region,
      unlocked: false,
    });
  }

  const officialLordPartner = await getOfficialLordPartner(id);

  return NextResponse.json({ ...castle, unlocked: true, officialLordPartner });
}
