import { describe, it, expect, vi } from "vitest";
import { planAddFromUrl, startAddFromUrl } from "../add-from-url";

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

describe("startAddFromUrl", () => {
  const HREF = "http://localhost:3000/clients/acme/canvases/reel-12?addScript=s1&node=n9#x";

  it("removes ?addScript from the URL itself, synchronously, before the add starts (nothing added twice on a quick reload)", () => {
    const order: string[] = [];
    const replaceUrl = vi.fn((u: string) => void order.push(`url:${u}`));
    const add = vi.fn(() => void order.push("add"));
    const ran = startAddFromUrl({ href: HREF, canEdit: true, nodes: [kb, emptyScript], replaceUrl, add });
    expect(ran).toBe(true);
    expect(order).toEqual(["url:/clients/acme/canvases/reel-12?node=n9#x", "add"]);
    expect(add).toHaveBeenCalledWith("s1", "seeded", { x: 360, y: 120 });
  });

  it("touches neither the URL nor the canvas while it must wait or has nothing to add", () => {
    const replaceUrl = vi.fn();
    const add = vi.fn();
    expect(startAddFromUrl({ href: HREF, canEdit: false, nodes: [emptyScript], replaceUrl, add })).toBe(false);
    expect(startAddFromUrl({ href: "http://localhost:3000/clients/acme/canvases/reel-12", canEdit: true, nodes: [], replaceUrl, add })).toBe(false);
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
