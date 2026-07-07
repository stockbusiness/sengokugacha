import { NextResponse } from "next/server";
import {
  drawPaidGacha,
  GachaLimitExceededError,
  InsufficientTicketsError,
  NoEligibleProvinceError,
} from "@/lib/gacha";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drawPaidGacha(session.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GachaLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof InsufficientTicketsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    if (error instanceof NoEligibleProvinceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("有料ガチャ抽選に失敗しました", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
