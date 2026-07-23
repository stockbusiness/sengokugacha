import { describe, expect, it } from "vitest";
import {
  canOperatorPerformOrderTransition,
  EXTERNAL_ORDER_STATUSES,
  isValidExternalOrderTransition,
  type ExternalOrderStatus,
} from "./order-state";

describe("isValidExternalOrderTransition", () => {
  it("allows the documented happy path draft -> rights_granted", () => {
    expect(isValidExternalOrderTransition("draft", "payment_pending")).toBe(true);
    expect(isValidExternalOrderTransition("payment_pending", "payment_confirmed")).toBe(true);
    expect(isValidExternalOrderTransition("payment_confirmed", "user_link_pending")).toBe(true);
    expect(isValidExternalOrderTransition("user_link_pending", "plot_assignment_pending")).toBe(true);
    expect(isValidExternalOrderTransition("plot_assignment_pending", "ready_to_grant")).toBe(true);
    expect(isValidExternalOrderTransition("ready_to_grant", "rights_granted")).toBe(true);
  });

  it("allows the partial-assignment path", () => {
    expect(isValidExternalOrderTransition("plot_assignment_pending", "partially_assigned")).toBe(true);
    expect(isValidExternalOrderTransition("partially_assigned", "ready_to_grant")).toBe(true);
  });

  it("allows unassigning a plot to regress ready_to_grant/partially_assigned", () => {
    expect(isValidExternalOrderTransition("ready_to_grant", "partially_assigned")).toBe(true);
    expect(isValidExternalOrderTransition("partially_assigned", "plot_assignment_pending")).toBe(true);
  });

  it("allows unlinking a mistaken user link before rights are granted (6-4)", () => {
    expect(isValidExternalOrderTransition("plot_assignment_pending", "user_link_pending")).toBe(true);
    expect(isValidExternalOrderTransition("partially_assigned", "user_link_pending")).toBe(true);
    expect(isValidExternalOrderTransition("ready_to_grant", "user_link_pending")).toBe(true);
  });

  it("does not allow unlinking directly from rights_granted (requires a dedicated transfer process)", () => {
    expect(isValidExternalOrderTransition("rights_granted", "user_link_pending")).toBe(false);
  });

  it("allows cancel_pending from every non-terminal status", () => {
    for (const status of EXTERNAL_ORDER_STATUSES) {
      if (["cancelled", "refunded", "on_hold", "cancel_pending"].includes(status)) continue;
      expect(isValidExternalOrderTransition(status, "cancel_pending")).toBe(true);
    }
  });

  it("allows rights_granted to be cancelled post-grant (9-1)", () => {
    expect(isValidExternalOrderTransition("rights_granted", "cancel_pending")).toBe(true);
  });

  it("resolves cancel_pending to either cancelled or refunded", () => {
    expect(isValidExternalOrderTransition("cancel_pending", "cancelled")).toBe(true);
    expect(isValidExternalOrderTransition("cancel_pending", "refunded")).toBe(true);
  });

  it("rejects any transition out of cancelled or refunded (terminal states)", () => {
    for (const status of EXTERNAL_ORDER_STATUSES) {
      expect(isValidExternalOrderTransition("cancelled", status)).toBe(false);
      expect(isValidExternalOrderTransition("refunded", status)).toBe(false);
    }
  });

  it("allows on_hold from every operational status except draft and the terminal ones", () => {
    for (const status of EXTERNAL_ORDER_STATUSES) {
      if (["draft", "cancel_pending", "cancelled", "refunded", "on_hold"].includes(status)) continue;
      expect(isValidExternalOrderTransition(status, "on_hold")).toBe(true);
    }
    expect(isValidExternalOrderTransition("draft", "on_hold")).toBe(true);
    expect(isValidExternalOrderTransition("cancel_pending", "on_hold")).toBe(true);
  });

  it("rejects skipping stages (e.g. draft straight to rights_granted)", () => {
    expect(isValidExternalOrderTransition("draft", "rights_granted")).toBe(false);
    expect(isValidExternalOrderTransition("payment_pending", "user_link_pending")).toBe(false);
    expect(isValidExternalOrderTransition("user_link_pending", "ready_to_grant")).toBe(false);
  });

  it("rejects self-transitions", () => {
    for (const status of EXTERNAL_ORDER_STATUSES) {
      expect(isValidExternalOrderTransition(status, status)).toBe(false);
    }
  });
});

describe("canOperatorPerformOrderTransition", () => {
  it("allows operators to register and hold orders pre-payment-confirmation", () => {
    expect(canOperatorPerformOrderTransition("draft", "payment_pending")).toBe(true);
    expect(canOperatorPerformOrderTransition("draft", "on_hold")).toBe(true);
  });

  it("allows operators to build and adjust plot assignment proposals", () => {
    expect(canOperatorPerformOrderTransition("plot_assignment_pending", "partially_assigned")).toBe(true);
    expect(canOperatorPerformOrderTransition("plot_assignment_pending", "ready_to_grant")).toBe(true);
    expect(canOperatorPerformOrderTransition("partially_assigned", "ready_to_grant")).toBe(true);
    expect(canOperatorPerformOrderTransition("partially_assigned", "plot_assignment_pending")).toBe(true);
    expect(canOperatorPerformOrderTransition("ready_to_grant", "partially_assigned")).toBe(true);
  });

  it("requires manager for payment confirmation, user linking, and rights granting", () => {
    expect(canOperatorPerformOrderTransition("payment_pending", "payment_confirmed")).toBe(false);
    expect(canOperatorPerformOrderTransition("payment_confirmed", "user_link_pending")).toBe(false);
    expect(canOperatorPerformOrderTransition("user_link_pending", "plot_assignment_pending")).toBe(false);
    expect(canOperatorPerformOrderTransition("ready_to_grant", "rights_granted")).toBe(false);
  });

  it("allows operators to undo a mistaken user link before rights are granted (6-4)", () => {
    expect(canOperatorPerformOrderTransition("plot_assignment_pending", "user_link_pending")).toBe(true);
    expect(canOperatorPerformOrderTransition("partially_assigned", "user_link_pending")).toBe(true);
    expect(canOperatorPerformOrderTransition("ready_to_grant", "user_link_pending")).toBe(true);
  });

  it("requires manager for every cancellation/refund transition", () => {
    const nonTerminal: ExternalOrderStatus[] = [
      "draft",
      "payment_pending",
      "payment_confirmed",
      "user_link_pending",
      "plot_assignment_pending",
      "partially_assigned",
      "ready_to_grant",
      "rights_granted",
    ];
    for (const status of nonTerminal) {
      expect(canOperatorPerformOrderTransition(status, "cancel_pending")).toBe(false);
    }
    expect(canOperatorPerformOrderTransition("cancel_pending", "cancelled")).toBe(false);
    expect(canOperatorPerformOrderTransition("cancel_pending", "refunded")).toBe(false);
  });

  it("requires manager to resume from on_hold", () => {
    expect(canOperatorPerformOrderTransition("on_hold", "payment_pending")).toBe(false);
    expect(canOperatorPerformOrderTransition("on_hold", "rights_granted")).toBe(false);
  });
});
