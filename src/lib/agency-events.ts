import { createSupabaseServerClient } from "@/lib/supabase-server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// 千ノ国パスポート 全体統合対応 実装計画(PR4)。
// これまで/api/integrations/agenciesが200受理・無視していた共通顧客HUBイベントのうち、
// 「common_user_id」「代理店情報」の実装対象に該当する2つを実処理する。

// EXTERNAL_DEVELOPER_GUIDE 11.2章のペイロード例に基づく。
// {"event":"common_user.merged","details":{"source_common_user_id":"cu_source","target_common_user_id":"cu_target",...},...}
// P0-2(§4.6相当): 競合(target側に既に別のローカルユーザーが割当済み)はログのみでなく
// common_user_merge_conflictsへ永続化し、運用側で確認・手動対応できるようにする。
export async function handleCommonUserMerged(body: Record<string, unknown>): Promise<void> {
  const details = body.details as Record<string, unknown> | undefined;
  const sourceCommonUserId = typeof details?.source_common_user_id === "string" ? details.source_common_user_id : null;
  const targetCommonUserId = typeof details?.target_common_user_id === "string" ? details.target_common_user_id : null;
  if (!sourceCommonUserId || !targetCommonUserId) {
    console.warn("[agency-events] common_user.merged: source/target common_user_idが不足しています", body);
    return;
  }

  const supabase = createSupabaseServerClient();

  const { data: sourceUser, error: sourceError } = await supabase
    .from("users")
    .select("id")
    .eq("common_user_id", sourceCommonUserId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceUser) return; // このアプリ側に該当ユーザーが無い(無関係なmergeイベント)。

  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id")
    .eq("common_user_id", targetCommonUserId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (targetUser) {
    // 統合先IDが既に別のローカルユーザーへ割り当て済み。未検証情報での自動人物統合は
    // 禁止する方針のため、ローカルアカウント同士の統合(user行のマージ)は行わない。
    console.warn(
      `[agency-events] common_user.merged: 競合のため自動付け替えをスキップしました(source_user_id=${sourceUser.id}, target_user_id=${targetUser.id})`
    );
    const { error: conflictError } = await supabase.from("common_user_merge_conflicts").insert({
      source_common_user_id: sourceCommonUserId,
      target_common_user_id: targetCommonUserId,
      source_user_id: sourceUser.id,
      conflicting_target_user_id: targetUser.id,
      payload: body,
    });
    if (conflictError) {
      if (conflictError.code === "23505") return; // 同一組み合わせは記録済み(冪等)。
      throw conflictError;
    }
    return;
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ common_user_id: targetCommonUserId, common_user_synced_at: new Date().toISOString() })
    .eq("id", sourceUser.id);
  if (updateError) throw updateError;
}

async function recordUnresolvedAgentAssignment(
  supabase: SupabaseServerClient,
  commonUserId: string,
  reason: "agent_code_undetermined" | "agent_not_found",
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("unresolved_agent_assignments")
    .upsert(
      { common_user_id: commonUserId, reason, payload, updated_at: new Date().toISOString() },
      { onConflict: "common_user_id" }
    );
  if (error) throw error;
}

async function clearUnresolvedAgentAssignment(supabase: SupabaseServerClient, commonUserId: string): Promise<void> {
  const { error } = await supabase.from("unresolved_agent_assignments").delete().eq("common_user_id", commonUserId);
  if (error) throw error;
}

// フィールドが本文に存在し、かつ値がnullの場合のみ「明示的な担当解除」とみなす。
// フィールド自体が存在しない場合は「今回のイベントでは担当代理店に触れていない」可能性が
// あるため、担当解除とは扱わずagent_code_undeterminedとして保留する。
export function isExplicitUnassignment(body: Record<string, unknown>, commonUser: Record<string, unknown> | undefined): boolean {
  const candidates: Array<[Record<string, unknown> | undefined, string]> = [
    [body, "agent_code"],
    [body, "assigned_agent_code"],
    [commonUser, "assigned_agent_code"],
  ];
  return candidates.some(([obj, key]) => obj !== undefined && key in obj && obj[key] === null);
}

// common_user.assigned_agent.updated: 共通顧客の担当代理店が変更されたイベント。
// 具体的なペイロード形式(担当代理店コードのフィールド名)はガイドに明示例が無いため、
// 想定されるいくつかの位置を許容し、いずれにも該当しない場合は処理をスキップしてログのみ残す
// (仕様が判明した時点で対応するフォールバック設計)。
// P0-2: 明示的なnull(担当解除)に対応し、agent_code未特定・agents未同期の場合は
// unresolved_agent_assignmentsへ保存して再解決(手動トリガー)できるようにする。
export async function handleAssignedAgentUpdated(body: Record<string, unknown>): Promise<void> {
  const commonUser = body.common_user as Record<string, unknown> | undefined;
  const commonUserId =
    (typeof body.common_user_id === "string" && body.common_user_id) ||
    (typeof commonUser?.common_user_id === "string" && commonUser.common_user_id) ||
    null;
  if (!commonUserId) {
    console.warn("[agency-events] common_user.assigned_agent.updated: common_user_idが取得できません", body);
    return;
  }

  const supabase = createSupabaseServerClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("common_user_id", commonUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return; // このアプリ側に該当ユーザーが無い。

  if (isExplicitUnassignment(body, commonUser)) {
    const { error: updateError } = await supabase.from("users").update({ assigned_agent_id: null }).eq("id", user.id);
    if (updateError) throw updateError;
    await clearUnresolvedAgentAssignment(supabase, commonUserId);
    return;
  }

  const agentCode =
    (typeof body.agent_code === "string" && body.agent_code) ||
    (typeof body.assigned_agent_code === "string" && body.assigned_agent_code) ||
    (typeof commonUser?.assigned_agent_code === "string" && commonUser.assigned_agent_code) ||
    null;

  if (!agentCode) {
    console.warn(
      `[agency-events] common_user.assigned_agent.updated: agent_codeを特定できず更新をスキップしました(user_id=${user.id})`
    );
    await recordUnresolvedAgentAssignment(supabase, commonUserId, "agent_code_undetermined", body);
    return;
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("external_id", agentCode)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) {
    console.warn(`[agency-events] common_user.assigned_agent.updated: 該当代理店が見つかりません(agent_code=${agentCode})`);
    await recordUnresolvedAgentAssignment(supabase, commonUserId, "agent_not_found", body);
    return;
  }

  const { error: updateError } = await supabase.from("users").update({ assigned_agent_id: agent.id }).eq("id", user.id);
  if (updateError) throw updateError;
  await clearUnresolvedAgentAssignment(supabase, commonUserId);
}
