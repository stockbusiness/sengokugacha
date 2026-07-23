import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSessionJwt, verifySessionJwt } from "./index";

describe("signSessionJwt / verifySessionJwt", () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-value-for-unit-tests";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("round-trips claims through sign and verify", async () => {
    const token = await signSessionJwt({ userId: "user-1" }, 3600);
    const payload = await verifySessionJwt(token);
    expect(payload?.userId).toBe("user-1");
  });

  it("preserves arbitrary claim shapes (role/adminRole/agentId etc.)", async () => {
    const token = await signSessionJwt({ role: "admin", actorName: "tanaka", adminRole: "operator" }, 3600);
    const payload = await verifySessionJwt(token);
    expect(payload).toMatchObject({ role: "admin", actorName: "tanaka", adminRole: "operator" });
  });

  it("returns null for a malformed token", async () => {
    expect(await verifySessionJwt("not-a-valid-jwt")).toBeNull();
  });

  it("returns null once the token has already expired", async () => {
    const token = await signSessionJwt({ userId: "user-1" }, -1);
    expect(await verifySessionJwt(token)).toBeNull();
  });

  it("returns null when verifying with a different secret than it was signed with", async () => {
    const token = await signSessionJwt({ userId: "user-1" }, 3600);
    process.env.SESSION_SECRET = "a-completely-different-secret";
    expect(await verifySessionJwt(token)).toBeNull();
  });

  it("throws when SESSION_SECRET is not configured", async () => {
    delete process.env.SESSION_SECRET;
    await expect(signSessionJwt({ userId: "user-1" }, 3600)).rejects.toThrow("SESSION_SECRET");
  });
});
