import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEFAULT_SALES_FACT_OUTBOX_SETTINGS,
  resolveEffectiveSalesFactOutboxSettings,
  type SalesFactOutboxSettings,
} from "@/modules/castle/domain/sales-fact-outbox-policy";

// Passport実装指示書 PR-P1c。販売事実Outboxの生成・配送フラグ。
//
// シングルトン設定(payment_settings / commission_write_settings と同じ運用: 1行のみ、
// 無ければ既定値)。既定は生成も配送もOFFなので、マイグレーションを適用しただけでは
// 何も起きない。
//
// 配送についてはコード側のゲートも掛け合わせるため、DBの設定行だけではAgencyへ
// イベントが飛び始めない。

export async function getStoredSalesFactOutboxSettings(): Promise<SalesFactOutboxSettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales_fact_outbox_settings")
    .select("generation_enabled, delivery_enabled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_SALES_FACT_OUTBOX_SETTINGS;

  return {
    generationEnabled: data.generation_enabled,
    deliveryEnabled: data.delivery_enabled,
  };
}

// 実際に効く設定。
export async function getSalesFactOutboxSettings(): Promise<SalesFactOutboxSettings> {
  return resolveEffectiveSalesFactOutboxSettings(await getStoredSalesFactOutboxSettings());
}
