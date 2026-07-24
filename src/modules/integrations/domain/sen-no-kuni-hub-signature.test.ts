import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildV1SignedPayload,
  buildV2CanonicalString,
  isV1SignatureAllowed,
  resolveSignatureVersion,
} from "./sen-no-kuni-hub-signature";

describe("resolveSignatureVersion", () => {
  it("treats a missing header as v1 (existing connections)", () => {
    expect(resolveSignatureVersion(null)).toBe("1");
  });

  it("accepts an explicit v1 header", () => {
    expect(resolveSignatureVersion("1")).toBe("1");
  });

  it("accepts an explicit v2 header", () => {
    expect(resolveSignatureVersion("2")).toBe("2");
  });

  it("rejects unsupported version values", () => {
    expect(resolveSignatureVersion("3")).toBeNull();
    expect(resolveSignatureVersion("v2")).toBeNull();
    expect(resolveSignatureVersion("")).toBeNull();
  });
});

describe("buildV1SignedPayload", () => {
  it("concatenates timestamp and raw body with a dot", () => {
    expect(buildV1SignedPayload("1700000000", '{"a":1}')).toBe('1700000000.{"a":1}');
  });
});

describe("buildV2CanonicalString", () => {
  const base = {
    keyId: "key-1",
    timestamp: "1700000000",
    nonce: "nonce-1",
    eventVersion: "1.0",
    idempotencyKey: "idem-1",
    rawBody: '{"event_type":"entitlement.granted"}',
  };

  it("joins fields with newlines and a sha256 hex digest of the raw body", () => {
    const expectedHash = crypto.createHash("sha256").update(base.rawBody).digest("hex");
    expect(buildV2CanonicalString(base)).toBe(
      ["key-1", "1700000000", "nonce-1", "1.0", "idem-1", expectedHash].join("\n")
    );
  });

  it("changes when key_id changes", () => {
    expect(buildV2CanonicalString({ ...base, keyId: "key-2" })).not.toBe(buildV2CanonicalString(base));
  });

  it("changes when nonce changes", () => {
    expect(buildV2CanonicalString({ ...base, nonce: "nonce-2" })).not.toBe(buildV2CanonicalString(base));
  });

  it("changes when event_version changes", () => {
    expect(buildV2CanonicalString({ ...base, eventVersion: "2.0" })).not.toBe(buildV2CanonicalString(base));
  });

  it("changes when idempotency_key changes", () => {
    expect(buildV2CanonicalString({ ...base, idempotencyKey: "idem-2" })).not.toBe(buildV2CanonicalString(base));
  });

  it("changes when raw_body changes", () => {
    expect(buildV2CanonicalString({ ...base, rawBody: '{"event_type":"entitlement.revoked"}' })).not.toBe(
      buildV2CanonicalString(base)
    );
  });
});

describe("isV1SignatureAllowed", () => {
  it("allows v1 indefinitely when v1_disabled_at is not set", () => {
    expect(isV1SignatureAllowed(null, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  it("allows v1 before the disabled timestamp", () => {
    expect(isV1SignatureAllowed("2026-08-01T00:00:00Z", new Date("2026-07-01T00:00:00Z"))).toBe(true);
  });

  it("rejects v1 at or after the disabled timestamp", () => {
    expect(isV1SignatureAllowed("2026-08-01T00:00:00Z", new Date("2026-08-01T00:00:00Z"))).toBe(false);
    expect(isV1SignatureAllowed("2026-08-01T00:00:00Z", new Date("2026-09-01T00:00:00Z"))).toBe(false);
  });
});
