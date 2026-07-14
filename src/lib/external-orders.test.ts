import { describe, expect, it } from "vitest";
import { computeOrderAssignmentStatus } from "./external-orders";

describe("computeOrderAssignmentStatus", () => {
  it("returns plot_assignment_pending when nothing is assigned yet", () => {
    expect(computeOrderAssignmentStatus([{ quantity: 3, assignedCount: 0 }])).toBe("plot_assignment_pending");
    expect(
      computeOrderAssignmentStatus([
        { quantity: 1, assignedCount: 0 },
        { quantity: 2, assignedCount: 0 },
      ])
    ).toBe("plot_assignment_pending");
  });

  it("returns ready_to_grant when every item is fully assigned (single item)", () => {
    expect(computeOrderAssignmentStatus([{ quantity: 1, assignedCount: 1 }])).toBe("ready_to_grant");
  });

  it("returns ready_to_grant when every item is fully assigned (multiple items, 7-1 multi-plot order)", () => {
    expect(
      computeOrderAssignmentStatus([
        { quantity: 2, assignedCount: 2 },
        { quantity: 1, assignedCount: 1 },
      ])
    ).toBe("ready_to_grant");
  });

  it("returns partially_assigned when some but not all plots are assigned (4-5/7-2)", () => {
    expect(
      computeOrderAssignmentStatus([
        { quantity: 3, assignedCount: 2 },
        { quantity: 1, assignedCount: 1 },
      ])
    ).toBe("partially_assigned");
  });

  it("returns partially_assigned when one item of several has zero assignments", () => {
    expect(
      computeOrderAssignmentStatus([
        { quantity: 1, assignedCount: 1 },
        { quantity: 1, assignedCount: 0 },
      ])
    ).toBe("partially_assigned");
  });

  it("treats an empty item list as plot_assignment_pending", () => {
    expect(computeOrderAssignmentStatus([])).toBe("plot_assignment_pending");
  });
});
