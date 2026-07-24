import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { SenNoKuniHubSettingsRepository, SenNoKuniHubSettingsRow } from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// SenNoKuniHubSettingsRepositoryのSupabase実装。既存のsrc/lib/sen-no-kuni-hub-auth.tsに
// 実装されていたクエリをそのまま移設したもの。
export class SupabaseSenNoKuniHubSettingsRepository implements SenNoKuniHubSettingsRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async findByKeyId(keyId: string): Promise<SenNoKuniHubSettingsRow | null> {
    const { data, error } = await this.supabase
      .from("sen_no_kuni_hub_settings")
      .select("system_key, hmac_secret, enabled, v1_disabled_at")
      .eq("key_id", keyId)
      .maybeSingle();
    if (error) throw error;
    return (data as SenNoKuniHubSettingsRow | null) ?? null;
  }

  async insertNonceIfUnused(keyId: string, nonce: string): Promise<boolean> {
    const { error } = await this.supabase.from("sen_no_kuni_hub_used_nonces").insert({ key_id: keyId, nonce });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  }

  // v1利用ログ(§7.3「v1利用ログを記録」)。v1停止時期の判断材料とするための記録であり、
  // 認証結果そのものには影響しないためベストエフォートで行う(失敗してもリクエストは通す)。
  // record_sen_no_kuni_hub_v1_usage()は単一UPDATE文で完結するためread-modify-write競合は無い。
  async recordV1Usage(keyId: string): Promise<void> {
    const { error } = await this.supabase.rpc("record_sen_no_kuni_hub_v1_usage", { p_key_id: keyId });
    if (error) console.error("[sen-no-kuni-hub-auth] v1利用ログの記録に失敗しました", error);
  }
}
