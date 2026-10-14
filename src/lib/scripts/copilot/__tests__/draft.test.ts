import { describe, it, expect } from "vitest";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { castIdFor, clampLength, newShotId, toScriptDoc } from "../draft";
import type { DraftOutput, ShotFields } from "../output";

const AVATAR = "7a2d3c4e-0000-4000-8000-000000000002";
const shot = (beat: string, vo: string, card: string, onScreen: string[] = ["sara"], lengthSeconds = 4): ShotFields =>
  ({ beat, lengthSeconds, visual: `${beat} visual`, vo, onScreenText: card, onScreen });

const draft = (over: Partial<DraftOutput> = {}): DraftOutput => ({
  header: { title: "Kerala Piravi at our table", format: "UGC", region: "South", postDate: "Sun 1 Nov (Kerala Piravi)", theme: "Kerala Piravi", aspect: "9:16", targetLength: "45 to 55 sec", production: "AI-generated" },
  context: { purpose: "p", settingAndCamera: "s", disclaimers: "D1, D2, D4.", watchOuts: ["Keep it Kerala only."] },
  cast: [
    { key: "sara", name: "Saraswathi", description: "55, Thrissur.", avatarId: AVATAR, isLead: true },
    { key: "rajan", name: "Rajan", description: "58, mundu.", avatarId: null, isLead: false },
  ],
  shots: [
    shot("HOOK", "Happy Kerala Piravi.", "Kerala Piravi"),
    shot("HOOK", "Happy Kerala Piravi.", "Kerala Piravi"), // a split shot that copied its beat's line and card
    shot("INTRO", "Red rice, thoran, curd.", "Red rice. Thoran.", ["Rajan", "nobody-here"]),
    shot("INTRO", "A new line on the split shot.", ""),
  ],
  summary: "First draft.",
  ...over,
});

describe("toScriptDoc", () => {
  it("numbers shots s01.., gives cast ids from names, and validates as a script", () => {
    const doc = toScriptDoc(draft(), { reelNumber: 4, avatarIds: new Set([AVATAR]) });
    expect(scriptDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.shots.map((s) => s.id)).toEqual(["s01", "s02", "s03", "s04"]);
    expect(doc.cast.map((c) => c.id)).toEqual(["saraswathi", "rajan"]);
    expect(doc.header.reelNumber).toBe(4);
  });

  it("keeps the carry rule: a split shot that repeats its beat's line or card leaves it empty", () => {
    const doc = toScriptDoc(draft(), { reelNumber: null, avatarIds: new Set() });
    expect(doc.shots[1]).toMatchObject({ vo: "", onScreenText: "" });
    expect(doc.shots[3]).toMatchObject({ vo: "A new line on the split shot.", onScreenText: "" });
  });

  it("resolves who is on screen by key or by name, and drops anyone unknown", () => {
    const doc = toScriptDoc(draft(), { reelNumber: null, avatarIds: new Set() });
    expect(doc.shots[0].onScreen).toEqual(["saraswathi"]);
    expect(doc.shots[2].onScreen).toEqual(["rajan"]);
  });

  it("keeps an avatar link only to one of the client's ready avatars", () => {
    expect(toScriptDoc(draft(), { reelNumber: null, avatarIds: new Set([AVATAR]) }).cast[0].avatarId).toBe(AVATAR);
    expect(toScriptDoc(draft(), { reelNumber: null, avatarIds: new Set() }).cast[0].avatarId).toBeNull();
  });

  it("makes exactly one lead: the first marked, else the first person", () => {
    const none = draft({ cast: draft().cast.map((c) => ({ ...c, isLead: false })) });
    expect(toScriptDoc(none, { reelNumber: null, avatarIds: new Set() }).cast.map((c) => c.isLead)).toEqual([true, false]);
    const two = draft({ cast: draft().cast.map((c) => ({ ...c, isLead: true })) });
    expect(toScriptDoc(two, { reelNumber: null, avatarIds: new Set() }).cast.map((c) => c.isLead)).toEqual([true, false]);
  });

  it("clamps lengths and names an untitled reel", () => {
    const odd = draft({ header: { ...draft().header, title: "  " }, shots: [shot("HOOK", "a", "b", [], 0), shot("INTRO", "c", "d", [], 90)] });
    const doc = toScriptDoc(odd, { reelNumber: null, avatarIds: new Set() });
    expect(doc.shots.map((s) => s.lengthSeconds)).toEqual([1, 60]);
    expect(doc.header.title).toBe("Untitled reel");
  });

  it("refuses a draft with no cast or no shots", () => {
    expect(() => toScriptDoc(draft({ cast: [] }), { reelNumber: null, avatarIds: new Set() })).toThrow("no cast");
    expect(() => toScriptDoc(draft({ shots: [] }), { reelNumber: null, avatarIds: new Set() })).toThrow("no shots");
  });
});

describe("helpers", () => {
  it("clampLength", () => {
    expect([clampLength(Number.NaN), clampLength(-2), clampLength(2.46), clampLength(75)]).toEqual([1, 1, 2.5, 60]);
  });

  it("castIdFor makes unique slugs", () => {
    const taken = new Set<string>();
    expect([castIdFor("Rajan", taken), castIdFor("Rajan", taken), castIdFor("Mary & Thomas", taken), castIdFor("!!", taken)])
      .toEqual(["rajan", "rajan-2", "mary-thomas", "person"]);
  });

  it("newShotId never returns a taken id", () => {
    const taken = new Set(["s01"]);
    const id = newShotId(taken);
    expect(id).toMatch(/^s[0-9a-f]{8}$/);
    expect(taken.has(id)).toBe(true);
  });
});
