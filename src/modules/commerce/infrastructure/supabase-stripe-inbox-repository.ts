import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ClaimStripeWebhookEventResult, StripeInboxRepository } from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// StripeInboxRepositoryのSupabase実装。既存のsrc/app/api/stripe/webhook/route.tsに
// 実装されていたRPC呼び出しをそのまま移設したもの。
export class SupabaseStripeInboxRepository implements StripeInboxRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async claimEvent(
    stripeEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    claimToken: string
  ): Promise<ClaimStripeWebhookEventResult> {
    const { data, error } = await this.supabase
      .rpc("claim_stripe_webhook_event", {
        p_stripe_event_id: stripeEventId,
        p_event_type: eventType,
        p_payload: payload,
        p_claim_token: claimToken,
      })
      .single();
    if (error) throw error;
    return data as ClaimStripeWebhookEventResult;
  }

  async markSucceeded(inboxEventId: string, claimToken: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("mark_stripe_webhook_succeeded", {
      p_inbox_event_id: inboxEventId,
      p_claim_token: claimToken,
    });
    if (error) throw error;
    return data as boolean;
  }

  async markFailed(inboxEventId: string, claimToken: string, message: string): Promise<void> {
    const { error } = await this.supabase.rpc("mark_stripe_webhook_failed", {
      p_inbox_event_id: inboxEventId,
      p_claim_token: claimToken,
      p_error: message,
    });
    if (error) throw error;
  }
}
