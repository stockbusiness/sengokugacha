import type { AgencyEventRepository } from "@/modules/integrations/application/ports";

// EXTERNAL_DEVELOPER_GUIDE 11.2章のペイロード例に基づく。
// {"event":"common_user.merged","details":{"source_common_user_id":"cu_source","target_common_user_id":"cu_target",...},...}
// P0-2(§4.6相当): 競合(target側に既に別のローカルユーザーが割当済み)はログのみでなく
// common_user_merge_conflictsへ永続化し、運用側で確認・手動対応できるようにする。
// モジュール化後バグ修正・Phase B改修指示書§10.2: 統合元(source)のローカルユーザーが
// まだ同期されていないだけの可能性があるため、「無関係なイベント」として破棄せず
// unresolved_common_user_mergesへ保存し、ユーザー登録・common_user_id同期後に
// 再処理できるようにする。
export async function handleCommonUserMerged(repository: AgencyEventRepository, body: Record<string, unknown>): Promise<void> {
  const details = body.details as Record<string, unknown> | undefined;
  const sourceCommonUserId = typeof details?.source_common_user_id === "string" ? details.source_common_user_id : null;
  const targetCommonUserId = typeof details?.target_common_user_id === "string" ? details.target_common_user_id : null;
  if (!sourceCommonUserId || !targetCommonUserId) {
    console.warn("[agency-events] common_user.merged: source/target common_user_idが不足しています", body);
    return;
  }

  const sourceUserId = await repository.findUserIdByCommonUserId(sourceCommonUserId);
  if (!sourceUserId) {
    await repository.recordUnresolvedCommonUserMerge(sourceCommonUserId, targetCommonUserId, "source_user_not_found", body);
    return;
  }

  const targetUserId = await repository.findUserIdByCommonUserId(targetCommonUserId);
  if (targetUserId) {
    // 統合先IDが既に別のローカルユーザーへ割り当て済み。未検証情報での自動人物統合は
    // 禁止する方針のため、ローカルアカウント同士の統合(user行のマージ)は行わない。
    console.warn(
      `[agency-events] common_user.merged: 競合のため自動付け替えをスキップしました(source_user_id=${sourceUserId}, target_user_id=${targetUserId})`
    );
    await repository.insertCommonUserMergeConflict(sourceCommonUserId, targetCommonUserId, sourceUserId, targetUserId, body);
    await repository.markUnresolvedCommonUserMergeResolved(sourceCommonUserId, targetCommonUserId);
    return;
  }

  await repository.updateUserCommonUserId(sourceUserId, targetCommonUserId, new Date().toISOString());
  await repository.markUnresolvedCommonUserMergeResolved(sourceCommonUserId, targetCommonUserId);
}
