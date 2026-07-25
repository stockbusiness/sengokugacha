import { describe, expect, it } from "vitest";
import { revokeEntitlement } from "@/modules/entitlements/application/revoke-entitlement";
import type {
  EntitlementRepository,
  EntitlementRow,
  PendingRevocation,
  ProcessEntitlementGrantResult,
  ProcessEntitlementRevocationResult,
} from "@/modules/entitlements/application/ports";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。

class FakeEntitlementRepository implements EntitlementRepository {
  existingRow: EntitlementRow | null = null;
  processRevocationResult: ProcessEntitlementRevocationResult = { claim_outcome: "claimed" };
  processRevocationCalls: string[] = [];
  upsertedPendingRevocations: { sourceSystemKey: string; entitlementId: string; payload: Record<string, unknown> }[] = [];

  async findBySourceAndEntitlementId(): Promise<EntitlementRow | null> {
    return this.existingRow;
  }
  async resolveLocalUserId(): Promise<string | null> {
    return null;
  }
  async createOrGetExisting(): Promise<EntitlementRow> {
    throw new Error("not used in this test");
  }
  async updateMetadata(): Promise<void> {
    throw new Error("not used in this test");
  }
  async processGrant(): Promise<ProcessEntitlementGrantResult> {
    throw new Error("not used in this test");
  }
  async processRevocation(entitlementRowId: string): Promise<ProcessEntitlementRevocationResult> {
    this.processRevocationCalls.push(entitlementRowId);
    return this.processRevocationResult;
  }
  async findPendingRevocation(): Promise<PendingRevocation | null> {
    return null;
  }
  async upsertPendingRevocation(sourceSystemKey: string, entitlementId: string, payload: Record<string, unknown>): Promise<void> {
    this.upsertedPendingRevocations.push({ sourceSystemKey, entitlementId, payload });
  }
  async deletePendingRevocation(): Promise<void> {}
}

describe("revokeEntitlement", () => {
  it("throws when entitlement_id is missing", async () => {
    const repo = new FakeEntitlementRepository();
    await expect(revokeEntitlement(repo, {}, "system-a")).rejects.toThrow("entitlement_idが不足しています");
  });

  it("saves as a pending revocation when the entitlement does not exist yet (順序逆転対応)", async () => {
    const repo = new FakeEntitlementRepository();
    repo.existingRow = null;
    const body = { entitlement_id: "ent-1" };

    await revokeEntitlement(repo, body, "system-a");

    expect(repo.upsertedPendingRevocations).toEqual([{ sourceSystemKey: "system-a", entitlementId: "ent-1", payload: body }]);
    expect(repo.processRevocationCalls).toHaveLength(0);
  });

  it("calls processRevocation when the entitlement exists", async () => {
    const repo = new FakeEntitlementRepository();
    repo.existingRow = { id: "row-1" };

    await revokeEntitlement(repo, { entitlement_id: "ent-1" }, "system-a");

    expect(repo.processRevocationCalls).toEqual(["row-1"]);
  });

  it("throws a descriptive error when processRevocation reports dead", async () => {
    const repo = new FakeEntitlementRepository();
    repo.existingRow = { id: "row-1" };
    repo.processRevocationResult = { claim_outcome: "dead" };
    await expect(revokeEntitlement(repo, { entitlement_id: "ent-1" }, "system-a")).rejects.toThrow(/再試行の上限に達しています/);
  });

  it("throws when processRevocation reports in_progress", async () => {
    const repo = new FakeEntitlementRepository();
    repo.existingRow = { id: "row-1" };
    repo.processRevocationResult = { claim_outcome: "in_progress" };
    await expect(revokeEntitlement(repo, { entitlement_id: "ent-1" }, "system-a")).rejects.toThrow(/他のリクエストが処理中です/);
  });

  it("does not throw for already_reversed / reversed_without_balance_change (idempotent outcomes)", async () => {
    const repo = new FakeEntitlementRepository();
    repo.existingRow = { id: "row-1" };
    repo.processRevocationResult = { claim_outcome: "already_reversed" };
    await expect(revokeEntitlement(repo, { entitlement_id: "ent-1" }, "system-a")).resolves.toBeUndefined();

    repo.processRevocationResult = { claim_outcome: "reversed_without_balance_change" };
    await expect(revokeEntitlement(repo, { entitlement_id: "ent-1" }, "system-a")).resolves.toBeUndefined();
  });
});
