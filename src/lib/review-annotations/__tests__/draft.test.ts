import { describe, it, expect } from "vitest";
import { commitDraft, removeDraft } from "../draft";
import type { AnnotationDraft } from "../draft";

function draft(over: Partial<AnnotationDraft> = {}): AnnotationDraft {
  return {
    seq: 0,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    note: "n",
    bounds: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    ...over,
  };
}

describe("commitDraft", () => {
  it("appends with the next continuous seq", () => {
    const one = commitDraft([], draft());
    const two = commitDraft(one, draft({ note: "second" }));
    expect(two.map((d) => d.seq)).toEqual([1, 2]);
    expect(two[1].note).toBe("second");
  });
});

describe("removeDraft", () => {
  it("removes by seq and renumbers the remainder continuously", () => {
    let list = commitDraft([], draft({ note: "a" }));
    list = commitDraft(list, draft({ note: "b" }));
    list = commitDraft(list, draft({ note: "c" }));
    const out = removeDraft(list, 2);
    expect(out.map((d) => [d.seq, d.note])).toEqual([
      [1, "a"],
      [2, "c"],
    ]);
  });
});
