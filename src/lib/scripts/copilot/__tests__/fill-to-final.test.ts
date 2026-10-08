import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import reel08 from "@/lib/scripts/fixtures/reel-08.json";
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import { fillToFinal, findPlaceholder } from "../fill-to-final";
import { EMPTY_NOTES } from "../schema";

const r01 = scriptDocSchema.parse(reel01);
const r06 = scriptDocSchema.parse(reel06);
const r08 = scriptDocSchema.parse(reel08);
const ids = (doc: ScriptDoc | null, notes = EMPTY_NOTES) => fillToFinal(doc, notes).map((i) => i.id);

describe("findPlaceholder", () => {
  it("finds a bracketed placeholder and ignores everything else", () => {
    expect(findPlaceholder('One customer wrote: "[real review, verbatim]".')).toBe("[real review, verbatim]");
    expect(findPlaceholder("Sambar, chutney and podi.")).toBeNull();
    expect(findPlaceholder("[x]")).toBeNull(); // a single character is not a placeholder
  });
});

describe("fillToFinal", () => {
  it("has nothing open on the client-ready seeded Reel 06", () => {
    expect(ids(r06)).toEqual([]);
  });

  it("lists only the review placeholder on seeded Reel 08 (its outline holds one too)", () => {
    expect(ids(r08)).toEqual(["placeholder.shots.s02.vo"]);
  });

  it("lists Reel 01's review placeholder, and asks for the real review on its theme", () => {
    const items = fillToFinal(r01, EMPTY_NOTES);
    expect(items).toHaveLength(1);
    expect(items[0].id).toMatch(/^placeholder\./);
    expect(items[0].path).toMatch(/^shots\.s\d+\.vo$/);
    expect(items[0].question).toMatch(/real, cleared Amazon review/);
    expect(items[0].question).toMatch(/swap the theme/);
  });

  it("asks for the draft when there is none", () => {
    expect(ids(null)).toEqual(["draft"]);
  });

  it("lists each unconfirmed item to confirm, and drops it once confirmed", () => {
    const notes = { brief: "", confirmations: [{ id: "c1", text: "Sun 1 Nov is Kerala Piravi", confirmed: false }, { id: "c2", text: "x", confirmed: true }] };
    const items = fillToFinal(r06, notes);
    expect(items.map((i) => i.id)).toEqual(["confirm.c1"]);
    expect(items[0].question).toBe("Confirm: Sun 1 Nov is Kerala Piravi");
    expect(items[0].path).toBe("notes.confirm.c1");
  });

  it("lists empty sections, a person with no description, and an empty visual", () => {
    const doc: ScriptDoc = {
      ...r06,
      header: { ...r06.header, postDate: "" },
      context: { ...r06.context, purpose: "", disclaimers: "", watchOuts: [] },
      cast: r06.cast.map((c) => ({ ...c, description: "" })),
      shots: r06.shots.map((s, i) => (i === 3 ? { ...s, visual: "" } : s)),
    };
    expect(ids(doc)).toEqual([
      "header.postDate", "context.purpose", "context.disclaimers", "context.watchOuts",
      "cast.james.description", "shots.s04.visual",
    ]);
  });

  it("needs a VO line and a card on each beat's first shot, but not on its split shots", () => {
    // s02 and s03 are one INTRO beat: s03 carries s02's line and card.
    const carried = { ...r06, shots: r06.shots.map((s) => (s.id === "s03" ? { ...s, vo: "", onScreenText: "" } : s)) };
    expect(ids(carried)).toEqual([]);
    const missing = { ...r06, shots: r06.shots.map((s) => (s.id === "s02" ? { ...s, vo: "", onScreenText: "" } : s)) };
    expect(ids(missing)).toEqual(["shots.s02.vo", "shots.s02.onScreenText"]);
  });
});
