import { beforeEach, describe, expect, it, vi } from "vitest";

// 千ノ国パスポート Phase C-0(§13 Repository回帰テスト)。application層(run-purchase-grant.ts)
// が実際のSupabase呼び出しを一切含まないことを、フェイクRepositoryで検証する。
// 他モジュールの既存関数(confirmReferral/notifyPlotPurchase/completePlotPurchase/
// postLandSaleCommission)は内部でcreateSupabaseServerClient()を呼ぶため、vi.mock()で
// 差し替える(これらの単体動作自体は各モジュール側の責務であり、ここではrunPurchaseGrant()の
// オーケストレーション(呼び出し順序・分岐)のみを検証する)。

const { confirmReferralMock, notifyPlotPurchaseMock, completePlotPurchaseMock, postLandSaleCommissionMock } = vi.hoisted(() => ({
  // 呼び出し内容を検証するテストがあるため、引数の型を持つ関数として作る。
  confirmReferralMock: vi.fn((input: Record<string, unknown>, idempotencyKey?: string) =>
    Promise.resolve(Boolean(input) || Boolean(idempotencyKey))
  ),
  notifyPlotPurchaseMock: vi.fn(async () => true),
  completePlotPurchaseMock: vi.fn(async () => {}),
  postLandSaleCommissionMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/common-user-hub", () => ({ confirmReferral: confirmReferralMock }));
vi.mock("@/lib/castle-notifications", () => ({ notifyPlotPurchase: notifyPlotPurchaseMock }));
vi.mock("@/lib/plot-reservations", () => ({ completePlotPurchase: completePlotPurchaseMock }));
vi.mock("@/lib/castle-commissions", () => ({ postLandSaleCommission: postLandSaleCommissionMock }));

import { runPurchaseGrant } from "@/modules/commerce/application/run-purchase-grant";
import type {
  BalanceGrantOutcome,
  ClaimGrantStepResult,
  GrantStepKey,
  PurchaseGrantContext,
  PurchaseGrantStepRepository,
  PurchaseOutboxGateway,
  PurchaseRepository,
  UserRepository,
} from "@/modules/commerce/application/ports";

class FakePurchaseRepository implements PurchaseRepository {
  context: PurchaseGrantContext = {
    id: "purchase-1",
    user_id: "user-1",
    item_type: "kokudaka",
    amount: 1000,
    amount_received_yen: 1000,
    grant_amount: 500,
    plot_id: null,
    grant_attempt_count: 0,
  };
  markCompletedCalls: string[] = [];
  markGrantFailedCalls: { purchaseId: string; message: string; previousAttemptCount: number }[] = [];

  async findGrantContext(): Promise<PurchaseGrantContext> {
    return this.context;
  }
  async markCompleted(purchaseId: string): Promise<void> {
    this.markCompletedCalls.push(purchaseId);
  }
  async markGrantFailed(purchaseId: string, message: string, previousAttemptCount: number): Promise<void> {
    this.markGrantFailedCalls.push({ purchaseId, message, previousAttemptCount });
  }
  async getMonthlySpentYen(): Promise<number> {
    return 0;
  }
  async findByStripeSessionId(): Promise<{ id: string; status: string } | null> {
    return null;
  }
  async claimForProcessing(): Promise<boolean> {
    return true;
  }
}

class FakeStepRepository implements PurchaseGrantStepRepository {
  claimedSteps: GrantStepKey[] = [];
  claimResultByStep: Partial<Record<GrantStepKey, ClaimGrantStepResult>> = {};
  balanceGrantResult: BalanceGrantOutcome = { claim_outcome: "claimed", new_balance: 500 };
  failedSteps: { stepRowId: string; message: string }[] = [];

  async claimStep(purchaseId: string, stepKey: GrantStepKey): Promise<ClaimGrantStepResult> {
    this.claimedSteps.push(stepKey);
    return this.claimResultByStep[stepKey] ?? { claim_outcome: "claimed", step_row_id: `${purchaseId}:${stepKey}`, claim_token: "token" };
  }
  async markStepCompleted(): Promise<boolean> {
    return true;
  }
  async markStepFailed(stepRowId: string, _claimToken: string | null, message: string): Promise<void> {
    this.failedSteps.push({ stepRowId, message });
  }
  async applyBalanceGrant(): Promise<BalanceGrantOutcome> {
    return this.balanceGrantResult;
  }
  async recordAgentSale(): Promise<{ claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead" }> {
    return { claim_outcome: "claimed" };
  }
}

class FakeOutboxGateway implements PurchaseOutboxGateway {
  enqueued: { table: string; eventType: string }[] = [];
  async enqueueEvent(table: string, _sourceType: string, _sourceId: string, eventType: string): Promise<string> {
    this.enqueued.push({ table, eventType });
    return "outbox-1";
  }
  async markSent(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

class FakeUserRepository implements UserRepository {
  referralSessionKey: string | null = null;
  referralToken: string | null = null;
  async findReferralAttribution(): Promise<{ sessionKey: string | null; token: string | null }> {
    return { sessionKey: this.referralSessionKey, token: this.referralToken };
  }
}

beforeEach(() => {
  confirmReferralMock.mockClear().mockResolvedValue(true);
  notifyPlotPurchaseMock.mockClear().mockResolvedValue(true);
  completePlotPurchaseMock.mockClear().mockResolvedValue(undefined);
  postLandSaleCommissionMock.mockClear().mockResolvedValue(undefined);
});

describe("runPurchaseGrant", () => {
  it("applies the balance grant path (kokudaka) and marks the purchase completed", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    const stepRepo = new FakeStepRepository();
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(stepRepo.claimedSteps).toEqual(["referral_confirmed"]);
    expect(purchaseRepo.markCompletedCalls).toEqual(["purchase-1"]);
    expect(completePlotPurchaseMock).not.toHaveBeenCalled();
  });

  it("runs the land_plot path steps in order and notifies via outbox", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    purchaseRepo.context = { ...purchaseRepo.context, item_type: "land_plot", grant_amount: 0, plot_id: "plot-1" };
    const stepRepo = new FakeStepRepository();
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(stepRepo.claimedSteps).toEqual(["plot_completed", "commission_posted", "notification_sent", "referral_confirmed"]);
    expect(completePlotPurchaseMock).toHaveBeenCalledWith("purchase-1");
    expect(postLandSaleCommissionMock).toHaveBeenCalledWith("purchase-1");
    expect(notifyPlotPurchaseMock).toHaveBeenCalledWith("user-1", "plot-1");
    expect(outbox.enqueued).toContainEqual({ table: "notification_outbox_events", eventType: "notification.plot_purchased" });
  });

  it("skips an already_completed step without re-running its side effect", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    purchaseRepo.context = { ...purchaseRepo.context, item_type: "land_plot", grant_amount: 0, plot_id: "plot-1" };
    const stepRepo = new FakeStepRepository();
    stepRepo.claimResultByStep.plot_completed = { claim_outcome: "already_completed", step_row_id: "x", claim_token: null };
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(completePlotPurchaseMock).not.toHaveBeenCalled();
    expect(postLandSaleCommissionMock).toHaveBeenCalled(); // 他のステップは通常通り進む
  });

  it("marks the purchase as failed and rethrows when a step is dead", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    const stepRepo = new FakeStepRepository();
    stepRepo.claimResultByStep.referral_confirmed = { claim_outcome: "dead", step_row_id: "x", claim_token: null };
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();

    await expect(runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1")).rejects.toThrow(/再試行の上限に達しています/);

    expect(purchaseRepo.markCompletedCalls).toHaveLength(0);
    expect(purchaseRepo.markGrantFailedCalls).toHaveLength(1);
    expect(purchaseRepo.markGrantFailedCalls[0].purchaseId).toBe("purchase-1");
  });

  it("enqueues a referral.confirmed outbox event only when a referral session key exists", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    const stepRepo = new FakeStepRepository();
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();
    userRepo.referralSessionKey = "session-key-1";

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(outbox.enqueued).toContainEqual({ table: "integration_outbox_events", eventType: "referral.confirmed" });
    expect(confirmReferralMock).toHaveBeenCalledTimes(1);
  });

  it("does not call confirmReferral when there is neither a session key nor a token", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    const stepRepo = new FakeStepRepository();
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();
    userRepo.referralSessionKey = null;
    userRepo.referralToken = null;

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(confirmReferralMock).not.toHaveBeenCalled();
    expect(outbox.enqueued).toHaveLength(0);
  });

  // captureが失敗してsession_keyを得られなかった利用者でも、生のトークンが
  // 残っていれば紹介確定できる(先方回答 2026-08-03 Q4)。
  it("falls back to the raw referral token when the capture step never produced a session key", async () => {
    const purchaseRepo = new FakePurchaseRepository();
    const stepRepo = new FakeStepRepository();
    const outbox = new FakeOutboxGateway();
    const userRepo = new FakeUserRepository();
    userRepo.referralSessionKey = null;
    userRepo.referralToken = "rt_fallback";

    await runPurchaseGrant(purchaseRepo, stepRepo, outbox, userRepo, "purchase-1");

    expect(confirmReferralMock).toHaveBeenCalledTimes(1);
    expect(confirmReferralMock.mock.calls[0][0]).toMatchObject({
      referralSessionKey: null,
      referralToken: "rt_fallback",
    });
  });
});
