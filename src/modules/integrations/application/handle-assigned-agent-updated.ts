import type { AgencyEventRepository } from "@/modules/integrations/application/ports";

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
export async function handleAssignedAgentUpdated(repository: AgencyEventRepository, body: Record<string, unknown>): Promise<void> {
  const commonUser = body.common_user as Record<string, unknown> | undefined;
  const commonUserId =
    (typeof body.common_user_id === "string" && body.common_user_id) ||
    (typeof commonUser?.common_user_id === "string" && commonUser.common_user_id) ||
    null;
  if (!commonUserId) {
    console.warn("[agency-events] common_user.assigned_agent.updated: common_user_idが取得できません", body);
    return;
  }

  const userId = await repository.findUserIdByCommonUserId(commonUserId);
  if (!userId) {
    // モジュール化後バグ修正・Phase B改修指示書§10.1。このアプリ側に該当ユーザーが
    // まだ同期されていないだけの可能性があるため、破棄せずuser_not_foundとして
    // 保存し、ユーザー登録・common_user_id同期後に再処理できるようにする。
    console.warn(`[agency-events] common_user.assigned_agent.updated: 該当ユーザーが見つかりません(common_user_id=${commonUserId})`);
    await repository.recordUnresolvedAgentAssignment(commonUserId, "user_not_found", body);
    return;
  }

  if (isExplicitUnassignment(body, commonUser)) {
    await repository.updateUserAssignedAgent(userId, null);
    await repository.clearUnresolvedAgentAssignment(commonUserId);
    return;
  }

  const agentCode =
    (typeof body.agent_code === "string" && body.agent_code) ||
    (typeof body.assigned_agent_code === "string" && body.assigned_agent_code) ||
    (typeof commonUser?.assigned_agent_code === "string" && commonUser.assigned_agent_code) ||
    null;

  if (!agentCode) {
    console.warn(`[agency-events] common_user.assigned_agent.updated: agent_codeを特定できず更新をスキップしました(user_id=${userId})`);
    await repository.recordUnresolvedAgentAssignment(commonUserId, "agent_code_undetermined", body);
    return;
  }

  const agentId = await repository.findAgentIdByExternalId(agentCode);
  if (!agentId) {
    console.warn(`[agency-events] common_user.assigned_agent.updated: 該当代理店が見つかりません(agent_code=${agentCode})`);
    await repository.recordUnresolvedAgentAssignment(commonUserId, "agent_not_found", body);
    return;
  }

  await repository.updateUserAssignedAgent(userId, agentId);
  await repository.clearUnresolvedAgentAssignment(commonUserId);
}
