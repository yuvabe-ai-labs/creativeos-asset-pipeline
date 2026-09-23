import { describe, it, expect } from "vitest";
import { draftIsDirty, commitDraft, type MultishotDraft } from "../multishot-draft";
import { totalOf, type MultishotCut } from "../multishot-cuts";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const cuts = (...seconds: number[]): MultishotCut[] =>
  seconds.map((s, i) => ({ id: `c${i}`, text: `cut ${i + 1}`, seconds: s }));

const draft = (cs: MultishotCut[], targetModel?: string): MultishotDraft => ({
  cuts: cs,
  ...(targetModel !== undefined ? { targetModel } : {}),
});

describe("draftIsDirty", () => {
  it("is false for a freshly seeded draft", () => {
    const saved = draft(cuts(2, 3), GEMINI_OMNI_MODEL_ID);
    expect(draftIsDirty(saved, draft(cuts(2, 3), GEMINI_OMNI_MODEL_ID))).toBe(false);
  });

  it("is true after a shot is added", () => {
    const saved = draft(cuts(2, 3));
    expect(draftIsDirty(saved, draft([...saved.cuts, { id: "new", text: "", seconds: 1 }]))).toBe(
      true,
    );
  });

  it("is true after a shot is removed", () => {
    const saved = draft(cuts(2, 3));
    expect(draftIsDirty(saved, draft(saved.cuts.slice(0, 1)))).toBe(true);
  });

  it("is true after a text edit", () => {
    const saved = draft(cuts(2, 3));
    const edited = saved.cuts.map((c, i) => (i === 0 ? { ...c, text: "new words" } : c));
    expect(draftIsDirty(saved, draft(edited))).toBe(true);
  });

  it("is true after a seconds edit", () => {
    expect(draftIsDirty(draft(cuts(2, 3)), draft(cuts(4, 3)))).toBe(true);
  });

  // D280 — the model is part of the SAME draft, so switching it is an unsaved edit and Cancel
  // reverts it. If this ever reads false, Cancel silently leaves the model changed.
  it("is true after a model switch alone", () => {
    const cs = cuts(2, 3);
    expect(draftIsDirty(draft(cs, GEMINI_OMNI_MODEL_ID), draft(cs, KLING_OMNI_MODEL_ID))).toBe(
      true,
    );
  });

  // `undefined` (parsed before per-shot lines existed) and `[]` (explicitly silent) are different
  // states throughout this module, and the dirty check must not flatten them.
  it("distinguishes an absent voiceover from an empty one", () => {
    const withoutKey: MultishotCut[] = [{ id: "c0", text: "a", seconds: 2 }];
    const withEmpty: MultishotCut[] = [{ id: "c0", text: "a", seconds: 2, voiceover: [] }];
    expect(draftIsDirty(draft(withoutKey), draft(withEmpty))).toBe(true);
  });

  it("sees a voiceover line edit", () => {
    const before: MultishotCut[] = [
      { id: "c0", text: "a", seconds: 2, voiceover: [{ text: "To work.", speaker: "narrator" }] },
    ];
    const after: MultishotCut[] = [
      { id: "c0", text: "a", seconds: 2, voiceover: [{ text: "To bed.", speaker: "narrator" }] },
    ];
    expect(draftIsDirty(draft(before), draft(after))).toBe(true);
  });
});

describe("commitDraft", () => {
  // The node's totalSeconds is a MIRROR of the ladder's length, and canvas-nodes.ts requires
  // every writer of `cuts` to write it in the SAME updateNodeData call. Returning one object is
  // what makes that structurally impossible to forget.
  it("returns cuts, their total and the model in one object", () => {
    const result = commitDraft(draft(cuts(2, 3, 4), KLING_OMNI_MODEL_ID));
    expect(result).toEqual({
      cuts: cuts(2, 3, 4),
      totalSeconds: 9,
      targetModel: KLING_OMNI_MODEL_ID,
    });
  });

  it("keeps totalSeconds equal to totalOf(cuts) for any ladder", () => {
    const cs = cuts(1, 1, 1, 7);
    expect(commitDraft(draft(cs)).totalSeconds).toBe(totalOf(cs));
  });

  // D237 — totalSeconds is a mirror, NOT a correction. An over-window ladder keeps its real
  // length here and checkLadder states the violation; clamping would show one number in large
  // type and contradict it in the red line underneath.
  it("does not clamp an over-window ladder", () => {
    expect(commitDraft(draft(cuts(9, 9))).totalSeconds).toBe(18);
  });

  it("omits targetModel entirely when the draft has none", () => {
    expect("targetModel" in commitDraft(draft(cuts(2)))).toBe(false);
  });
});
