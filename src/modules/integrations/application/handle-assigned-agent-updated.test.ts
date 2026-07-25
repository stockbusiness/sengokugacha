import { describe, expect, it } from "vitest";
import { handleAssignedAgentUpdated, isExplicitUnassignment } from "@/modules/integrations/application/handle-assigned-agent-updated";
import type { AgencyEventRepository } from "@/modules/integrations/application/ports";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。

class FakeAgencyEventRepository implements AgencyEventRepository {
  usersByCommonUserId = new Map<string, string>();
  agentsByExternalId = new Map<string, string>();
  recordedUnresolved: { commonUserId: string; reason: string }[] = [];
  clearedUnresolved: string[] = [];
  updatedAssignedAgent: { userId: string; agentId: string | null }[] = [];

  async findUserIdByCommonUserId(commonUserId: string): Promise<string | null> {
    return this.usersByCommonUserId.get(commonUserId) ?? null;
  }
  async updateUserCommonUserId(): Promise<void> {
    throw new Error("not used in this test");
  }
  async recordUnresolvedCommonUserMerge(): Promise<void> {
    throw new Error("not used in this test");
  }
  async markUnresolvedCommonUserMergeResolved(): Promise<void> {
    throw new Error("not used in this test");
  }
  async insertCommonUserMergeConflict(): Promise<void> {
    throw new Error("not used in this test");
  }
  async recordUnresolvedAgentAssignment(commonUserId: string, reason: string): Promise<void> {
    this.recordedUnresolved.push({ commonUserId, reason });
  }
  async clearUnresolvedAgentAssignment(commonUserId: string): Promise<void> {
    this.clearedUnresolved.push(commonUserId);
  }
  async updateUserAssignedAgent(userId: string, agentId: string | null): Promise<void> {
    this.updatedAssignedAgent.push({ userId, agentId });
  }
  async findAgentIdByExternalId(agentCode: string): Promise<string | null> {
    return this.agentsByExternalId.get(agentCode) ?? null;
  }
}

describe("isExplicitUnassignment", () => {
  it("is true only when a known field is explicitly null", () => {
    expect(isExplicitUnassignment({ agent_code: null }, undefined)).toBe(true);
    expect(isExplicitUnassignment({ assigned_agent_code: null }, undefined)).toBe(true);
    expect(isExplicitUnassignment({}, { assigned_agent_code: null })).toBe(true);
  });
  it("is false when the field is absent entirely", () => {
    expect(isExplicitUnassignment({}, undefined)).toBe(false);
  });
  it("is false when the field has a non-null value", () => {
    expect(isExplicitUnassignment({ agent_code: "A-1" }, undefined)).toBe(false);
  });
});

describe("handleAssignedAgentUpdated", () => {
  it("does nothing when common_user_id cannot be determined", async () => {
    const repo = new FakeAgencyEventRepository();
    await handleAssignedAgentUpdated(repo, {});
    expect(repo.recordedUnresolved).toHaveLength(0);
  });

  it("records user_not_found when the local user is not yet synced (§10.1)", async () => {
    const repo = new FakeAgencyEventRepository();
    await handleAssignedAgentUpdated(repo, { common_user_id: "cu-1", agent_code: "A-1" });
    expect(repo.recordedUnresolved).toEqual([{ commonUserId: "cu-1", reason: "user_not_found" }]);
  });

  it("clears the assignment on an explicit unassignment (null agent_code)", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-1", "user-1");

    await handleAssignedAgentUpdated(repo, { common_user_id: "cu-1", agent_code: null });

    expect(repo.updatedAssignedAgent).toEqual([{ userId: "user-1", agentId: null }]);
    expect(repo.clearedUnresolved).toEqual(["cu-1"]);
  });

  it("records agent_code_undetermined when no agent code field is present", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-1", "user-1");

    await handleAssignedAgentUpdated(repo, { common_user_id: "cu-1" });

    expect(repo.recordedUnresolved).toEqual([{ commonUserId: "cu-1", reason: "agent_code_undetermined" }]);
    expect(repo.updatedAssignedAgent).toHaveLength(0);
  });

  it("records agent_not_found when the agent code does not resolve to a known agent", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-1", "user-1");

    await handleAssignedAgentUpdated(repo, { common_user_id: "cu-1", agent_code: "A-UNKNOWN" });

    expect(repo.recordedUnresolved).toEqual([{ commonUserId: "cu-1", reason: "agent_not_found" }]);
  });

  it("assigns the agent and clears any prior unresolved record on success", async () => {
    const repo = new FakeAgencyEventRepository();
    repo.usersByCommonUserId.set("cu-1", "user-1");
    repo.agentsByExternalId.set("A-1", "agent-1");

    await handleAssignedAgentUpdated(repo, { common_user_id: "cu-1", agent_code: "A-1" });

    expect(repo.updatedAssignedAgent).toEqual([{ userId: "user-1", agentId: "agent-1" }]);
    expect(repo.clearedUnresolved).toEqual(["cu-1"]);
  });
});
