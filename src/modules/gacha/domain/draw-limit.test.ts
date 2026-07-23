import { afterEach, describe, expect, it, vi } from "vitest";
import { didJustUnlockMino, isEventWindowActive, type ProvinceRow } from "./draw-limit";

describe("isEventWindowActive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active when both bounds are unset", () => {
    expect(isEventWindowActive(null, null)).toBe(true);
  });

  it("is inactive before the start time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(isEventWindowActive("2026-01-02T00:00:00Z", null)).toBe(false);
  });

  it("is inactive after the end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));
    expect(isEventWindowActive(null, "2026-01-02T00:00:00Z")).toBe(false);
  });

  it("is active within the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(isEventWindowActive("2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z")).toBe(true);
  });
});

describe("didJustUnlockMino", () => {
  const provincesWithMino: ProvinceRow[] = [
    { id: "mino", region: "中部", is_final_province: true, unlock_condition_count: 55 },
    { id: "other", region: "中部", is_final_province: false, unlock_condition_count: null },
  ];

  it("returns true when the new count first reaches the threshold", () => {
    expect(didJustUnlockMino(54, 55, provincesWithMino)).toBe(true);
  });

  it("returns false when already past the threshold before this draw", () => {
    expect(didJustUnlockMino(55, 56, provincesWithMino)).toBe(false);
  });

  it("returns false when still below the threshold", () => {
    expect(didJustUnlockMino(10, 11, provincesWithMino)).toBe(false);
  });

  it("returns false when no final province is configured", () => {
    const provincesWithoutMino: ProvinceRow[] = [{ id: "other", region: "中部", is_final_province: false, unlock_condition_count: null }];
    expect(didJustUnlockMino(54, 55, provincesWithoutMino)).toBe(false);
  });
});
