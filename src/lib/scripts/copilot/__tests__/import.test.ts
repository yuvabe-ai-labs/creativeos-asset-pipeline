import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { REEL_07_IMPORT } from "@/lib/scripts/fixtures/reel-07-import";
import { buildImport, estimateLength, importSummary, mightBeScript, resolveReelNumber, type ImportResult } from "../import";
import { REVIEW_PLACEHOLDER } from "../constants";
import { fillToFinal } from "../fill-to-final";
import type { ImportOutput } from "../output";

const RIYA = { id: "a1", name: "Riya", story: "27, Bengaluru", front: null, specific: false };
const opts: Parameters<typeof buildImport>[1] = { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [RIYA] };
const built = (raw: ImportOutput = REEL_07_IMPORT, o: Partial<typeof opts> = {}): ImportResult => {
  const r = buildImport(raw, { ...opts, ...o });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const libraryScript = (id: string, reelNumber: number): Script => {
  const doc = scriptDocSchema.parse(reel01);
  return { id, clientId: "c1", stage: "visualise", doc: { ...doc, header: { ...doc.header, reelNumber } }, approvedAt: null, createdAt: "t", updatedAt: "t" };
};
const SCENES: ImportOutput = {
  ...REEL_07_IMPORT,
  reelNumber: null,
  shots: REEL_07_IMPORT.shots.slice(0, 3).map((s) => ({ ...s, lengthSeconds: 0 })),
  guessed: { beats: true, lead: false },
};

describe("buildImport — Reel 07 (success 1–4)", () => {
  it("keeps 9 shots with the outline's beats and lengths, and its words exactly", () => {
    const { doc } = built();
    expect(doc.shots.map((s) => s.beat)).toEqual(["HOOK", "INTRO", "STORY", "STEP", "REVIEW", "BODY", "PAYOFF", "PROOF", "OUTRO"]);
    expect(doc.shots.map((s) => s.lengthSeconds)).toEqual([4, 5, 6, 6, 8, 6, 5, 5, 5]);
    expect(doc.shots[0].vo).toBe("Okay, breakfast. I've got eight minutes before my stand-up.");
  });

  it("carries the header, the lead, the watch-outs and the disclaimers as written", () => {
    const { doc } = built();
    expect(doc.header).toEqual({ ...REEL_07_IMPORT.header, reelNumber: 7 });
    expect(doc.cast).toEqual([expect.objectContaining({ name: "Rhea", isLead: true, avatarId: null, description: REEL_07_IMPORT.cast[0].description })]);
    expect(doc.context.watchOuts).toEqual(REEL_07_IMPORT.context.watchOuts);
    for (const d of ["D1, on every reel.", "D2, on every reel.", "D4, on the pack end card of every reel. This is not a medicine. FSSAI Lic. No. ____ (licence number to be supplied by the brand)."]) expect(doc.context.disclaimers).toContain(d);
  });

  it("cleans the markdown escapes, so the review is the placeholder and an open item (success 3, Review Focus 1)", () => {
    const r = built();
    expect(r.doc.shots[4].vo).toBe(`One customer wrote on Amazon: "${REVIEW_PLACEHOLDER}".`);
    expect(fillToFinal(r.doc, r.notes)[0].id).toBe(`placeholder.shots.${r.doc.shots[4].id}.vo`);
  });

  it("keeps what had no place in the notes, word for word, and names it", () => {
    const r = built();
    expect(r.notes.brief).toBe(`From the pasted script:\n\n${REEL_07_IMPORT.kept[0].text}`);
    expect(r.reply).toContain("Kept in the notes, word for word: D3 disclaimer.");
  });

  it("opens the reply with what it imported, asks who plays Rhea, and ends on the open items", () => {
    const r = built();
    const paragraphs = r.reply.split("\n\n");
    expect(paragraphs[0]).toMatch(/^Imported Reel 07 · 9 shots · 50s\./);
    expect(paragraphs).toContain("Who plays Rhea? Pick an avatar below, or keep Rhea in words for now.");
    expect(paragraphs.at(-1)).toMatch(/^1 thing to settle before it's final\. First: Paste a real, cleared Amazon review/);
    expect(r.notes.confirmations).toEqual([]);
  });

  it("asks nothing about avatars when the client has none", () => {
    expect(built(REEL_07_IMPORT, { avatars: [] }).reply).not.toContain("Who plays");
  });
});

describe("buildImport — guesses (success 5, 10)", () => {
  it("estimates missing lengths and asks about them and the beat labels, each an open item tied to its fields", () => {
    const r = built(SCENES);
    expect(r.doc.shots.map((s) => s.lengthSeconds)).toEqual(SCENES.shots.map((s) => estimateLength(s.vo)));
    expect(r.notes.confirmations.map((c) => c.id)).toEqual(["g1", "g2"]);
    expect(r.notes.confirmations[0].paths).toEqual(r.doc.shots.map((s) => `shots.${s.id}.lengthSeconds`));
    expect(r.notes.confirmations[1].paths).toEqual(r.doc.shots.map((s) => `shots.${s.id}.beat`));
    expect(r.reply).toContain("Keep the timings I estimated? There were none in the paste");
    expect(r.reply).toContain("Are the beat labels right? The paste had none, so I labelled the shots HOOK, INTRO and STORY.");
  });

  it("estimates only the untimed shots when some rows have timings (Review Focus 5)", () => {
    const mixed: ImportOutput = { ...REEL_07_IMPORT, shots: REEL_07_IMPORT.shots.map((s, i) => (i === 2 || i === 6 ? { ...s, lengthSeconds: 0 } : s)) };
    const r = built(mixed);
    expect(r.doc.shots[0].lengthSeconds).toBe(4);
    expect(r.notes.confirmations[0]).toMatchObject({ text: "S3 and S7 had no timing, so their lengths were estimated from the VO.", paths: [`shots.${r.doc.shots[2].id}.lengthSeconds`, `shots.${r.doc.shots[6].id}.lengthSeconds`] });
    expect(r.reply).toContain("Keep the timings I estimated for S3 and S7?");
  });

  it("makes a Narrator the lead when nobody is named, and asks who is on screen instead of who plays them", () => {
    const r = built({ ...REEL_07_IMPORT, cast: [], shots: REEL_07_IMPORT.shots.map((s) => ({ ...s, onScreen: [] })) });
    expect(r.doc.cast).toEqual([expect.objectContaining({ name: "Narrator", isLead: true })]);
    expect(r.reply).toContain("Who is on screen? Nobody was named, so I made the lead Narrator.");
    expect(r.reply).not.toContain("Who plays");
    expect(r.notes.confirmations[0].paths).toEqual([`cast.${r.doc.cast[0].id}.name`, `cast.${r.doc.cast[0].id}.description`]);
  });

  it("names a shot whose VO the reading changed, and lists it to check", () => {
    const off: ImportOutput = { ...REEL_07_IMPORT, shots: REEL_07_IMPORT.shots.map((s, i) => (i === 1 ? { ...s, vo: "Plain Greek yoghurt, some nuts." } : s)) };
    const r = built(off);
    expect(r.reply).toContain("S2 doesn't match the paste word for word, so it's listed to check.");
    expect(r.notes.confirmations[0]).toMatchObject({ id: "g1", paths: [`shots.${r.doc.shots[1].id}.vo`], confirmed: false });
  });

  it("groups every changed shot into one open item, and the reply names them all", () => {
    const off: ImportOutput = { ...REEL_07_IMPORT, shots: REEL_07_IMPORT.shots.map((s, i) => (i === 1 || i === 4 || i === 8 ? { ...s, vo: "Changed words here." } : s)) };
    const r = built(off);
    const ids = [1, 4, 8].map((i) => r.doc.shots[i].id);
    const c = r.notes.confirmations.filter((x) => x.text.includes("word for word"));
    expect(c).toHaveLength(1);
    expect(c[0].paths).toEqual(ids.map((id) => `shots.${id}.vo`));
    expect(c[0].text).toBe("S2, S5 and S9 don't match the pasted script word for word. Check them against the paste.");
    expect(r.reply).toContain("S2, S5 and S9 don't match the paste word for word, so they're listed to check.");
  });

  it("says so, and keeps an open item, when the kept text is cut at the notes limit", () => {
    const big: ImportOutput = { ...REEL_07_IMPORT, kept: [{ name: "Long note", text: "word ".repeat(2000).trim() }] };
    const r = built(big);
    expect(r.notes.brief).toHaveLength(8000);
    expect(r.reply).toContain("The notes hold 8,000 characters, so the end of what I kept was cut; the rest is still in your paste.");
    expect(r.notes.confirmations.some((c) => c.text === "Some of the kept text didn't fit in the notes. Copy the rest from the paste." && c.paths === undefined)).toBe(true);
  });

  it("keeps the full text of a field the script cut at its limit, and says so (I1)", () => {
    const production = "Shot on a phone, one take, natural light, no crew".padEnd(60, ".");
    const longVo = "Okay, breakfast. ".repeat(70).trim();
    const long: ImportOutput = {
      ...REEL_07_IMPORT,
      header: { ...REEL_07_IMPORT.header, production },
      shots: REEL_07_IMPORT.shots.map((s, i) => (i === 2 ? { ...s, vo: longVo } : s)),
    };
    expect(longVo.length).toBeGreaterThan(1000);
    const r = built(long, { paste: `${REEL_07_PASTE}\n${longVo}` });
    expect(r.doc.header.production.length).toBe(40);
    expect(r.notes.brief).toContain(production);
    expect(r.notes.brief).toContain(longVo);
    expect(r.reply).toContain("production and S3 VO ran past what the script holds, so the full text is in the notes.");
    const cutItems = r.notes.confirmations.filter((c) => c.text === "Some fields were too long for the script and were cut; the full text is in the notes.");
    expect(cutItems).toHaveLength(1);
    expect(cutItems[0].paths).toEqual(["header.production", `shots.${r.doc.shots[2].id}.vo`]);
  });

  it("says nothing about cuts when every field fits, and a carried empty VO is not a cut", () => {
    const r = built();
    expect(r.reply).not.toContain("ran past");
    expect(r.notes.confirmations.some((c) => c.text.includes("too long"))).toBe(false);
  });

  it("refuses a paste with no shots, saying what was missing (spec §5.4)", () => {
    expect(buildImport({ ...REEL_07_IMPORT, readable: false, problem: "There is no shot table in it.", shots: [] }, opts)).toEqual({ error: "There is no shot table in it." });
    expect(buildImport({ ...REEL_07_IMPORT, shots: [] }, opts)).toEqual({ error: "I couldn't find a series of shots or scenes in it." });
  });
});

describe("resolveReelNumber (spec §5.3)", () => {
  it("keeps the pasted number when it is free", () => {
    expect(resolveReelNumber(7, [libraryScript("a", 1)], "me", null)).toEqual({ reelNumber: 7, taken: null });
  });
  it("takes the next free number when another script has it", () => {
    expect(resolveReelNumber(1, [libraryScript("a", 1), libraryScript("b", 8)], "me", null)).toEqual({ reelNumber: 9, taken: 1 });
  });
  it("keeps the number when the script that has it is this one, re-pasted (Review Focus 2)", () => {
    expect(resolveReelNumber(7, [libraryScript("me", 7)], "me", null)).toEqual({ reelNumber: 7, taken: null });
  });
  it("falls back to the brief's number, then the next free one, when the paste has none", () => {
    expect(resolveReelNumber(null, [libraryScript("a", 3)], "me", 5)).toEqual({ reelNumber: 5, taken: null });
    expect(resolveReelNumber(null, [libraryScript("a", 3)], "me", null)).toEqual({ reelNumber: 4, taken: null });
  });
  it("says so in the reply when the number was taken (success 9)", () => {
    expect(built(REEL_07_IMPORT, { reelNumber: 9, takenReel: 7 }).reply).toMatch(/^Imported Reel 09 · 9 shots · 50s\. Reel 07 is taken, so this is Reel 09\./);
  });
});

describe("small pieces", () => {
  it("estimates a length from the VO read aloud, 2 to 10 seconds, 3 with no VO", () => {
    expect(estimateLength("")).toBe(3);
    expect(estimateLength("Okay.")).toBe(2);
    expect(estimateLength("one two three four five six seven eight nine ten")).toBe(4);
    expect(estimateLength("word ".repeat(60))).toBe(10);
  });
  it("sums up an import as reel, shots and length", () => {
    expect(importSummary(built().doc)).toBe("Reel 07 · 9 shots · 50s");
  });
  it("only sends long, many-line messages to the script check", () => {
    expect(mightBeScript("Make the hook punchier")).toBe(false);
    expect(mightBeScript("x".repeat(500))).toBe(false);
    expect(mightBeScript(REEL_07_PASTE)).toBe(true);
    expect(mightBeScript("x".repeat(4001))).toBe(true);
  });
});
