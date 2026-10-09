import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { suggestionsFor } from "../suggestions";
import { fillToFinal } from "../fill-to-final";
import { EMPTY_BRIEF, EMPTY_NOTES, type Angle, type Brief, type GenerateState } from "../schema";

const given = (value: string) => ({ value, status: "given" as const });
const state = (over: { brief?: Brief; doc?: unknown; notes?: GenerateState["script"]["notes"]; stage?: "generate" | "visualise" } = {}): GenerateState => {
  const doc = over.doc ? scriptDocSchema.parse(over.doc) : null;
  const notes = over.notes ?? EMPTY_NOTES;
  return {
    script: { id: "s1", clientId: "c1", stage: over.stage ?? "generate", doc, brief: over.brief ?? EMPTY_BRIEF, notes, docVersion: 1, createdAt: "t", updatedAt: "t" },
    messages: [], openItems: fillToFinal(doc, notes),
    avatars: [
      { id: "a1", name: "Meenakshi", story: "", front: null, specific: false },
      { id: "a2", name: "James", story: "", front: null, specific: false },
      { id: "a3", name: "James", story: "", front: null, specific: true },
    ],
    formats: ["UGC", "Founder-led", "UGC, review first"],
  };
};
const labels = (s: GenerateState) => suggestionsFor(s).map((x) => x.label);
const angle = { id: "A", hook: "h", situation: "s", mealMoment: "", supportingCast: "", reviewTheme: "", proofEmphasis: "", format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "" } as Angle;

describe("suggestionsFor", () => {
  it("offers the library's formats and 'take it from here' when the copilot asks the format", () => {
    expect(labels(state())).toEqual(["UGC", "Founder-led", "UGC, review first", "Take it from here"]);
    expect(suggestionsFor(state()).every((s) => s.send)).toBe(true);
  });

  it("offers an occasion, then the client's avatars as leads", () => {
    expect(labels(state({ brief: { ...EMPTY_BRIEF, format: given("UGC") } }))).toEqual(["Kerala Piravi, Sun 1 Nov", "You pick"]);
    expect(labels(state({ brief: { ...EMPTY_BRIEF, format: given("UGC"), occasion: given("Onam") } }))).toEqual(["Meenakshi", "James · AI", "James · Specific", "Cast it for me"]);
  });

  it("puts Specific avatars first for a Founder-led reel, and each lead chip carries its avatar", () => {
    const s = suggestionsFor(state({ brief: { ...EMPTY_BRIEF, format: given("Founder-led"), occasion: given("Navratri") } }));
    expect(s.map((x) => x.label)).toEqual(["James · Specific", "Meenakshi", "James · AI", "Cast it for me"]);
    expect(s[0]).toEqual({ label: "James · Specific", text: "James", send: true, leadAvatarId: "a3" });
    expect(s[3].leadAvatarId).toBeUndefined();
  });

  it("offers a blend or new angles while angles are showing, and Write it on the card", () => {
    const withAngles = { ...EMPTY_BRIEF, format: given("UGC"), occasion: given("x"), lead: given("y"), angles: [angle] };
    expect(labels(state({ brief: withAngles }))).toEqual(["Blend A and B", "Give me three different angles"]);
    const card = { title: "t", reelNumber: 4, lines: [], cast: [], toConfirm: [] };
    expect(labels(state({ brief: { ...withAngles, narrative: given("A"), card, phase: "confirm" } }))).toEqual(["Write it", "Make it lunch instead"]);
  });

  it("after the draft: fills the box for the real review, never sends review text, then offers edits", () => {
    const s = suggestionsFor(state({ doc: reel01 }));
    expect(s[0]).toEqual({ label: "Paste the cleared review", text: "Here's the cleared review: \"", send: false });
    expect(s.slice(1).map((x) => x.label)).toEqual(["Make the hook punchier", "Redo the payoff, warmer", "Move the review earlier"]);
  });

  it("offers to confirm an open item, and skips review edits on a reel with no review", () => {
    const notes = { brief: "", confirmations: [{ id: "c1", text: "Sat 14 Nov is World Diabetes Day", confirmed: false }] };
    expect(suggestionsFor(state({ doc: reel06, notes }))[0]).toEqual({ label: "Confirm: Sat 14 Nov is World Diabetes Day", text: "Yes, confirmed: Sat 14 Nov is World Diabetes Day", send: true });
    expect(labels(state({ doc: reel06 }))).toEqual(["Make the hook punchier", "Make the ending warmer"]);
  });

  it("offers nothing once the script has left Generate", () => {
    expect(suggestionsFor(state({ doc: reel06, stage: "visualise" }))).toEqual([]);
  });
});
