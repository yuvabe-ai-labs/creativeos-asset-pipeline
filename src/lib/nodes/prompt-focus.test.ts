import { describe, it, expect } from "vitest";
import {
  describeApprovalPill,
  buildVersionChips,
} from "./prompt-focus";

describe("describeApprovalPill", () => {
  it("maps approved to a positive 'Approved' pill", () => {
    expect(describeApprovalPill("approved")).toEqual({ label: "Approved", tone: "positive" });
  });
  it("maps changes_requested to a warning 'Needs changes' pill", () => {
    expect(describeApprovalPill("changes_requested")).toEqual({ label: "Needs changes", tone: "warning" });
  });
  it("maps pending to a neutral 'Pending review' pill", () => {
    expect(describeApprovalPill("pending")).toEqual({ label: "Pending review", tone: "neutral" });
  });
});

describe("buildVersionChips", () => {
  const versions = [
    { id: "c", error: null }, // newest first (index 0) -> highest v number
    { id: "b", error: "boom" },
    { id: "a", error: null },
  ];

  it("numbers newest-first as v{total - index} and marks the active chip", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.map((c) => c.label)).toEqual(["v3", "v2", "v1"]);
    expect(chips.find((c) => c.id === "a")?.isActive).toBe(true);
    expect(chips.find((c) => c.id === "c")?.isActive).toBe(false);
  });

  it("disables the active chip, error chips, and (while restoring) all chips", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.find((c) => c.id === "a")?.disabled).toBe(true); // active
    expect(chips.find((c) => c.id === "b")?.disabled).toBe(true); // error
    expect(chips.find((c) => c.id === "b")?.isError).toBe(true);
    expect(chips.find((c) => c.id === "c")?.disabled).toBe(false); // clickable

    const restoring = buildVersionChips(versions, "a", true);
    expect(restoring.every((c) => c.disabled)).toBe(true);
  });

  it("returns an empty array for no versions", () => {
    expect(buildVersionChips([], null, false)).toEqual([]);
  });
});
