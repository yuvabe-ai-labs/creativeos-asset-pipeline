import { describe, expect, it } from "vitest";
import { applyTargetEvent, askingTargetOf, NO_TARGET_ACTIVITY, type TargetActivity, type TargetEvent } from "../target-activity";
import type { ThreadMessage, ThreadState } from "../schema";

const run = (...events: TargetEvent[]): TargetActivity => events.reduce(applyTargetEvent, NO_TARGET_ACTIVITY);
const A = "kb:a.b";
const B = "kb:c.d";

describe("applyTargetEvent", () => {
  it("moves to a target as it is written, and records it written", () => {
    const writing = run({ type: "writing", target: A, move: true });
    expect(writing.writing).toEqual([A]);
    expect(writing.move?.target).toBe(A);
    const done = applyTargetEvent(writing, { type: "written", target: A, move: true });
    expect(done.writing).toEqual([]);
    expect(done.written.map((w) => w.target)).toEqual([A]);
    expect(done.move?.target).toBe(A);
    expect(done.move!.n).toBeGreaterThan(writing.move!.n);
  });

  it("ends on the last of two targets written in one turn", () => {
    const a = run(
      { type: "writing", target: A, move: true }, { type: "written", target: A, move: true },
      { type: "writing", target: B, move: true }, { type: "written", target: B, move: true },
    );
    expect(a.move?.target).toBe(B);
    expect(a.written.map((w) => w.target)).toEqual([A, B]);
  });

  it("stops the shimmer and records nothing on a refused write", () => {
    const a = run({ type: "writing", target: A, move: true }, { type: "unwritten", target: A, move: true });
    expect(a.writing).toEqual([]);
    expect(a.written).toEqual([]);
  });

  it("clears every shimmer when the turn ends", () => {
    const a = run({ type: "writing", target: A, move: true }, { type: "writing", target: B, move: true }, { type: "endTurn" });
    expect(a.writing).toEqual([]);
  });

  it("records a change without moving when asked not to", () => {
    const a = run({ type: "written", target: A, move: false });
    expect(a.written.map((w) => w.target)).toEqual([A]);
    expect(a.move).toBeNull();
  });

  it("moves to an asked target", () => {
    expect(run({ type: "asked", target: A }).move?.target).toBe(A);
  });

  it("keeps the last 20 changes", () => {
    const events: TargetEvent[] = Array.from({ length: 25 }, (_, i) => ({ type: "written", target: `kb:f${i}`, move: false }));
    const a = run(...events);
    expect(a.written).toHaveLength(20);
    expect(a.written[19].target).toBe("kb:f24");
  });

  it("returns the same object for a no-op", () => {
    expect(applyTargetEvent(NO_TARGET_ACTIVITY, { type: "endTurn" })).toBe(NO_TARGET_ACTIVITY);
    expect(applyTargetEvent(NO_TARGET_ACTIVITY, { type: "unwritten", target: A, move: true })).toBe(NO_TARGET_ACTIVITY);
  });
});

const msg = (over: Partial<ThreadMessage>): ThreadMessage => ({ id: "m", role: "assistant", content: "", card: null, attachments: [], suggestions: [], createdAt: "", ...over });
const state = (messages: ThreadMessage[]): ThreadState => ({ messages, live: [], suggestions: [], waiting: null });
const question = (field: string) => msg({ card: { kind: "question", field, label: field } });

describe("askingTargetOf", () => {
  const toTarget = (f: string) => `kb:${f}`;
  it("is the mapped field of a trailing question", () => {
    expect(askingTargetOf(state([msg({ role: "user", content: "hi" }), question("a.b")]), toTarget)).toBe("kb:a.b");
  });
  it("looks past a note saved on the page", () => {
    expect(askingTargetOf(state([question("a.b"), msg({ card: { kind: "note" }, content: "Manual edits saved: 1 field." })]), toTarget)).toBe("kb:a.b");
  });
  it("is null when the person answered, when nothing is asked, or with no thread", () => {
    expect(askingTargetOf(state([question("a.b"), msg({ role: "user", content: "x" })]), toTarget)).toBeNull();
    expect(askingTargetOf(state([msg({ content: "hello" })]), toTarget)).toBeNull();
    expect(askingTargetOf(undefined, toTarget)).toBeNull();
  });
});
