import { describe, expect, it } from "vitest";
import { handleCommonUserMerged } from "@/modules/integrations/application/handle-common-user-merged";
import type { AgencyEventRepository } from "@/modules/integrations/application/ports";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。

class FakeAgencyEventRepository implements AgencyEventRepository {
  usersByCommonUserId = new Map<string, string>(); // commonUserId -> userId
  recordedUnresolvedMerges: unknown[] = [];
  resolvedMerges: { source: string; target: string }[] = [];
  insertedConflicts: unknown[] = [];
  updatedCommonUserIds: { userId: string; targetCommonUserId: string }[] = [];

  async findUserIdByCommonUserId(commonUserId: string): Promise<string | null> {
    return this.usersByCommonUserId.get(commonUserId) ?? null;
  }
  async updateUserCommonUserId(userId: string, targetCommonUserId: string): Promise<void> {
    this.updatedCommonUserIds.push({ userId, targetCommonUserId });
  }
  async recordUnresolvedCommonUserMerge(sourceCommonUserId: string, targetCommonUserId: string, reason: string, payload: unknown) {
    this.recordedUnresolvedMerges.push({ sourceCommonUserId, targetCommonUserId, reason, payload });
  }
  async markUnresolvedCommonUserMergeResolved(sourceCommonUserId: string, targetCommonUserId: string) {
    this.resolvedMerges.push({ source: sourceCommonUserId, target: targetCommonUserId });
  }
  async insertCommonUserMergeConflict(
    sourceCommonUserId: string,
    targetCommonUserId: string,
    sourceUserId: string,
    conflictingTargetUserId: string,
    payload: unknown
  ) {
    this.insertedConflicts.push({ sourceCommonUserId, targetCommonUserId, sourceUserId, conflictingTargetUserId, payload });
  }
  async recordUnresolvedAgentAssignment(): Promise<void> {
    throw new Error("not used in this test");
  }
  async clearUnresolvedAgentAssignment(): Promise<void> {
    throw new Error("not used in this test");
  }
  async updateUserAssignedAgent(): Promise<void> {
    throw new Error("not used in this test");
  }
  async findAgentIdByExternalId(): Promise<string | null> {
    throw new Error("not used in this test");
  }
}

const body = { details: { source_common_user_id: "cu-source", target_common_user_id: "cu-target" } };

describe("handleCommonUserMerged", () => {
  it("does nothing when source/target common_user_id are missing", async () => {
    const repo = new FakeAgencyEventRepository();
    await handleCommonUserMerged(repo, {});
    expect(repo.recordedUnresolvedMerges).toHaveLength(0);
  });

  it("records as unresolved when the source user is not yet synced (§10.2)", async () => {
    const repo = new FakeAgencyEventRepository();
    await handleCommonUserMerged(repo, body);
    expect(repo.recordedUnresolvedMerges).toEqual([
      { sourceCommonUserId: "cu-source", targetCommonUserId: "cu-target", reason: "source_user_not_found", payload: body },
    ]);
    expect(repo.updatedCommonUserIds).toHaveLength(0);
  });

  it("updates the source user's common_user_id when target is not already taken", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-source", "user-source");

    await handleCommonUserMerged(repo, body);

    expect(repo.updatedCommonUserIds).toEqual([{ userId: "user-source", targetCommonUserId: "cu-target" }]);
    expect(repo.resolvedMerges).toEqual([{ source: "cu-source", target: "cu-target" }]);
    expect(repo.insertedConflicts).toHaveLength(0);
  });

  it("records a conflict and does not merge local accounts when target is already assigned to another user", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-source", "user-source");
    repo.usersByCommonUserId.set("cu-target", "user-target");

    await handleCommonUserMerged(repo, body);

    expect(repo.updatedCommonUserIds).toHaveLength(0); // ローカルアカウント同士の統合はしない
    expect(repo.insertedConflicts).toEqual([
      { sourceCommonUserId: "cu-source", targetCommonUserId: "cu-target", sourceUserId: "user-source", conflictingTargetUserId: "user-target", payload: body },
    ]);
    // 統合元ユーザーの同期自体は完了しているため、user_not_foundの未解決記録は解消扱いにする。
    expect(repo.resolvedMerges).toEqual([{ source: "cu-source", target: "cu-target" }]);
  });
});
