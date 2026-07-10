import { getAcademyActivityCount } from "@/lib/user-activity";
import type { PassportData } from "@/lib/passport";

export type Badge = { id: string; label: string; icon: string; earned: boolean; description: string };

const LOGIN_STREAK_THRESHOLD = 7;
const WARLORD_COLLECTOR_THRESHOLD = 10;

// Ver2.3指示書6章のバッジ(表示のみ、報酬付与などは行わない)。
export async function getBadges(userId: string, passport: PassportData): Promise<Badge[]> {
  const academyCount = await getAcademyActivityCount(userId);

  return [
    {
      id: "login_streak",
      label: "連続ログイン",
      icon: "🏯",
      earned: passport.loginStreak >= LOGIN_STREAK_THRESHOLD,
      description: `${LOGIN_STREAK_THRESHOLD}日以上連続でログイン`,
    },
    {
      id: "academy",
      label: "AI寺子屋",
      icon: "📜",
      earned: academyCount > 0,
      description: "AI寺子屋を1回以上受講",
    },
    {
      id: "warlord_collector",
      label: "武将収集",
      icon: "🪖",
      earned: passport.warlordCount >= WARLORD_COLLECTOR_THRESHOLD,
      description: `武将を${WARLORD_COLLECTOR_THRESHOLD}体以上所持`,
    },
  ];
}
