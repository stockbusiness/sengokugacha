import { describe, expect, it } from "vitest";
import { formatDateInTimezone } from "./index";

describe("formatDateInTimezone", () => {
  it("formats using the given timezone, not the host timezone", () => {
    // UTC 2026-07-22T15:30:00Z is 2026-07-23T00:30:00 in Asia/Tokyo (UTC+9).
    const date = new Date("2026-07-22T15:30:00Z");
    expect(formatDateInTimezone(date, "UTC")).toBe("2026-07-22");
    expect(formatDateInTimezone(date, "Asia/Tokyo")).toBe("2026-07-23");
  });

  it("pads single-digit month and day with zeros", () => {
    const date = new Date("2026-01-05T00:00:00Z");
    expect(formatDateInTimezone(date, "UTC")).toBe("2026-01-05");
  });
});
