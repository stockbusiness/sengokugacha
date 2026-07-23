import { describe, expect, it } from "vitest";
import { isSourceSystemKeyConsistent, isSupportedEventVersion, resolveEventId } from "./event-envelope";

describe("isSupportedEventVersion", () => {
  it("accepts the currently supported version", () => {
    expect(isSupportedEventVersion("1.0")).toBe(true);
  });

  it("rejects an unsupported version", () => {
    expect(isSupportedEventVersion("2.0")).toBe(false);
    expect(isSupportedEventVersion("")).toBe(false);
  });
});

describe("resolveEventId", () => {
  it("uses the Idempotency-Key header when body.event_id is absent", () => {
    expect(resolveEventId({ idempotencyKeyHeader: "evt_1", bodyEventId: null })).toEqual({
      ok: true,
      eventId: "evt_1",
    });
  });

  it("uses body.event_id when the Idempotency-Key header is absent", () => {
    expect(resolveEventId({ idempotencyKeyHeader: null, bodyEventId: "evt_1" })).toEqual({
      ok: true,
      eventId: "evt_1",
    });
  });

  it("accepts matching header and body values", () => {
    expect(resolveEventId({ idempotencyKeyHeader: "evt_1", bodyEventId: "evt_1" })).toEqual({
      ok: true,
      eventId: "evt_1",
    });
  });

  it("rejects mismatched header and body values (P0-2 bug#7)", () => {
    expect(resolveEventId({ idempotencyKeyHeader: "evt_1", bodyEventId: "evt_2" })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("reports missing when neither is present", () => {
    expect(resolveEventId({ idempotencyKeyHeader: null, bodyEventId: null })).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});

describe("isSourceSystemKeyConsistent", () => {
  it("treats an omitted body.source_system_key as consistent", () => {
    expect(isSourceSystemKeyConsistent(null, "sengoku-passport")).toBe(true);
  });

  it("accepts a body value that matches the authenticated identity", () => {
    expect(isSourceSystemKeyConsistent("sengoku-passport", "sengoku-passport")).toBe(true);
  });

  it("rejects a body value that does not match the authenticated identity", () => {
    expect(isSourceSystemKeyConsistent("other-system", "sengoku-passport")).toBe(false);
  });
});
