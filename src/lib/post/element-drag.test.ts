import { describe, it, expect } from "vitest";
import { parseElementDrag, serializeElementDrag, type ElementDragPayload } from "./element-drag";

describe("element drag payloads", () => {
  it("round-trips every element kind", () => {
    const payloads: ElementDragPayload[] = [
      { kind: "shape", shape: "star" },
      { kind: "icon", src: { kind: "lucide", name: "phone" } },
      { kind: "text", preset: { text: "Add a heading", fontSize: 0.055, fontWeight: 700 } },
      { kind: "image", url: "https://example.test/a.png" },
      { kind: "connected", nodeId: "node-1" },
    ];
    for (const p of payloads) {
      expect(parseElementDrag(serializeElementDrag(p))).toEqual(p);
    }
  });

  it("returns null for an empty payload, which is what a foreign drag looks like", () => {
    expect(parseElementDrag("")).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    expect(parseElementDrag("{not json")).toBeNull();
    expect(parseElementDrag("[1,2,3")).toBeNull();
  });

  it("rejects JSON that parses but is not a payload", () => {
    expect(parseElementDrag('"just a string"')).toBeNull();
    expect(parseElementDrag("42")).toBeNull();
    expect(parseElementDrag("null")).toBeNull();
    expect(parseElementDrag("[]")).toBeNull();
    expect(parseElementDrag("{}")).toBeNull();
  });

  it("rejects an unknown kind, so a future payload can't be half-applied by an old build", () => {
    expect(parseElementDrag('{"kind":"video","url":"x"}')).toBeNull();
    expect(parseElementDrag('{"kind":123}')).toBeNull();
  });
});
