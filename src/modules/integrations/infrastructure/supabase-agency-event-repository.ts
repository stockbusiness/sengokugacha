import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { AgencyEventRepository } from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// AgencyEventRepositoryのSupabase実装。既存のsrc/lib/agency-events.tsに実装されていた
// クエリをそのまま移設したもの。
export class SupabaseAgencyEventRepository implements AgencyEventRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async findUserIdByCommonUserId(commonUserId: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("users").select("id").eq("common_user_id", commonUserId).maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  }

  async updateUserCommonUserId(userId: string, targetCommonUserId: string, syncedAtIso: string): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({ common_user_id: targetCommonUserId, common_user_synced_at: syncedAtIso })
      .eq("id", userId);
    if (error) throw error;
  }

  async recordUnresolvedCommonUserMerge(
    sourceCommonUserId: string,
    targetCommonUserId: string,
    reason: "source_user_not_found",
    payload: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase.from("unresolved_common_user_merges").upsert(
      {
        source_common_user_id: sourceCommonUserId,
        target_common_user_id: targetCommonUserId,
        reason,
        payload,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_common_user_id,target_common_user_id" }
    );
    if (error) throw error;
  }

  // この組み合わせのunresolved_common_user_merges行が(過去のuser_not_found記録として)
  // 存在すれば解決済みにする。該当行が無い場合(通常の一発成功パス)は何もしない。
  async markUnresolvedCommonUserMergeResolved(sourceCommonUserId: string, targetCommonUserId: string): Promise<void> {
    const { error } = await this.supabase
      .from("unresolved_common_user_merges")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("source_common_user_id", sourceCommonUserId)
      .eq("target_common_user_id", targetCommonUserId)
      .eq("status", "pending");
    if (error) throw error;
  }

  async insertCommonUserMergeConflict(
    sourceCommonUserId: string,
    targetCommonUserId: string,
    sourceUserId: string,
    conflictingTargetUserId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase.from("common_user_merge_conflicts").insert({
      source_common_user_id: sourceCommonUserId,
      target_common_user_id: targetCommonUserId,
      source_user_id: sourceUserId,
      conflicting_target_user_id: conflictingTargetUserId,
      payload,
    });
    if (error) {
      if (error.code !== "23505") throw error; // 23505は同一組み合わせが記録済み(冪等)。
    }
  }

  async recordUnresolvedAgentAssignment(
    commonUserId: string,
    reason: "agent_code_undetermined" | "agent_not_found" | "user_not_found",
    payload: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase
      .from("unresolved_agent_assignments")
      .upsert({ common_user_id: commonUserId, reason, payload, updated_at: new Date().toISOString() }, { onConflict: "common_user_id" });
    if (error) throw error;
  }

  async clearUnresolvedAgentAssignment(commonUserId: string): Promise<void> {
    const { error } = await this.supabase.from("unresolved_agent_assignments").delete().eq("common_user_id", commonUserId);
    if (error) throw error;
  }

  async updateUserAssignedAgent(userId: string, agentId: string | null): Promise<void> {
    const { error } = await this.supabase.from("users").update({ assigned_agent_id: agentId }).eq("id", userId);
    if (error) throw error;
  }

  async findAgentIdByExternalId(agentCode: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("agents").select("id").eq("external_id", agentCode).maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  }
}
