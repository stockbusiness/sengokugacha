import { createSupabaseServerClient } from "@/lib/supabase-server";

// 「はじまりの旅」の機能フラグと運用パラメータ(指示書§17)。
//
// ADR-9: このリポジトリに汎用の機能フラグ基盤は無く、設定は「ドメインごとの設定テーブル
// + 管理画面」で統一されている。環境変数を新設せず、その作法に合わせる
// (指示書§17「既存の設定管理方式がある場合はそれに統合し、環境変数名を重複作成しない」)。

export type LearningJourneySettings = {
  id: string | null;
  // LEARNING_MISSIONS_ENABLED: 機能全体。OFFなら入口ごと出さない。
  missions_enabled: boolean;
  // MISSION_REWARDS_ENABLED: 新規のOVE付与要求の送信。
  rewards_enabled: boolean;
  // MISSION_CONSULTATION_SYNC_ENABLED: 相談希望の代理店連携(PR6)。
  consultation_sync_enabled: boolean;
  // MISSION_LINE_NOTIFICATIONS_ENABLED: LINE通知(PR6)。
  line_notifications_enabled: boolean;

  course_reward_cap: number;
  period_reward_cap: number;
  per_request_reward_cap: number;

  stale_reward_minutes: number;
  resume_window_days: number;
  reward_window_days: number;
};

// 行が無い場合の既定値。マイグレーションを適用しただけでは何も起きないよう、
// 全フラグをOFF、付与総量上限を0にしてある(0は「上限なし」ではなく「1円も付与しない」)。
const DEFAULT_SETTINGS: LearningJourneySettings = {
  id: null,
  missions_enabled: false,
  rewards_enabled: false,
  consultation_sync_enabled: false,
  line_notifications_enabled: false,
  course_reward_cap: 0,
  period_reward_cap: 0,
  per_request_reward_cap: 10_000,
  stale_reward_minutes: 60,
  resume_window_days: 30,
  reward_window_days: 30,
};

// シングルトン設定(payment_settings / line_settings と同じ運用: 1行のみ、無ければ既定値)。
export async function getLearningJourneySettings(): Promise<LearningJourneySettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;

  return {
    id: data.id,
    missions_enabled: data.missions_enabled,
    rewards_enabled: data.rewards_enabled,
    consultation_sync_enabled: data.consultation_sync_enabled,
    line_notifications_enabled: data.line_notifications_enabled,
    course_reward_cap: data.course_reward_cap,
    period_reward_cap: data.period_reward_cap,
    per_request_reward_cap: data.per_request_reward_cap,
    stale_reward_minutes: data.stale_reward_minutes,
    resume_window_days: data.resume_window_days,
    reward_window_days: data.reward_window_days,
  };
}

export type LearningJourneySettingsUpdate = Partial<Omit<LearningJourneySettings, "id">>;

// 更新は manager ロール限定・監査ログ必須(指示書§11)。権限確認と監査ログの記録は
// 呼び出し側(APIルート)の責務とし、ここではDBへの書き込みだけを行う。
export async function updateLearningJourneySettings(
  update: LearningJourneySettingsUpdate
): Promise<LearningJourneySettings> {
  const supabase = createSupabaseServerClient();
  const current = await getLearningJourneySettings();
  const nowIso = new Date().toISOString();

  if (current.id) {
    const { data, error } = await supabase
      .from("learning_journey_settings")
      .update({ ...update, updated_at: nowIso })
      .eq("id", current.id)
      .select("*")
      .single();
    if (error) throw error;
    return { ...current, ...update, id: data.id };
  }

  const { data, error } = await supabase
    .from("learning_journey_settings")
    .insert({ ...DEFAULT_SETTINGS, ...update, id: undefined, updated_at: nowIso })
    .select("*")
    .single();
  if (error) throw error;
  return { ...DEFAULT_SETTINGS, ...update, id: data.id };
}
