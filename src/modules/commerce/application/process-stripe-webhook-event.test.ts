import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。runPurchaseGrant()
// (src/lib/purchase-grants.ts、内部でSupabaseクライアントを生成する互換ラッパー)を
// vi.mock()で差し替え、processStripeWebhookEvent()のオーケストレーションのみを検証する。

const { runPurchaseGrantMock } = vi.hoisted(() => ({ runPurchaseGrantMock: vi.fn(async () => {}) }));
vi.mock("@/lib/purchase-grants", () => ({ runPurchaseGrant: runPurchaseGrantMock }));

import { processStripeWebhookEvent } from "@/modules/commerce/application/process-stripe-webhook-event";
import type { ClaimStripeWebhookEventResult, PurchaseRepository, StripeInboxRepository } from "@/modules/commerce/application/ports";

class FakeStripeInboxRepository implements StripeInboxRepository {
  claimResult: ClaimStripeWebhookEventResult = { claim_outcome: "new", inbox_event_id: "inbox-1" };
  markSucceededResult = true;
  markSucceededCalls: string[] = [];
  markFailedCalls: { inboxEventId: string; message: string }[] = [];

  async claimEvent(): Promise<ClaimStripeWebhookEventResult> {
    return this.claimResult;
  }
  async markSucceeded(inboxEventId: string): Promise<boolean> {
    this.markSucceededCalls.push(inboxEventId);
    return this.markSucceededResult;
  }
  async markFailed(inboxEventId: string, _claimToken: string, message: string): Promise<void> {
    this.markFailedCalls.push({ inboxEventId, message });
  }
}

class FakePurchaseRepository implements PurchaseRepository {
  purchaseBySessionId: { id: string; status: string } | null = { id: "purchase-1", status: "pending" };
  claimForProcessingResult = true;
  claimForProcessingCalls: unknown[] = [];

  async findGrantContext(): Promise<never> {
    throw new Error("not used in this test");
  }
  async markCompleted(): Promise<void> {}
  async markGrantFailed(): Promise<void> {}
  async getMonthlySpentYen(): Promise<number> {
    return 0;
  }
  async findByStripeSessionId(): Promise<{ id: string; status: string } | null> {
    return this.purchaseBySessionId;
  }
  async claimForProcessing(...args: unknown[]): Promise<boolean> {
    this.claimForProcessingCalls.push(args);
    return this.claimForProcessingResult;
  }
}

function makeEvent(type: string, sessionId = "cs_test_1"): Stripe.Event {
  return {
    id: "evt_1",
    type,
    data: { object: { id: sessionId, payment_intent: "pi_1", amount_total: 1000 } },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  runPurchaseGrantMock.mockClear().mockResolvedValue(undefined);
});

describe("processStripeWebhookEvent", () => {
  it("returns duplicate without calling runPurchaseGrant", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    inboxRepo.claimResult = { claim_outcome: "duplicate", inbox_event_id: "inbox-1" };
    const purchaseRepo = new FakePurchaseRepository();

    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("checkout.session.completed"), "token-1");

    expect(result).toEqual({ outcome: "duplicate" });
    expect(runPurchaseGrantMock).not.toHaveBeenCalled();
  });

  it("returns in_progress without processing", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    inboxRepo.claimResult = { claim_outcome: "in_progress", inbox_event_id: "inbox-1" };
    const result = await processStripeWebhookEvent(inboxRepo, new FakePurchaseRepository(), makeEvent("checkout.session.completed"), "t");
    expect(result).toEqual({ outcome: "in_progress" });
  });

  it("returns dead without processing", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    inboxRepo.claimResult = { claim_outcome: "dead", inbox_event_id: "inbox-1" };
    const result = await processStripeWebhookEvent(inboxRepo, new FakePurchaseRepository(), makeEvent("checkout.session.completed"), "t");
    expect(result).toEqual({ outcome: "dead" });
  });

  it("claims the purchase for processing and calls runPurchaseGrant on checkout.session.completed", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    const purchaseRepo = new FakePurchaseRepository();

    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("checkout.session.completed"), "token-1");

    expect(result).toEqual({ outcome: "processed" });
    expect(purchaseRepo.claimForProcessingCalls).toHaveLength(1);
    expect(runPurchaseGrantMock).toHaveBeenCalledWith("purchase-1");
    expect(inboxRepo.markSucceededCalls).toEqual(["inbox-1"]);
  });

  it("does not call runPurchaseGrant when the purchase cannot be claimed for processing (already processing/completed)", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    const purchaseRepo = new FakePurchaseRepository();
    purchaseRepo.claimForProcessingResult = false;

    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("checkout.session.completed"), "token-1");

    expect(result).toEqual({ outcome: "processed" });
    expect(runPurchaseGrantMock).not.toHaveBeenCalled();
    expect(inboxRepo.markSucceededCalls).toEqual(["inbox-1"]); // Webhook自体は正常受信として扱う
  });

  it("does nothing purchase-related for unrelated event types but still marks succeeded", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    const purchaseRepo = new FakePurchaseRepository();

    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("payment_intent.succeeded"), "token-1");

    expect(result).toEqual({ outcome: "processed" });
    expect(purchaseRepo.claimForProcessingCalls).toHaveLength(0);
    expect(runPurchaseGrantMock).not.toHaveBeenCalled();
  });

  it("marks failed and returns failed when the handler throws", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    const purchaseRepo = new FakePurchaseRepository();
    runPurchaseGrantMock.mockRejectedValueOnce(new Error("boom"));
    // handleCheckoutSessionCompleted内でrunPurchaseGrantの例外はcatchされ、
    // processStripeWebhookEvent自体は失敗しない設計(Webhookは正常受信として扱う)ことを確認する。
    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("checkout.session.completed"), "token-1");
    expect(result).toEqual({ outcome: "processed" });
  });

  it("marks failed when claimEvent-following processing throws outside the best-effort grant path", async () => {
    const inboxRepo = new FakeStripeInboxRepository();
    const purchaseRepo = new FakePurchaseRepository();
    purchaseRepo.findByStripeSessionId = async () => {
      throw new Error("db unavailable");
    };

    const result = await processStripeWebhookEvent(inboxRepo, purchaseRepo, makeEvent("checkout.session.completed"), "token-1");

    expect(result).toEqual({ outcome: "failed" });
    expect(inboxRepo.markFailedCalls).toEqual([{ inboxEventId: "inbox-1", message: "db unavailable" }]);
  });
});
