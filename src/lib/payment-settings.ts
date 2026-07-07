import { createSupabaseServerClient } from "@/lib/supabase-server";

export type PaymentSettings = {
  id: string;
  stripe_publishable_key: string | null;
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  kokudaka_pack_amount_yen: number;
  kokudaka_pack_kokudaka: number;
  gacha_ticket_pack_amount_yen: number;
  gacha_ticket_pack_tickets: number;
};

// payment_settings は1行運用。行が無い場合はStripe未設定として扱う。
export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function isStripeConfigured(settings: PaymentSettings | null): settings is PaymentSettings & {
  stripe_secret_key: string;
  stripe_publishable_key: string;
} {
  return !!settings?.stripe_secret_key && !!settings?.stripe_publishable_key;
}
