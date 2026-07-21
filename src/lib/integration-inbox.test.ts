import { describe, expect, it } from "vitest";
import { computePayloadHash } from "./integration-inbox";

describe("computePayloadHash", () => {
  it("returns the same hash for the same raw body", () => {
    const body = '{"event_type":"entitlement.granted","entitlement_id":"ent_1"}';
    expect(computePayloadHash(body)).toBe(computePayloadHash(body));
  });

  it("returns different hashes for different raw bodies", () => {
    const bodyA = '{"entitlement_id":"ent_1"}';
    const bodyB = '{"entitlement_id":"ent_2"}';
    expect(computePayloadHash(bodyA)).not.toBe(computePayloadHash(bodyB));
  });

  it("is sensitive to whitespace differences (compares raw bytes, not parsed JSON)", () => {
    const compact = '{"a":1}';
    const spaced = '{"a": 1}';
    expect(computePayloadHash(compact)).not.toBe(computePayloadHash(spaced));
  });
});
