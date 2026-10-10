import { describe, it, expect } from "vitest";
import { planVersionsCacheUpdate } from "../versions-cache-plan";

const base = {
  isOnCanvas: (id: string) => id === "on-canvas",
  openFocusViewIds: [] as string[],
  isShowing: () => false,
};

describe("planVersionsCacheUpdate", () => {
  it("ignores a change on a node that isn't on this canvas", () => {
    expect(planVersionsCacheUpdate({ ...base, changedNodeId: "elsewhere" })).toBe("ignore");
  });

  it("leaves a node whose focus view is open to that view, which refreshes itself", () => {
    expect(
      planVersionsCacheUpdate({ ...base, changedNodeId: "on-canvas", openFocusViewIds: ["on-canvas"] }),
    ).toBe("ignore");
  });

  it("re-reads versions something on screen is showing — the image view's connected prompt", () => {
    expect(
      planVersionsCacheUpdate({ ...base, changedNodeId: "on-canvas", isShowing: () => true }),
    ).toBe("refetch");
  });

  it("drops cached versions nothing is showing, so the next open reads them fresh", () => {
    expect(planVersionsCacheUpdate({ ...base, changedNodeId: "on-canvas" })).toBe("drop");
  });

  it("marks everything stale for a change it cannot place", () => {
    expect(planVersionsCacheUpdate({ ...base, changedNodeId: null })).toBe("mark-all-stale");
  });
});
