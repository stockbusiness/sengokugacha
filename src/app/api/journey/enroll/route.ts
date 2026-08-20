import { NextResponse } from "next/server";
import { enrollInActiveCourse, JourneyNotAvailableError } from "@/lib/learning-journey";
import { getSession } from "@/lib/session";

// コース登録。利用者が「はじめる」を押したときだけ作る(自動登録はしない)。
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const enrollmentId = await enrollInActiveCourse(session.userId);
    return NextResponse.json({ enrollmentId });
  } catch (error) {
    if (error instanceof JourneyNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("はじまりの旅のコース登録に失敗しました", error);
    return NextResponse.json({ error: "登録に失敗しました。" }, { status: 500 });
  }
}
