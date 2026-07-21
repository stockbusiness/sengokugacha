import { describe, expect, it } from "vitest";
import { isExplicitUnassignment } from "./agency-events";

describe("isExplicitUnassignment", () => {
  it("returns true when body.agent_code is explicitly null", () => {
    expect(isExplicitUnassignment({ agent_code: null }, undefined)).toBe(true);
  });

  it("returns true when body.assigned_agent_code is explicitly null", () => {
    expect(isExplicitUnassignment({ assigned_agent_code: null }, undefined)).toBe(true);
  });

  it("returns true when common_user.assigned_agent_code is explicitly null", () => {
    expect(isExplicitUnassignment({}, { assigned_agent_code: null })).toBe(true);
  });

  it("returns false when the field is simply absent", () => {
    expect(isExplicitUnassignment({}, undefined)).toBe(false);
  });

  it("returns false when the field has a real value", () => {
    expect(isExplicitUnassignment({ agent_code: "AGENT001" }, undefined)).toBe(false);
  });
});
