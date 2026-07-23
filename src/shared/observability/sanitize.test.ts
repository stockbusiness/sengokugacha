import { describe, expect, it } from "vitest";
import { sanitizeLogContext } from "./index";

describe("sanitizeLogContext", () => {
  it("redacts keys that look sensitive", () => {
    const result = sanitizeLogContext({
      password: "hunter2",
      api_key: "sk_live_xxx",
      line_user_id: "U1234567890",
      email: "user@example.com",
      userId: "safe-value",
    });
    expect(result).toEqual({
      password: "[redacted]",
      api_key: "[redacted]",
      line_user_id: "[redacted]",
      email: "[redacted]",
      userId: "safe-value",
    });
  });

  it("passes through when no sensitive keys are present", () => {
    expect(sanitizeLogContext({ purchaseId: "p1", amount: 100 })).toEqual({ purchaseId: "p1", amount: 100 });
  });

  it("returns undefined when no context is given", () => {
    expect(sanitizeLogContext(undefined)).toBeUndefined();
  });
});
