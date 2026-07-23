import { describe, expect, it } from "vitest";
import { decideStripeInboxAction } from "./stripe-inbox";

describe("decideStripeInboxAction", () => {
  it("processes as a brand new event when no inbox row exists yet", () => {
    expect(decideStripeInboxAction(null)).toEqual({ type: "process", attemptCount: 1 });
  });

  it("skips as a duplicate when the existing row already succeeded", () => {
    expect(decideStripeInboxAction({ status: "succeeded", attempt_count: 1 })).toEqual({ type: "skip_duplicate" });
  });

  it("reprocesses and increments the attempt count when the existing row previously failed", () => {
    expect(decideStripeInboxAction({ status: "failed", attempt_count: 1 })).toEqual({
      type: "process",
      attemptCount: 2,
    });
  });

  it("reprocesses a row still stuck in processing (e.g. crashed mid-handler)", () => {
    expect(decideStripeInboxAction({ status: "processing", attempt_count: 1 })).toEqual({
      type: "process",
      attemptCount: 2,
    });
  });

  it("treats a null attempt_count as zero before incrementing", () => {
    expect(decideStripeInboxAction({ status: "failed", attempt_count: null })).toEqual({
      type: "process",
      attemptCount: 1,
    });
  });
});
