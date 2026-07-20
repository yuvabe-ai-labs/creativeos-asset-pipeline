import { describe, it, expect } from "vitest";
import { nodeHandle, nodeLabel, resolveMentions } from "./describe-node";

// A node's ref handle is a STABLE, human-visible identity derived purely from its
// immutable uuid + type — so untitled same-type nodes are still distinguishable, and
// a reference made in chat keeps pointing at the same node forever.
const id1 = "a3f9e1c2-0000-4000-8000-000000000000";
const id2 = "7c2b0000-0000-4000-8000-000000000000";

describe("nodeHandle", () => {
  it("prefixes a per-type abbreviation and the first 4 uuid chars, upper-cased", () => {
    expect(nodeHandle({ id: id1, type: "prompt" })).toBe("PRM-A3F9");
    expect(nodeHandle({ id: id1, type: "image-gen" })).toBe("IMG-A3F9");
    expect(nodeHandle({ id: id2, type: "shot" })).toBe("SHOT-7C2B");
  });

  it("is deterministic — same id+type always yields the same handle", () => {
    expect(nodeHandle({ id: id1, type: "prompt" })).toBe(
      nodeHandle({ id: id1, type: "prompt" }),
    );
  });

  it("is stable — the handle does not depend on mutable data", () => {
    // (nodeHandle takes no data at all; this documents the guarantee.)
    expect(nodeHandle({ id: id1, type: "prompt" })).toBe("PRM-A3F9");
  });

  it("distinguishes different nodes of the same type", () => {
    expect(nodeHandle({ id: id1, type: "prompt" })).not.toBe(
      nodeHandle({ id: id2, type: "prompt" }),
    );
  });

  it("falls back to a generic prefix for unknown types", () => {
    expect(nodeHandle({ id: id1, type: "mystery" })).toBe("NODE-A3F9");
    expect(nodeHandle({ id: id1 })).toBe("NODE-A3F9");
  });
});

describe("nodeLabel", () => {
  it("pairs the friendly name with the stable handle", () => {
    const label = nodeLabel({ id: id1, type: "prompt", data: { title: "Hero prompt" } });
    expect(label).toEqual({ name: "Hero prompt", handle: "PRM-A3F9" });
  });

  it("keeps untitled same-type nodes distinguishable via the handle", () => {
    const a = nodeLabel({ id: id1, type: "prompt", data: {} });
    const b = nodeLabel({ id: id2, type: "prompt", data: {} });
    expect(a.name).toBe(b.name); // both fall back to the same friendly name…
    expect(a.handle).not.toBe(b.handle); // …but their handles differ
  });
});

describe("resolveMentions", () => {
  const nodes = [
    { id: id1, type: "prompt" }, // PRM-A3F9
    { id: id2, type: "image-gen" }, // IMG-7C2B
  ];

  it("resolves @handles in the text back to node ids", () => {
    expect(resolveMentions("make @PRM-A3F9 use @IMG-7C2B", nodes)).toEqual([id1, id2]);
  });

  it("is case-insensitive (what the human types need not match casing)", () => {
    expect(resolveMentions("reference @prm-a3f9 please", nodes)).toEqual([id1]);
  });

  it("ignores unknown handles and plain text with no mentions", () => {
    expect(resolveMentions("nothing referenced here", nodes)).toEqual([]);
    expect(resolveMentions("@ZZZ-0000 is not real", nodes)).toEqual([]);
  });
});
