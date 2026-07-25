import { describe, expect, it } from "vitest";
import { grantEntitlement, retryResolveEntitlementGrant } from "@/modules/entitlements/application/grant-entitlement";
import type {
  CreateEntitlementInput,
  EntitlementRepository,
  EntitlementRow,
  PendingRevocation,
  ProcessEntitlementGrantResult,
} from "@/modules/entitlements/application/ports";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。application層(grant-entitlement.ts)
// が実際のSupabase呼び出しを一切含まないことを、フェイクRepositoryで検証する。
// DBに依存しないため、このテストはSupabase localの有無に関わらず常に実行できる。

class FakeEntitlementRepository implements EntitlementRepository {
  rows = new Map<string, EntitlementRow & { userId: string | null }>();
  pendingRevocations = new Map<string, PendingRevocation>();
  processGrantResult: ProcessEntitlementGrantResult = { claim_outcome: "claimed", resolved_user_id: null };
  processGrantCalls: string[] = [];
  createOrGetExistingCalls: CreateEntitlementInput[] = [];
  private nextId = 1;

  private key(sourceSystemKey: string, entitlementId: string) {
    return `${sourceSystemKey}:${entitlementId}`;
  }

  async findBySourceAndEntitlementId(sourceSystemKey: string, entitlementId: string): Promise<EntitlementRow | null> {
    const row = this.rows.get(this.key(sourceSystemKey, entitlementId));
    return row ? { id: row.id } : null;
  }

  async resolveLocalUserId(commonUserId: string): Promise<string | null> {
    return commonUserId === "cu-resolved" ? "user-resolved" : null;
  }

  async createOrGetExisting(input: CreateEntitlementInput): Promise<EntitlementRow> {
    this.createOrGetExistingCalls.push(input);
    const id = `row-${this.nextId++}`;
    this.rows.set(this.key(input.sourceSystemKey, input.entitlementId), { id, userId: input.userId });
    return { id };
  }

  async updateMetadata(): Promise<void> {
    throw new Error("not used in this test");
  }

  async processGrant(entitlementRowId: string): Promise<ProcessEntitlementGrantResult> {
    this.processGrantCalls.push(entitlementRowId);
    return this.processGrantResult;
  }

  processRevocationResult: { claim_outcome: "claimed" | "already_reversed" | "reversed_without_balance_change" | "in_progress" | "dead" | "not_found" } = {
    claim_outcome: "claimed",
  };
  async processRevocation() {
    return this.processRevocationResult;
  }

  async findPendingRevocation(sourceSystemKey: string, entitlementId: string): Promise<PendingRevocation | null> {
    return this.pendingRevocations.get(this.key(sourceSystemKey, entitlementId)) ?? null;
  }

  async upsertPendingRevocation(): Promise<void> {
    throw new Error("not used in this test");
  }

  deletedPendingRevocationIds: string[] = [];
  async deletePendingRevocation(id: string): Promise<void> {
    this.deletedPendingRevocationIds.push(id);
  }
}

const baseBody = { entitlement_id: "ent-1", common_user_id: "cu-resolved", entitlement_type: "kokudaka" };

describe("grantEntitlement", () => {
  it("throws when entitlement_id/common_user_id is missing", async () => {
    const repo = new FakeEntitlementRepository();
    await expect(grantEntitlement(repo, {}, "system-a")).rejects.toThrow("entitlement_id/common_user_idが不足しています");
  });

  it("creates a new entitlement row and calls processGrant when none exists", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "claimed", resolved_user_id: "user-resolved" };

    await grantEntitlement(repo, baseBody, "system-a");

    expect(repo.createOrGetExistingCalls).toHaveLength(1);
    expect(repo.createOrGetExistingCalls[0]).toMatchObject({
      entitlementId: "ent-1",
      commonUserId: "cu-resolved",
      userId: "user-resolved",
      sourceSystemKey: "system-a",
    });
    expect(repo.processGrantCalls).toHaveLength(1);
  });

  it("reuses the existing row (does not call createOrGetExisting) when found", async () => {
    const repo = new FakeEntitlementRepository();
    await repo.createOrGetExisting({
      entitlementId: "ent-1",
      commonUserId: "cu-resolved",
      userId: "user-resolved",
      entitlementType: "kokudaka",
      productCode: null,
      quantity: 1,
      validFrom: null,
      validUntil: null,
      orderId: null,
      orderItemId: null,
      sourceSystemKey: "system-a",
      metadata: null,
    });
    repo.createOrGetExistingCalls = [];

    await grantEntitlement(repo, baseBody, "system-a");

    expect(repo.createOrGetExistingCalls).toHaveLength(0);
    expect(repo.processGrantCalls).toHaveLength(1);
  });

  it("throws a descriptive error when processGrant reports dead", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "dead", resolved_user_id: null };
    await expect(grantEntitlement(repo, baseBody, "system-a")).rejects.toThrow(/再試行の上限に達しています/);
  });

  it("throws when processGrant reports in_progress", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "in_progress", resolved_user_id: null };
    await expect(grantEntitlement(repo, baseBody, "system-a")).rejects.toThrow(/他のリクエストが処理中です/);
  });

  it("does not throw when processGrant reports user_unresolved (logs and continues)", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "user_unresolved", resolved_user_id: null };
    await expect(grantEntitlement(repo, baseBody, "system-a")).resolves.toBeUndefined();
  });

  it("applies a pending revocation after a successful grant (順序逆転対応)", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "claimed", resolved_user_id: "user-resolved" };
    repo.pendingRevocations.set("system-a:ent-1", { id: "pending-1", payload: { entitlement_id: "ent-1" } });
    // revokeEntitlement()自体が呼ばれるとfindBySourceAndEntitlementId→processRevocationへ進むため、
    // ここではfindBySourceAndEntitlementIdが「見つからない」を返すよう未登録のままにし、
    // upsertPendingRevocation経由の無限ループにならないことのみ確認する(processRevocationは
    // revoke-entitlement.test.tsで個別に検証する)。
    repo.upsertPendingRevocation = async () => {};

    await grantEntitlement(repo, baseBody, "system-a");

    expect(repo.deletedPendingRevocationIds).toEqual(["pending-1"]);
  });
});

describe("retryResolveEntitlementGrant", () => {
  it("delegates directly to repository.processGrant without touching other methods", async () => {
    const repo = new FakeEntitlementRepository();
    repo.processGrantResult = { claim_outcome: "claimed", resolved_user_id: "user-x" };

    const result = await retryResolveEntitlementGrant(repo, "row-99");

    expect(result).toEqual({ claim_outcome: "claimed", resolved_user_id: "user-x" });
    expect(repo.processGrantCalls).toEqual(["row-99"]);
    expect(repo.createOrGetExistingCalls).toHaveLength(0);
  });
});
