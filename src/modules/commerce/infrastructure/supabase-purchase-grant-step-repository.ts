import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  AgentSaleOutcome,
  BalanceGrantOutcome,
  ClaimGrantStepResult,
  GrantStepKey,
  PurchaseGrantStepRepository,
} from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// PurchaseGrantStepRepositoryのSupabase実装。既存のsrc/lib/purchase-grants.tsに
// 実装されていたRPC呼び出しをそのまま移設したもの(claim_purchase_grant_step()・
// mark_purchase_grant_step_completed()・mark_purchase_grant_step_failed()・
// apply_purchase_balance_grant()・record_purchase_agent_sale()は、いずれも
// バグ修正PR1・PR2で導入した単一トランザクションのPostgres関数であり、分割しない)。
export class SupabasePurchaseGrantStepRepository implements PurchaseGrantStepRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async claimStep(purchaseId: string, stepKey: GrantStepKey): Promise<ClaimGrantStepResult> {
    const { data, error } = await this.supabase
      .rpc("claim_purchase_grant_step", { p_purchase_id: purchaseId, p_step_key: stepKey })
      .single();
    if (error) throw error;
    return data as ClaimGrantStepResult;
  }

  async markStepCompleted(stepRowId: string, claimToken: string | null): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("mark_purchase_grant_step_completed", {
      p_step_row_id: stepRowId,
      p_claim_token: claimToken,
    });
    if (error) throw error;
    return data as boolean;
  }

  async markStepFailed(stepRowId: string, claimToken: string | null, message: string): Promise<void> {
    await this.supabase.rpc("mark_purchase_grant_step_failed", {
      p_step_row_id: stepRowId,
      p_claim_token: claimToken,
      p_error: message,
    });
  }

  async applyBalanceGrant(
    purchaseId: string,
    userId: string,
    column: "kokudaka" | "gacha_tickets",
    delta: number
  ): Promise<BalanceGrantOutcome> {
    const { data, error } = await this.supabase
      .rpc("apply_purchase_balance_grant", {
        p_purchase_id: purchaseId,
        p_user_id: userId,
        p_column: column,
        p_delta: delta,
      })
      .single();
    if (error) throw error;
    return data as BalanceGrantOutcome;
  }

  async recordAgentSale(purchaseId: string, userId: string, itemType: string, amount: number): Promise<AgentSaleOutcome> {
    const { data, error } = await this.supabase
      .rpc("record_purchase_agent_sale", {
        p_purchase_id: purchaseId,
        p_user_id: userId,
        p_item_type: itemType,
        p_amount: amount,
      })
      .single();
    if (error) throw error;
    return data as AgentSaleOutcome;
  }
}
