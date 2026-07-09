import { NextRequest, NextResponse } from "next/server";
import { getRanking, type RankingType } from "@/lib/rankings";
import { getSession } from "@/lib/session";

const VALID_TYPES: RankingType[] = ["contribution", "warlord_collection", "province_conquest", "academy"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const typeParam = request.nextUrl.searchParams.get("type") ?? "contribution";
  if (!VALID_TYPES.includes(typeParam as RankingType)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const ranking = await getRanking(typeParam as RankingType);
  return NextResponse.json(ranking);
}
