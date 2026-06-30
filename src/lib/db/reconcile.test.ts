import { describe, it, expect } from "vitest";
import { planReconcile } from "./reconcile";

describe("planReconcile", () => {
  it("never deletes a node that is not in my removed list (the regression case)", () => {
    // DB has {1,2,3,4}; my snapshot is {1,2,3} but I removed nothing.
    // Node 4 (added by another session) must NOT be deleted.
    const { deleteIds } = planReconcile(["1", "2", "3"], []);
    expect(deleteIds).toEqual([]);
  });

  it("deletes only ids I explicitly removed", () => {
    const { deleteIds } = planReconcile(["1", "3"], ["2"]);
    expect(deleteIds).toEqual(["2"]);
  });

  it("keeps a removed-then-readded id (still present in the snapshot)", () => {
    const { deleteIds } = planReconcile(["1", "2"], ["2"]);
    expect(deleteIds).toEqual([]);
  });

  it("dedupes repeated removed ids", () => {
    const { deleteIds } = planReconcile([], ["9", "9"]);
    expect(deleteIds).toEqual(["9"]);
  });
});
