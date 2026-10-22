// Paste-a-script spec §7 — the import and the detector on the REAL models. Costs a few cents.
//
//   npx vitest run --config vitest.integration.config.ts scripts/probe-script-import.itest.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const BASE = {
  clientName: "Jackfruit365",
  kbText: "This client has no brand KB yet. Write from the person's description and the example scripts only, and say so.",
  library: "This client has no scripts yet. Take the format from the person's description and the house rules.",
  avatars: "The client has no saved avatars yet; describe every person in words.",
};

const SCENES = `Monday dosa

Amma, 60, Chennai, in a cotton saree, unhurried.

Scene 1. Amma pours batter on a hot tawa. VO: "Monday means dosa."
Scene 2. She stirs a spoon of the flour into the batter. VO: "One spoon of the flour, every time."
Scene 3. The family eats at the table. VO: "Nobody can tell."
Scene 4. Pack shot on the counter. VO: "Jackfruit365. On Amazon."

Music: soft veena under the whole reel.
Props: steel tumbler, banana leaf.`;

describe("pasting a script into the copilot (live)", () => {
  it("reads Reel 07 word for word, with its beats and lengths (success 1–3, 10)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_WRITER_MODEL, REVIEW_PLACEHOLDER } = await import("@/lib/scripts/copilot/constants");
    const { importPrompt } = await import("@/lib/scripts/copilot/messages");
    const { importOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { buildImport } = await import("@/lib/scripts/copilot/import");
    const { unmatchedShots } = await import("@/lib/scripts/copilot/import-check");
    const { REEL_07_PASTE } = await import("@/lib/scripts/fixtures/reel-07-paste");
    const { REEL_07_IMPORT } = await import("@/lib/scripts/fixtures/reel-07-import");

    const out = await structuredCaller(SCRIPT_WRITER_MODEL)({ name: "script_import", ...importPrompt(BASE, { text: REEL_07_PASTE }), schema: importOutputSchema });
    expect(out.reelNumber).toBe(7);
    const r = buildImport(out, { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [] });
    if ("error" in r) throw new Error(r.error);
    console.log(r.reply);
    expect(r.doc.shots.map((s) => s.beat)).toEqual(REEL_07_IMPORT.shots.map((s) => s.beat));
    expect(r.doc.shots.map((s) => s.lengthSeconds)).toEqual([4, 5, 6, 6, 8, 6, 5, 5, 5]);
    expect(unmatchedShots(r.doc, REEL_07_PASTE)).toEqual([]);
    expect(r.doc.header).toEqual({ ...REEL_07_IMPORT.header, reelNumber: 7 });
    expect(r.doc.cast.find((c) => c.isLead)?.name).toBe("Rhea");
    expect(r.doc.context.watchOuts).toEqual(REEL_07_IMPORT.context.watchOuts);
    for (const d of ["D1, on every reel.", "D2, on every reel.", "D4, on the pack end card of every reel. This is not a medicine. FSSAI Lic. No. ____ (licence number to be supplied by the brand)."]) expect(r.doc.context.disclaimers).toContain(d);
    expect(r.doc.shots[4].vo).toContain(REVIEW_PLACEHOLDER);
  });

  it("guesses lengths and beats for a scene-by-scene script, and keeps the music and props (success 5, 6)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_WRITER_MODEL } = await import("@/lib/scripts/copilot/constants");
    const { importPrompt } = await import("@/lib/scripts/copilot/messages");
    const { importOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { buildImport } = await import("@/lib/scripts/copilot/import");

    const out = await structuredCaller(SCRIPT_WRITER_MODEL)({ name: "script_import", ...importPrompt(BASE, { text: SCENES }), schema: importOutputSchema });
    const r = buildImport(out, { paste: SCENES, reelNumber: 1, takenReel: null, avatars: [] });
    if ("error" in r) throw new Error(r.error);
    console.log(r.reply);
    expect(r.doc.shots).toHaveLength(4);
    expect(r.reply).toContain("Keep the timings I estimated?");
    expect(r.reply).toContain("Are the beat labels right?");
    expect(r.notes.brief).toContain("soft veena under the whole reel");
    expect(r.notes.brief).toContain("steel tumbler, banana leaf");
    expect(r.doc.cast.find((c) => c.isLead)?.name).toBe("Amma");
  });

  it("tells a whole script from a few rows and a brief (spec §5.2)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_QUICK_MODEL } = await import("@/lib/scripts/copilot/constants");
    const { detectPrompt } = await import("@/lib/scripts/copilot/messages");
    const { detectOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { REEL_07_PASTE } = await import("@/lib/scripts/fixtures/reel-07-paste");
    const detect = (text: string, hasDraft: boolean) =>
      structuredCaller(SCRIPT_QUICK_MODEL)({ name: "script_detect", ...detectPrompt(BASE, { hasDraft, text }), schema: detectOutputSchema });
    const rows = REEL_07_PASTE.split("\n").filter((l) => l.startsWith("| **")).slice(3, 5).join("\n");

    expect((await detect(REEL_07_PASTE, false)).wholeScript).toBe(true);
    expect((await detect(SCENES, true)).wholeScript).toBe(true);
    expect((await detect(`Add these two shots after the hook:\n${rows}`, true)).wholeScript).toBe(false);
    expect((await detect("Reel for Onam. UGC, Saraswathi leads, lunch at home, post on Sun 31 Aug. Keep it warm, no hard sell.\n".repeat(6), false)).wholeScript).toBe(false);
  });
});
