import { describe, it, expect } from "vitest";
import type { TextLayer } from "./types";
import {
  createTextLayer,
  createShapeLayer,
  createImageLayer,
  createIconLayer,
  addLayer,
  removeLayer,
  updateLayer,
  duplicateLayer,
  reorderLayer,
  reorderLayerToIndex,
  toggleLock,
  toggleHidden,
  findLayer,
  groupLayers,
  ungroupLayers,
  copyLayers,
  pasteLayers,
} from "./layers";
import type { GroupLayer } from "./types";

describe("layer factories", () => {
  it("createTextLayer has sane defaults and a unique id", () => {
    const a = createTextLayer();
    const b = createTextLayer();
    expect(a.kind).toBe("text");
    expect(a.text).toBe("Text");
    expect(a.id).not.toBe(b.id);
  });

  it("factories accept overrides", () => {
    const layer = createTextLayer({ text: "Diwali Offer", x: 0.2 });
    expect(layer.text).toBe("Diwali Offer");
    expect(layer.x).toBe(0.2);
  });

  it("createShapeLayer defaults to a solid fill", () => {
    expect(createShapeLayer().fill).toEqual({ kind: "solid", color: "#5829c7" });
  });

  it("createImageLayer stores the given source", () => {
    const layer = createImageLayer({ kind: "url", url: "https://x/y.png" });
    expect(layer.src).toEqual({ kind: "url", url: "https://x/y.png" });
    expect(layer.fit).toBe("cover");
  });

  it("createIconLayer stores the given source", () => {
    const layer = createIconLayer({ kind: "lucide", name: "phone" });
    expect(layer.src).toEqual({ kind: "lucide", name: "phone" });
  });
});

describe("addLayer / removeLayer", () => {
  it("appends — arrays are back-to-front, so appended = front-most", () => {
    const a = createTextLayer({ name: "a" });
    const b = createTextLayer({ name: "b" });
    const layers = addLayer(addLayer([], a), b);
    expect(layers.map((l) => l.name)).toEqual(["a", "b"]);
  });

  it("removeLayer drops only the matching id", () => {
    const a = createTextLayer();
    const b = createTextLayer();
    expect(removeLayer([a, b], a.id)).toEqual([b]);
  });
});

describe("updateLayer", () => {
  it("patches only the matching layer, leaves others untouched", () => {
    const a = createTextLayer({ text: "A" });
    const b = createTextLayer({ text: "B" });
    const result = updateLayer([a, b], a.id, { text: "A2" });
    expect((findLayer(result, a.id) as TextLayer)?.text).toBe("A2");
    expect((findLayer(result, b.id) as TextLayer)?.text).toBe("B");
  });

  it("does not mutate the input array", () => {
    const a = createTextLayer({ text: "A" });
    const original = [a];
    updateLayer(original, a.id, { text: "changed" });
    expect(original[0].text).toBe("A");
  });
});

describe("duplicateLayer", () => {
  it("inserts a copy immediately after the original with a new id, nudged position", () => {
    const a = createTextLayer({ x: 0.1, y: 0.1 });
    const result = duplicateLayer([a], a.id);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(a.id);
    expect(result[1].id).not.toBe(a.id);
    expect(result[1].x).toBeCloseTo(0.12, 5);
    expect(result[1].y).toBeCloseTo(0.12, 5);
  });

  it("is a no-op for an unknown id", () => {
    const a = createTextLayer();
    expect(duplicateLayer([a], "missing")).toEqual([a]);
  });
});

describe("reorderLayer", () => {
  const mk = (name: string) => createTextLayer({ name });
  it("front moves the layer to the end of the array", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayer([a, b, c], a.id, "front").map((l) => l.name)).toEqual(["b", "c", "a"]);
  });
  it("back moves the layer to the start", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayer([a, b, c], c.id, "back").map((l) => l.name)).toEqual(["c", "a", "b"]);
  });
  it("forward swaps with the next layer", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayer([a, b, c], a.id, "forward").map((l) => l.name)).toEqual(["b", "a", "c"]);
  });
  it("backward swaps with the previous layer", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayer([a, b, c], c.id, "backward").map((l) => l.name)).toEqual(["a", "c", "b"]);
  });
  it("forward at the end and backward at the start are no-ops", () => {
    const [a, b] = [mk("a"), mk("b")];
    expect(reorderLayer([a, b], b.id, "forward").map((l) => l.name)).toEqual(["a", "b"]);
    expect(reorderLayer([a, b], a.id, "backward").map((l) => l.name)).toEqual(["a", "b"]);
  });
});

describe("reorderLayerToIndex", () => {
  const mk = (name: string) => createTextLayer({ name });
  it("moving an earlier layer onto a later index lands it just after the (now-shifted) target", () => {
    const [a, b, c, d] = [mk("a"), mk("b"), mk("c"), mk("d")];
    // a (idx 0) -> targetIndex 2 (c's original index)
    expect(reorderLayerToIndex([a, b, c, d], a.id, 2).map((l) => l.name)).toEqual(["b", "c", "a", "d"]);
  });
  it("moving a later layer onto an earlier index lands it just before the target", () => {
    const [a, b, c, d] = [mk("a"), mk("b"), mk("c"), mk("d")];
    // d (idx 3) -> targetIndex 1 (b's original index)
    expect(reorderLayerToIndex([a, b, c, d], d.id, 1).map((l) => l.name)).toEqual(["a", "d", "b", "c"]);
  });
  it("is a no-op when the target index equals the current index", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayerToIndex([a, b, c], b.id, 1).map((l) => l.name)).toEqual(["a", "b", "c"]);
  });
  it("clamps an out-of-range target index to the array's bounds", () => {
    const [a, b, c] = [mk("a"), mk("b"), mk("c")];
    expect(reorderLayerToIndex([a, b, c], a.id, 99).map((l) => l.name)).toEqual(["b", "c", "a"]);
    expect(reorderLayerToIndex([a, b, c], c.id, -5).map((l) => l.name)).toEqual(["c", "a", "b"]);
  });
  it("is a no-op for an unknown id", () => {
    const a = createTextLayer();
    expect(reorderLayerToIndex([a], "missing", 0)).toEqual([a]);
  });
});

describe("toggleLock / toggleHidden", () => {
  it("flips locked from undefined -> true -> false", () => {
    const a = createTextLayer();
    const once = toggleLock([a], a.id);
    expect(findLayer(once, a.id)?.locked).toBe(true);
    const twice = toggleLock(once, a.id);
    expect(findLayer(twice, a.id)?.locked).toBe(false);
  });

  it("flips hidden independently of locked", () => {
    const a = createTextLayer();
    const result = toggleHidden([a], a.id);
    expect(findLayer(result, a.id)?.hidden).toBe(true);
    expect(findLayer(result, a.id)?.locked).toBeFalsy();
  });
});

describe("groupLayers", () => {
  it("removes the grouped layers and inserts a GroupLayer at the frontmost original position", () => {
    const a = createTextLayer({ name: "a", x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.2, w: 0.1, h: 0.3 });
    const c = createTextLayer({ name: "c", x: 0.5, y: 0.5, w: 0.1, h: 0.1 }); // not grouped
    const result = groupLayers([a, b, c], [a.id, b.id]);
    expect(result).toHaveLength(2); // group + c
    const group = result.find((l) => l.kind === "group") as GroupLayer;
    expect(group).toBeDefined();
    expect(group.childIds).toEqual([a.id, b.id]);
    // group's own box is the bounding box of a and b: x in [0.1, 0.4], y in [0.1, 0.5]
    expect(group.x).toBeCloseTo(0.1, 5);
    expect(group.y).toBeCloseTo(0.1, 5);
    expect(group.w).toBeCloseTo(0.3, 5); // 0.4 - 0.1
    expect(group.h).toBeCloseTo(0.4, 5); // 0.5 - 0.1
    // b (frontmost of the two grouped layers, original index 1) is grouped away; c (index 2,
    // never grouped) was originally in front of the whole group, so it stays in front — the
    // group lands at index 0, preserving stacking order relative to every non-grouped layer.
    // (This is also required for ungroupLayers to round-trip back to the original [a, b, c]
    // order below — see the "ungroupLayers" describe block.)
    expect(result[0].kind).toBe("group");
  });

  it("is a no-op if fewer than 2 ids are given", () => {
    const a = createTextLayer();
    expect(groupLayers([a], [a.id])).toEqual([a]);
    expect(groupLayers([a], [])).toEqual([a]);
  });

  it("ignores ids that don't match any layer", () => {
    const a = createTextLayer();
    const b = createShapeLayer();
    const result = groupLayers([a, b], [a.id, b.id, "missing-id"]);
    const group = result.find((l) => l.kind === "group") as GroupLayer;
    expect(group.childIds).toEqual([a.id, b.id]);
  });
});

describe("ungroupLayers", () => {
  it("removes the group and reinserts its children in childIds order at the group's position", () => {
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const c = createTextLayer({ name: "c" });
    const grouped = groupLayers([a, b, c], [a.id, b.id]);
    const result = ungroupLayers(grouped, (grouped.find((l) => l.kind === "group") as GroupLayer).id);
    expect(result.map((l) => l.name)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an unknown group id", () => {
    const a = createTextLayer();
    expect(ungroupLayers([a], "missing")).toEqual([a]);
  });

  it("is a no-op if the id refers to a non-group layer", () => {
    const a = createTextLayer();
    expect(ungroupLayers([a], a.id)).toEqual([a]);
  });
});

describe("copyLayers / pasteLayers", () => {
  it("copyLayers returns deep copies with fresh ids, does not mutate the input", () => {
    const a = createTextLayer({ text: "hello" });
    const copies = copyLayers([a], [a.id]);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe(a.id);
    expect((copies[0] as typeof a).text).toBe("hello");
  });

  it("pasteLayers appends nudged fresh-id copies from the clipboard onto the layer array", () => {
    const a = createTextLayer({ x: 0.1, y: 0.1 });
    const clipboard = copyLayers([a], [a.id]);
    const result = pasteLayers([a], clipboard);
    expect(result).toHaveLength(2);
    expect(result[1].id).not.toBe(a.id);
    expect(result[1].id).not.toBe(clipboard[0].id); // paste re-freshens ids again, not reusing clipboard's
    expect(result[1].x).toBeCloseTo(0.12, 5);
    expect(result[1].y).toBeCloseTo(0.12, 5);
  });

  it("pasting twice in a row does not collide ids", () => {
    const a = createTextLayer();
    const clipboard = copyLayers([a], [a.id]);
    const once = pasteLayers([a], clipboard);
    const twice = pasteLayers(once, clipboard);
    const ids = twice.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("copyLayers regenerates a GroupLayer's child ids too, keeping children/childIds consistent", () => {
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;
    const [copy] = copyLayers(grouped, [group.id]) as [GroupLayer];

    expect(copy.id).not.toBe(group.id);
    expect(copy.childIds).toHaveLength(2);
    // fresh ids, none reused from the original group's children
    expect(copy.childIds).not.toEqual(group.childIds);
    for (const id of copy.childIds) {
      expect(group.childIds).not.toContain(id);
    }
    // children stays in sync with childIds
    expect(copy.children?.map((c) => c.id)).toEqual(copy.childIds);
    // child payload (e.g. names) is preserved, only ids changed
    expect(copy.children?.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("copy -> paste -> ungroup both copies of a group does not collide child ids", () => {
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;

    const clipboard = copyLayers(grouped, [group.id]);
    const pasted = pasteLayers(grouped, clipboard);
    const pastedGroup = pasted.find(
      (l) => l.kind === "group" && l.id !== group.id,
    ) as GroupLayer;

    const ungroupedOriginal = ungroupLayers(pasted, group.id);
    const ungroupedBoth = ungroupLayers(ungroupedOriginal, pastedGroup.id);

    const ids = ungroupedBoth.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // both sets of children (4 total: a, b, and their copies) survive
    expect(ungroupedBoth).toHaveLength(4);
  });

  it("copy -> paste -> ungroup a NESTED group (group containing a group) does not collide ids at any depth", () => {
    // Build inner = group(a, b), then outer = group(inner, c) — a group whose OWN child is
    // itself a GroupLayer. groupLayers has no guard against this, so nesting is reachable today.
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const inner = groupLayers([a, b], [a.id, b.id]).find((l) => l.kind === "group") as GroupLayer;

    const c = createTextLayer({ name: "c" });
    const outerLayers = groupLayers([inner, c], [inner.id, c.id]);
    const outer = outerLayers.find((l) => l.kind === "group") as GroupLayer;

    const clipboard = copyLayers(outerLayers, [outer.id]);
    const pasted = pasteLayers(outerLayers, clipboard);
    const outerCopy = pasted.find((l) => l.kind === "group" && l.id !== outer.id) as GroupLayer;

    // Sanity: the copy's nested inner group also got a fresh id/child ids, distinct from the
    // original inner group's — a flat (non-recursive) refreshIds would fail this, since it only
    // swaps the outer group's direct children's ids and leaves the inner group's own
    // childIds/children pointing at the ORIGINAL a/b ids.
    const innerCopyRef = (outerCopy.children ?? []).find((ch) => ch.kind === "group") as GroupLayer;
    expect(innerCopyRef.id).not.toBe(inner.id);
    expect(innerCopyRef.childIds).not.toEqual(inner.childIds);
    expect(innerCopyRef.childIds).not.toContain(a.id);
    expect(innerCopyRef.childIds).not.toContain(b.id);

    // Ungroup both outer groups, then both (now top-level) inner groups — fully flattening to
    // individual layers: a, b, c, and their three copies.
    let flat = ungroupLayers(pasted, outer.id);
    flat = ungroupLayers(flat, outerCopy.id);
    const innerAfter = flat.filter((l) => l.kind === "group") as GroupLayer[];
    expect(innerAfter).toHaveLength(2); // original inner group + its copy, both now top-level
    for (const g of innerAfter) {
      flat = ungroupLayers(flat, g.id);
    }

    const ids = flat.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length); // no collisions at any depth
    expect(flat).toHaveLength(6); // a, b, c + copies of each
  });

  it("duplicateLayer regenerates a GroupLayer's child ids too", () => {
    const a = createTextLayer({ name: "a" });
    const b = createShapeLayer({ name: "b" });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;

    const result = duplicateLayer(grouped, group.id);
    const copy = result.find((l) => l.kind === "group" && l.id !== group.id) as GroupLayer;

    expect(copy).toBeDefined();
    expect(copy.childIds).not.toEqual(group.childIds);
    for (const id of copy.childIds) {
      expect(group.childIds).not.toContain(id);
    }
    expect(copy.children?.map((c) => c.id)).toEqual(copy.childIds);
  });
});

describe("ungroupLayers — carries a moved/resized group's transform to its children (Fix 3)", () => {
  it("applies the group's x/y delta since creation to each child before reinserting", () => {
    const a = createTextLayer({ name: "a", x: 0.15, y: 0.2, w: 0.1, h: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.25, w: 0.1, h: 0.1 });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;
    expect(group.x).toBeCloseTo(0.15, 5); // creation-time box origin (min of a.x, b.x)

    // Move the group as if the user dragged it: x 0.15 -> 0.35 (delta +0.2), y unchanged.
    const moved = updateLayer(grouped, group.id, { x: 0.35 });
    const result = ungroupLayers(moved, group.id);

    const outA = result.find((l) => l.name === "a")!;
    const outB = result.find((l) => l.name === "b")!;
    // a was at x=0.15 -> 0.35; b was at x=0.3 -> 0.5. y untouched.
    expect(outA.x).toBeCloseTo(0.35, 5);
    expect(outA.y).toBeCloseTo(0.2, 5);
    expect(outB.x).toBeCloseTo(0.5, 5);
    expect(outB.y).toBeCloseTo(0.25, 5);
  });

  it("applies zero delta (reinserts children unchanged) when the group was never moved", () => {
    const a = createTextLayer({ name: "a", x: 0.15, y: 0.2 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.25 });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;
    const result = ungroupLayers(grouped, group.id);

    expect(result.find((l) => l.name === "a")?.x).toBeCloseTo(0.15, 5);
    expect(result.find((l) => l.name === "b")?.x).toBeCloseTo(0.3, 5);
  });

  it("applies both x and y deltas together", () => {
    const a = createTextLayer({ name: "a", x: 0.1, y: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.2, y: 0.2 });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;

    const moved = updateLayer(grouped, group.id, {
      x: group.x - 0.05,
      y: group.y + 0.1,
    });
    const result = ungroupLayers(moved, group.id);

    expect(result.find((l) => l.name === "a")?.x).toBeCloseTo(0.05, 5);
    expect(result.find((l) => l.name === "a")?.y).toBeCloseTo(0.2, 5);
    expect(result.find((l) => l.name === "b")?.x).toBeCloseTo(0.15, 5);
    expect(result.find((l) => l.name === "b")?.y).toBeCloseTo(0.3, 5);
  });

  it("applies the group's resize (scale) delta to each child's position AND size", () => {
    // a: x=0.1,y=0.1,w=0.2,h=0.1  b: x=0.3,y=0.2,w=0.1,h=0.3
    // group's origin box (bounding box of a,b): x=0.1, y=0.1, w=0.3, h=0.4
    const a = createTextLayer({ name: "a", x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.2, w: 0.1, h: 0.3 });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;
    expect(group.originBox?.x).toBeCloseTo(0.1, 5);
    expect(group.originBox?.y).toBeCloseTo(0.1, 5);
    expect(group.originBox?.w).toBeCloseTo(0.3, 5);
    expect(group.originBox?.h).toBeCloseTo(0.4, 5);
    expect(group.originBox?.rotation).toBe(0);

    // Resize the group as if the user dragged the bottom-right handle: top-left (x,y) stays put,
    // w/h double (0.3 -> 0.6, 0.4 -> 0.8) => scaleX = scaleY = 2.
    const resized = updateLayer(grouped, group.id, { w: 0.6, h: 0.8 });
    const result = ungroupLayers(resized, group.id);

    // Hand computation:
    // a: offsetX = 0.1 - 0.1 = 0   -> newX = 0.1 + 0*2   = 0.1   ; newW = 0.2*2 = 0.4
    //    offsetY = 0.1 - 0.1 = 0   -> newY = 0.1 + 0*2   = 0.1   ; newH = 0.1*2 = 0.2
    // b: offsetX = 0.3 - 0.1 = 0.2 -> newX = 0.1 + 0.2*2 = 0.5   ; newW = 0.1*2 = 0.2
    //    offsetY = 0.2 - 0.1 = 0.1 -> newY = 0.1 + 0.1*2 = 0.3   ; newH = 0.3*2 = 0.6
    const outA = result.find((l) => l.name === "a")!;
    const outB = result.find((l) => l.name === "b")!;
    expect(outA.x).toBeCloseTo(0.1, 5);
    expect(outA.y).toBeCloseTo(0.1, 5);
    expect(outA.w).toBeCloseTo(0.4, 5);
    expect(outA.h).toBeCloseTo(0.2, 5);
    expect(outB.x).toBeCloseTo(0.5, 5);
    expect(outB.y).toBeCloseTo(0.3, 5);
    expect(outB.w).toBeCloseTo(0.2, 5);
    expect(outB.h).toBeCloseTo(0.6, 5);
  });

  it("applies the group's rotation delta additively to each child's own rotation, without moving position", () => {
    const a = createTextLayer({ name: "a", x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    const b = createShapeLayer({ name: "b", x: 0.3, y: 0.2, w: 0.1, h: 0.3 });
    const grouped = groupLayers([a, b], [a.id, b.id]);
    const group = grouped.find((l) => l.kind === "group") as GroupLayer;
    expect(group.rotation).toBe(0);

    // Rotate the group only (x/y/w/h unchanged) from 0 -> 45deg. Since the group's box didn't
    // move or resize, scaleX = scaleY = 1 and the translation delta is 0, so children's x/y/w/h
    // are reproduced unchanged (offsetX/Y * 1 + group.x/y, which equals the original x/y since
    // group.x/y == originBox.x/y here) — only `rotation` changes, additively (dRotation = 45).
    const rotated = updateLayer(grouped, group.id, { rotation: 45 });
    const result = ungroupLayers(rotated, group.id);

    const outA = result.find((l) => l.name === "a")!;
    const outB = result.find((l) => l.name === "b")!;
    expect(outA.x).toBeCloseTo(0.1, 5);
    expect(outA.y).toBeCloseTo(0.1, 5);
    expect(outA.rotation).toBeCloseTo(45, 5); // was undefined/0 -> 0 + 45
    expect(outB.x).toBeCloseTo(0.3, 5);
    expect(outB.y).toBeCloseTo(0.2, 5);
    expect(outB.rotation).toBeCloseTo(45, 5);
  });
});
