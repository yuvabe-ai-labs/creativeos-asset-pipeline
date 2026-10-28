import { describe, it, expect } from "vitest";
import { keepChips, withReplyChips } from "../chips";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateState, type ScriptMessage } from "../schema";

// Chips are not stored (user, 28 Oct 2026): the turn's answer carries them and the browser keeps
// them for the session, so they survive every other action until a reload or the next message.
const msg = (id: string, role: "user" | "assistant", suggestions: string[] = []): ScriptMessage =>
  ({ id, role, content: id, card: null, suggestions, createdAt: "t" });
const state = (messages: ScriptMessage[]): GenerateState => ({
  script: { id: "s1", clientId: "c1", stage: "generate", doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t" },
  messages, openItems: [], avatars: [], formats: [],
});

describe("withReplyChips", () => {
  it("puts the turn's chips on the newest copilot reply", () => {
    const out = withReplyChips(state([msg("u1", "user"), msg("a1", "assistant"), msg("a2", "assistant")]), ["Diwali"]);
    expect(out.messages.map((m) => m.suggestions)).toEqual([[], [], ["Diwali"]]);
  });

  it("changes nothing when the turn had no chips", () => {
    const s = state([msg("a1", "assistant")]);
    expect(withReplyChips(s, [])).toBe(s);
  });
});

describe("keepChips", () => {
  it("keeps the chips the browser holds when a later answer comes back without them", () => {
    const before = state([msg("u1", "user"), msg("a1", "assistant", ["Shorten the hook"])]);
    const after = state([msg("u1", "user"), msg("a1", "assistant"), msg("a2", "assistant")]);
    expect(keepChips(before, after).messages.map((m) => m.suggestions)).toEqual([[], ["Shorten the hook"], []]);
  });

  it("prefers chips the new answer brings", () => {
    const before = state([msg("a1", "assistant", ["Old"])]);
    const after = state([msg("a1", "assistant", ["New"])]);
    expect(keepChips(before, after).messages[0].suggestions).toEqual(["New"]);
  });

  it("is the new answer itself when there is nothing held", () => {
    const after = state([msg("a1", "assistant")]);
    expect(keepChips(undefined, after)).toBe(after);
  });
});
