import { describe, it, expect } from "vitest";
import { planAddFromUrl } from "../add-from-url";

const kb = { id: "kb", type: "kb", position: { x: 80, y: 120 }, data: {} };
const emptyScript = { id: "seeded", type: "script", position: { x: 360, y: 120 }, data: { title: "" } };
const usedScript = { id: "used", type: "script", position: { x: 0, y: 0 }, data: { title: "Old", source: "| Beat |" } };

describe("planAddFromUrl", () => {
  it("does nothing without the parameter", () => {
    expect(planAddFromUrl({ scriptId: null, canEdit: true, nodes: [kb, emptyScript] })).toEqual({ kind: "none" });
  });
  it("waits while this session cannot edit the canvas (Review Focus 2)", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: false, nodes: [kb, emptyScript] })).toEqual({ kind: "wait" });
  });
  it("fills the new canvas's empty seeded Script node, where it sits", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [kb, usedScript, emptyScript] }))
      .toEqual({ kind: "add", scriptId: "s1", into: "seeded", position: { x: 360, y: 120 } });
  });
  it("adds a new node at the viewport centre when there is no empty Script node (no KB) (Review Focus 3)", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [] })).toEqual({ kind: "add", scriptId: "s1", into: null, position: null });
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [usedScript] })).toEqual({ kind: "add", scriptId: "s1", into: null, position: null });
  });
});
