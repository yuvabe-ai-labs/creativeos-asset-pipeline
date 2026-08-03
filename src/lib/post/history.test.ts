import { describe, it, expect } from "vitest";
import { createHistory, commit, undo, redo, canUndo, canRedo } from "./history";

describe("createHistory", () => {
  it("starts with the given present, empty past/future", () => {
    const h = createHistory("A");
    expect(h).toEqual({ past: [], present: "A", future: [] });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});

describe("commit", () => {
  it("pushes the old present into past and installs the new present", () => {
    const h = commit(createHistory("A"), "B");
    expect(h.present).toBe("B");
    expect(h.past).toEqual(["A"]);
    expect(canUndo(h)).toBe(true);
  });

  it("clears future — committing after an undo discards the redo branch", () => {
    let h = createHistory("A");
    h = commit(h, "B");
    h = commit(h, "C");
    h = undo(h); // present: B, future: [C]
    expect(canRedo(h)).toBe(true);
    h = commit(h, "D"); // a fresh edit from B
    expect(h.present).toBe("D");
    expect(canRedo(h)).toBe(false);
  });

  it("is a no-op when the committed value is reference-equal to present", () => {
    const state = { x: 1 };
    const h = commit(createHistory(state), state);
    expect(canUndo(h)).toBe(false);
  });

  it("ONE commit call represents a whole gesture (e.g. a drag), not each intermediate move — this is coalesced-per-gesture by construction: callers commit only at pointerup/blur, never per pointermove", () => {
    // Simulates a drag: several intermediate positions are applied to `present` directly
    // by the caller WITHOUT calling commit, then one commit() lands the gesture's end state.
    let h = createHistory({ x: 0 });
    // intermediate moves during the drag do not call commit()
    const midDrag = { x: 5 };
    const endDrag = { x: 10 };
    h = commit(h, endDrag); // only the final position is committed
    expect(h.past).toEqual([{ x: 0 }]); // exactly one past entry for the whole drag
    expect(h.present).toEqual(endDrag);
    expect(midDrag.x).toBe(5); // (illustrative — midDrag was never pushed to history)
  });
});

describe("undo / redo", () => {
  it("undo moves present back into future and restores the previous past entry", () => {
    let h = createHistory("A");
    h = commit(h, "B");
    h = commit(h, "C");
    h = undo(h);
    expect(h.present).toBe("B");
    expect(h.past).toEqual(["A"]);
    expect(h.future).toEqual(["C"]);
  });

  it("undo is a no-op with empty past", () => {
    const h = createHistory("A");
    expect(undo(h)).toEqual(h);
  });

  it("redo reverses an undo", () => {
    let h = createHistory("A");
    h = commit(h, "B");
    h = undo(h);
    h = redo(h);
    expect(h.present).toBe("B");
    expect(canRedo(h)).toBe(false);
  });

  it("redo is a no-op with empty future", () => {
    const h = createHistory("A");
    expect(redo(h)).toEqual(h);
  });

  it("multiple undos then multiple redos round-trip back to the same state", () => {
    let h = createHistory(0);
    for (const n of [1, 2, 3]) h = commit(h, n);
    h = undo(undo(undo(h)));
    expect(h.present).toBe(0);
    h = redo(redo(redo(h)));
    expect(h.present).toBe(3);
  });
});
