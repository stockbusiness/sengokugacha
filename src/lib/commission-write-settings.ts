import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEFAULT_COMMISSION_WRITE_SETTINGS,
  decideCommissionWrite,
  resolveEffectiveCommissionWriteSettings,
  type CommissionWriteDecision,
  type CommissionWriteSettings,
  type CommissionWriteTarget,
} from "@/modules/castle/domain/commission-write-policy";

// Passport実装指示書 PR-P1a / PR-P1b。旧コミッション機能の書込み停止フラグ。
//
// シングルトン設定(payment_settings / castle_lord_plan_settings と同じ運用: 1行のみ、
// 無ければ既定値)。既定は「両方停止」なので、マイグレーションを適用しただけで停止が効く。
//
// さらにコード側のゲート(COMMISSION_WRITE_REOPEN_ALLOWED)を掛け合わせるため、DBの
// 設定行だけでは再開できない。再開には「定数をtrueにする変更のマージ」と「設定行の
// insert」の2つが揃う必要がある(PR-P1b 追加条件4)。

// DBに保存されている生の値。管理画面の表示用に、実効値と分けて取れるようにしておく。
export async function getStoredCommissionWriteSettings(): Promise<CommissionWriteSettings> {
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

// 実際に効く設定。判定・画面表示ともこちらを使う。
export async function getCommissionWriteSettings(): Promise<CommissionWriteSettings> {
  return resolveEffectiveCommissionWriteSettings(await getStoredCommissionWriteSettings());
}

// 各書込み入口はこれを最初に通す。
export async function decideCommissionWriteFromSettings(
  target: CommissionWriteTarget
): Promise<CommissionWriteDecision> {
  return decideCommissionWrite(target, await getCommissionWriteSettings());
}

// PR-P1b 追加条件4「停止中に報酬計上処理が呼ばれた場合は監査ログを残す」。
//
// 監視のため、件数を数えられる形で残す(action固定・detailsに文脈)。停止中に呼ばれること
// 自体は異常ではない(土地が売れれば毎回通る)が、件数が想定外に増えていれば、止めたはずの
// 経路がまだ動いていることに気付ける。監査ログへの記録自体が失敗しても、呼び出し元の
// 処理は止めない(記録は目的ではなく観測手段)。
export const COMMISSION_WRITE_BLOCKED_ACTION = "commission_write_blocked";

export async function recordCommissionWriteBlocked(
  target: CommissionWriteTarget,
  context: string
): Promise<void> {
  try {
    await logAdminAction(null, COMMISSION_WRITE_BLOCKED_ACTION, `target=${target} ${context}`);
  } catch (error) {
    console.error("報酬計上の停止記録に失敗しました", { target, context, error });
  }
}
