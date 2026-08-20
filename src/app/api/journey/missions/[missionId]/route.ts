import { NextResponse } from "next/server";
import { getMissionDetail } from "@/lib/learning-journey";
import { getSession } from "@/lib/session";

// 教材と設問。正解は含めない(指示書§11)。落としているのは
// toPublicQuestion()(src/modules/learning-journey/domain/grading.ts)。
export async function GET(_request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { missionId } = await params;
  const detail = await getMissionDetail(session.userId, missionId);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(detail);
}
