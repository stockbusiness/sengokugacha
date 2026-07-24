import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  CreateEntitlementInput,
  EntitlementRepository,
  EntitlementRow,
  PendingRevocation,
  ProcessEntitlementGrantResult,
  ProcessEntitlementRevocationResult,
  UpdateEntitlementMetadataInput,
} from "@/modules/entitlements/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

const ENTITLEMENT_ROW_SELECT = "id";

// EntitlementRepositoryのSupabase実装。application層(grant-entitlement.ts等)から
// 呼ばれるDB操作を、既存のsrc/lib/entitlements.tsに実装されていたものと完全に同じ
// クエリ・RPC呼び出しのまま、インターフェースの背後へ移設したもの。
export class SupabaseEntitlementRepository implements EntitlementRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async findBySourceAndEntitlementId(sourceSystemKey: string, entitlementId: string): Promise<EntitlementRow | null> {
    const { data, error } = await this.supabase
      .from("entitlements")
      .select(ENTITLEMENT_ROW_SELECT)
      .eq("source_system_key", sourceSystemKey)
      .eq("entitlement_id", entitlementId)
      .maybeSingle();
    if (error) throw error;
    return (data as EntitlementRow | null) ?? null;
  }

  async resolveLocalUserId(commonUserId: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("users").select("id").eq("common_user_id", commonUserId).maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  }

  async createOrGetExisting(input: CreateEntitlementInput): Promise<EntitlementRow> {
    const { data: inserted, error: insertError } = await this.supabase
      .from("entitlements")
      .insert({
        entitlement_id: input.entitlementId,
        common_user_id: input.commonUserId,
        user_id: input.userId,
        entitlement_type: input.entitlementType,
        product_code: input.productCode,
        status: "granted",
        quantity: input.quantity,
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        order_id: input.orderId,
        order_item_id: input.orderItemId,
        source_system_key: input.sourceSystemKey,
        metadata: input.metadata,
      })
      .select(ENTITLEMENT_ROW_SELECT)
      .single();
    if (!insertError) return inserted as EntitlementRow;

    if (insertError.code !== "23505") throw insertError;
    // 並行実行との競合。相手が既に作成済みのため取得し直す。
    const { data: raced, error: racedError } = await this.supabase
      .from("entitlements")
      .select(ENTITLEMENT_ROW_SELECT)
      .eq("source_system_key", input.sourceSystemKey)
      .eq("entitlement_id", input.entitlementId)
      .single();
    if (racedError) throw racedError;
    return raced as EntitlementRow;
  }

  async updateMetadata(sourceSystemKey: string, entitlementId: string, fields: UpdateEntitlementMetadataInput): Promise<void> {
    const { error } = await this.supabase
      .from("entitlements")
      .update({
        valid_from: fields.validFrom,
        valid_until: fields.validUntil,
        metadata: fields.metadata,
      })
      .eq("source_system_key", sourceSystemKey)
      .eq("entitlement_id", entitlementId);
    if (error) throw error;
  }

  async processGrant(entitlementRowId: string): Promise<ProcessEntitlementGrantResult> {
    const { data, error } = await this.supabase
      .rpc("process_entitlement_grant", { p_entitlement_row_id: entitlementRowId })
      .single();
    if (error) throw error;
    return data as ProcessEntitlementGrantResult;
  }

  async processRevocation(entitlementRowId: string): Promise<ProcessEntitlementRevocationResult> {
    const { data, error } = await this.supabase
      .rpc("process_entitlement_revocation", { p_entitlement_row_id: entitlementRowId })
      .single();
    if (error) throw error;
    return data as ProcessEntitlementRevocationResult;
  }

  async findPendingRevocation(sourceSystemKey: string, entitlementId: string): Promise<PendingRevocation | null> {
    const { data, error } = await this.supabase
      .from("entitlement_pending_revocations")
      .select("id, payload")
      .eq("source_system_key", sourceSystemKey)
      .eq("entitlement_id", entitlementId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id as string, payload: data.payload as Record<string, unknown> };
  }

  async upsertPendingRevocation(sourceSystemKey: string, entitlementId: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase
      .from("entitlement_pending_revocations")
      .upsert(
        { source_system_key: sourceSystemKey, entitlement_id: entitlementId, payload },
        { onConflict: "source_system_key,entitlement_id" }
      );
    if (error) throw error;
  }

  async deletePendingRevocation(id: string): Promise<void> {
    const { error } = await this.supabase.from("entitlement_pending_revocations").delete().eq("id", id);
    if (error) throw error;
  }
}
