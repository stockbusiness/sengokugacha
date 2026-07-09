import { NextResponse } from "next/server";
import { getBadges } from "@/lib/badges";
import { getPassportData } from "@/lib/passport";
import { getSession } from "@/lib/session";
import { getContributionSummary, getRecentActivity } from "@/lib/user-activity";

// Ver2.3: 国家貢献ポイント・国家活動履歴・バッジをまとめて返す
// (ホームの国家ダッシュボードから1回のリクエストで取得するため)。
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const passport = await getPassportData(session.userId);
  if (!passport) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [contribution, activity, badges] = await Promise.all([
    getContributionSummary(session.userId),
    getRecentActivity(session.userId),
    getBadges(session.userId, passport),
  ]);

  return NextResponse.json({ contribution, activity, badges });
}
