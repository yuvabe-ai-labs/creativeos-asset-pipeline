import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { settleGuesses } from "../guesses";
import type { ScriptNotes } from "../schema";

const doc = scriptDocSchema.parse(reel01);
const [s1, s2] = doc.shots;
const notes: ScriptNotes = {
  brief: "",
  confirmations: [
    { id: "g1", text: "Lengths were estimated.", confirmed: false, paths: [`shots.${s1.id}.lengthSeconds`, `shots.${s2.id}.lengthSeconds`] },
    { id: "c1", text: "Sun 1 Nov is Kerala Piravi", confirmed: false },
  ],
};
const withLength = (id: string, n: number) => ({ ...doc, shots: doc.shots.map((s) => (s.id === id ? { ...s, lengthSeconds: n } : s)) });

describe("settleGuesses", () => {
  it("settles a guess when the person changes a field it filled", () => {
    const out = settleGuesses(doc, withLength(s2.id, s2.lengthSeconds + 1), notes);
    expect(out.confirmations.map((c) => c.confirmed)).toEqual([true, false]);
  });
  it("returns the notes untouched when no guessed field changed", () => {
    const edited = { ...doc, header: { ...doc.header, title: "New title" } };
    expect(settleGuesses(doc, edited, notes)).toBe(notes);
  });
  it("does not settle on a removed shot: a missing field is not an edit", () => {
    const removed = { ...doc, shots: doc.shots.filter((s) => s.id !== s1.id) };
    expect(settleGuesses(doc, removed, notes)).toBe(notes);
  });
});
