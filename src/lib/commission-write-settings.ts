import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEFAULT_COMMISSION_WRITE_SETTINGS,
  decideCommissionWrite,
  type CommissionWriteDecision,
  type CommissionWriteSettings,
  type CommissionWriteTarget,
} from "@/modules/castle/domain/commission-write-policy";

// Passport実装指示書 PR-P1a。旧コミッション機能の書込み停止フラグ。
//
// シングルトン設定(payment_settings / castle_lord_plan_settings と同じ運用: 1行のみ、
// 無ければ既定値)。既定は「両方停止」なので、マイグレーションを適用しただけで停止が効く。

export async function getCommissionWriteSettings(): Promise<CommissionWriteSettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_write_settings")
    .select("land_sale_commission_write_enabled, commission_rule_set_write_enabled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_COMMISSION_WRITE_SETTINGS;

  return {
    landSaleCommissionWriteEnabled: data.land_sale_commission_write_enabled,
    commissionRuleSetWriteEnabled: data.commission_rule_set_write_enabled,
  };
}

// 各書込み入口はこれを最初に通す。
export async function decideCommissionWriteFromSettings(
  target: CommissionWriteTarget
): Promise<CommissionWriteDecision> {
  return decideCommissionWrite(target, await getCommissionWriteSettings());
}
