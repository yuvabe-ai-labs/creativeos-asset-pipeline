import { describe, it, expect } from "vitest";
import {
  storedRefDialect,
  toStoredRefs,
  renderRefs,
  citedRefIds,
  missingRefsMessage,
  singleTakeRefDialect,
  refEntriesOf,
} from "../ref-binding";
import {
  imageRefDialect,
  seedanceImageDialect,
  klingImageDialect,
  serializeSegments,
} from "../prompt-token-dialect";

const LABELS: Record<string, string> = { a: "File: A.png", b: "File: B.png", c: "File: C.png" };
const labelOf = (id: string) => LABELS[id];

describe("toStoredRefs + renderRefs", () => {
  it.each([
    ["Omni", imageRefDialect, "the jar <IMAGE_REF_1> beside <IMAGE_REF_2>", "the jar <IMAGE_REF_0> beside <IMAGE_REF_1>"],
    ["Seedance", seedanceImageDialect, "the jar @Image 2 beside @Image 3", "the jar @Image 1 beside @Image 2"],
    ["Kling", klingImageDialect, "the jar @image_2 beside @image_3", "the jar @image_1 beside @image_2"],
  ])("%s: removing the FIRST image keeps B and C bound to B and C", (_, dialect, written, afterRemoval) => {
    const stored = toStoredRefs(written, dialect(["a", "b", "c"]), labelOf);
    expect(stored).toBe("the jar @[File: B.png](b) beside @[File: C.png](c)");
    const out = renderRefs(stored, dialect(["b", "c"]));
    expect(out.text).toBe(afterRemoval);
    expect(out.missing).toEqual([]);
  });

  it("round-trips to the original text when nothing changed", () => {
    const d = imageRefDialect(["a", "b", "c"]);
    const written = "a <IMAGE_REF_0> and <IMAGE_REF_2>";
    expect(renderRefs(toStoredRefs(written, d, labelOf), d).text).toBe(written);
  });

  it("reports a cited image that is gone and never renumbers it onto a neighbour", () => {
    const stored = "the jar @[File: B.png](b) beside @[File: C.png](c)";
    const out = renderRefs(stored, imageRefDialect(["a", "c"]));
    expect(out.text).toBe("the jar B.png beside <IMAGE_REF_1>");
    expect(out.missing).toEqual([{ id: "b", label: "File: B.png" }]);
  });

  it("passes legacy positional text through unchanged (no migration)", () => {
    const legacy = "the jar <IMAGE_REF_1>";
    expect(renderRefs(legacy, imageRefDialect(["a", "b"]))).toEqual({ text: legacy, missing: [] });
  });

  it("echoes a legacy token past the end rather than inventing a binding", () => {
    const legacy = "the jar <IMAGE_REF_5>";
    expect(renderRefs(legacy, imageRefDialect(["a"])).text).toBe(legacy);
    expect(toStoredRefs(legacy, imageRefDialect(["a"]), labelOf)).toBe(legacy);
  });

  it("handles mixed stored ids and legacy positions", () => {
    const mixed = "@[File: C.png](c) then <IMAGE_REF_0>";
    expect(renderRefs(mixed, imageRefDialect(["a", "c"])).text).toBe("<IMAGE_REF_1> then <IMAGE_REF_0>");
  });
});

describe("storedRefDialect", () => {
  it("parses both forms and always writes ids", () => {
    const d = storedRefDialect(imageRefDialect(["a", "b"]), labelOf);
    const segs = d.parse("x <IMAGE_REF_1> y @[File: A.png](a)");
    expect(serializeSegments(segs, d)).toBe("x @[File: B.png](b) y @[File: A.png](a)");
    expect(d.tokenForId("b", "File: B.png")).toBe("@[File: B.png](b)");
  });
});

describe("citedRefIds", () => {
  it("lists the ids a text cites, from either form, deduplicated", () => {
    expect(citedRefIds("@[B](b) <IMAGE_REF_0> @[B](b)", imageRefDialect(["a", "b"]))).toEqual(["b", "a"]);
  });
});

describe("missingRefsMessage", () => {
  it("names one image", () => {
    expect(missingRefsMessage([{ id: "b", label: "File: Sandals.png" }])).toBe(
      "'Sandals.png' is cited in the prompt but no longer connected — reconnect it or regenerate the prompt.",
    );
  });
  it("names several", () => {
    expect(
      missingRefsMessage([
        { id: "a", label: "File: A.png" },
        { id: "b", label: "File: B.png" },
      ]),
    ).toBe("'A.png' and 'B.png' are cited in the prompt but no longer connected — reconnect them or regenerate the prompt.");
  });
});

describe("singleTakeRefDialect", () => {
  it("gives Omni and Seedance a dialect and the prose targets none", () => {
    expect(singleTakeRefDialect("gemini-omni", ["a"])?.tokenForId("a", "")).toBe("<IMAGE_REF_0>");
    expect(singleTakeRefDialect("seedance", ["a"])?.tokenForId("a", "")).toBe("@Image 1");
    expect(singleTakeRefDialect("veo", ["a"])).toBeNull();
    expect(singleTakeRefDialect("kling", ["a"])).toBeNull();
    expect(singleTakeRefDialect(undefined, ["a"])).toBeNull();
  });
});

describe("refEntriesOf", () => {
  it("keeps visionAttachmentsOf order and names each image", () => {
    const entries = refEntriesOf([
      { nodeId: "s", label: "Shot", type: "shot" },
      { nodeId: "a", label: "File", type: "file", fileKind: "image", fileUrl: "u", name: "A.png" },
      { nodeId: "g", label: "Image", type: "image-gen", fileKind: "image", fileUrl: "v" },
    ]);
    expect(entries).toEqual([
      { id: "a", label: "File: A.png" },
      { id: "g", label: "Image" },
    ]);
  });
});
