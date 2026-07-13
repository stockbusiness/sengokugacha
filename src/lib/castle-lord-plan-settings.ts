import { createSupabaseServerClient } from "@/lib/supabase-server";

export type CastleLordPlanSettings = {
  id: string | null;
  plan_price_yen: number;
  min_agent_rank_for_lord: string;
  min_agent_rank_for_commission: string;
  retroactive_payout_enabled: boolean;
  contract_term_months: number;
  initial_plot_capacity: number;
  stage2_plot_capacity: number;
  stage3_plot_capacity: number;
  land_plot_standard_price_yen: number;
  reservation_expiry_minutes: number;
  commission_confirmation_grace_days: number;
};

const DEFAULT_SETTINGS: CastleLordPlanSettings = {
  id: null,
  plan_price_yen: 1_000_000,
  min_agent_rank_for_lord: "アドバイザー",
  min_agent_rank_for_commission: "アドバイザー",
  retroactive_payout_enabled: false,
  contract_term_months: 12,
  initial_plot_capacity: 30,
  stage2_plot_capacity: 60,
  stage3_plot_capacity: 100,
  land_plot_standard_price_yen: 300_000,
  reservation_expiry_minutes: 1440,
  commission_confirmation_grace_days: 8,
};

// シングルトン設定(payment_settings/line_settingsと同じ運用: 1行のみ、無ければデフォルト値)。
export async function getCastleLordPlanSettings(): Promise<CastleLordPlanSettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_lord_plan_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;

  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof CastleLordPlanSettings)[]) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== null && value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
