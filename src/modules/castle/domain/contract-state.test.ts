import { describe, expect, it } from "vitest";
import {
  canOperatorPerformTransition,
  CONTRACT_STATUSES,
  isValidContractTransition,
  type ContractStatus,
} from "./contract-state";

describe("isValidContractTransition", () => {
  it("allows the documented happy path draft -> active", () => {
    expect(isValidContractTransition("draft", "screening")).toBe(true);
    expect(isValidContractTransition("screening", "approved")).toBe(true);
    expect(isValidContractTransition("approved", "payment_pending")).toBe(true);
    expect(isValidContractTransition("payment_pending", "training")).toBe(true);
    expect(isValidContractTransition("training", "active")).toBe(true);
  });

  it("allows terminated from every non-terminal status", () => {
    for (const status of CONTRACT_STATUSES) {
      if (status === "terminated") continue;
      expect(isValidContractTransition(status, "terminated")).toBe(true);
    }
  });

  it("rejects any transition out of terminated (terminal state)", () => {
    for (const status of CONTRACT_STATUSES) {
      if (status === "terminated") continue;
      expect(isValidContractTransition("terminated", status)).toBe(false);
    }
  });

  it("allows payment_pending to roll back to approved on payment failure", () => {
    expect(isValidContractTransition("payment_pending", "approved")).toBe(true);
  });

  it("allows active to suspend or expire, and both to return to active", () => {
    expect(isValidContractTransition("active", "suspended")).toBe(true);
    expect(isValidContractTransition("active", "expired")).toBe(true);
    expect(isValidContractTransition("suspended", "active")).toBe(true);
    expect(isValidContractTransition("expired", "active")).toBe(true);
  });

  it("rejects skipping stages (e.g. draft straight to active)", () => {
    expect(isValidContractTransition("draft", "active")).toBe(false);
    expect(isValidContractTransition("screening", "training")).toBe(false);
    expect(isValidContractTransition("approved", "active")).toBe(false);
  });

  it("rejects self-transitions", () => {
    for (const status of CONTRACT_STATUSES) {
      expect(isValidContractTransition(status, status)).toBe(false);
    }
  });
});

describe("canOperatorPerformTransition", () => {
  const OPERATOR_OK: [ContractStatus, ContractStatus][] = [
    ["draft", "screening"],
    ["draft", "terminated"],
    ["screening", "approved"],
    ["screening", "terminated"],
    ["approved", "payment_pending"],
  ];

  it("allows the pre-payment intake/screening transitions", () => {
    for (const [from, to] of OPERATOR_OK) {
      expect(canOperatorPerformTransition(from, to)).toBe(true);
    }
  });

  it("requires manager for every transition from payment_pending onward", () => {
    expect(canOperatorPerformTransition("payment_pending", "training")).toBe(false);
    expect(canOperatorPerformTransition("payment_pending", "approved")).toBe(false);
    expect(canOperatorPerformTransition("training", "active")).toBe(false);
    expect(canOperatorPerformTransition("active", "suspended")).toBe(false);
    expect(canOperatorPerformTransition("suspended", "active")).toBe(false);
    expect(canOperatorPerformTransition("expired", "active")).toBe(false);
  });

  it("requires manager for terminating an approved (pre-payment) contract", () => {
    expect(canOperatorPerformTransition("approved", "terminated")).toBe(false);
  });
});
