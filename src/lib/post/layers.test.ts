import { describe, it, expect } from "vitest";
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
  toggleLock,
  toggleHidden,
  findLayer,
} from "./layers";

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
    expect(findLayer(result, a.id)?.text).toBe("A2");
    expect(findLayer(result, b.id)?.text).toBe("B");
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
