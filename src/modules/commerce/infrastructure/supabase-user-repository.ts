import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { UserRepository } from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export class SupabaseUserRepository implements UserRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async findReferralSessionKey(userId: string): Promise<string | null> {
    // 移設元(src/lib/purchase-grants.ts旧confirmReferralForPurchase())は取得エラー時も
    // 「紹介経由ではない」ケースと同様にnullを返す(例外を投げない)実装だったため、
    // 挙動を変えないよう本メソッドでもエラーを握りつぶす。
    const { data, error } = await this.supabase.from("users").select("referral_session_key").eq("id", userId).maybeSingle();
    if (error || !data?.referral_session_key) return null;
    return data.referral_session_key as string;
  }
}
