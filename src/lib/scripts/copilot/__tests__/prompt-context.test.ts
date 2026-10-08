import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import reel08 from "@/lib/scripts/fixtures/reel-08.json";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import { libraryFormats, nextReelNumber, pickExamples, renderAvatars, renderKbText, renderLibrary } from "../prompt-context";

const script = (json: unknown, id: string): Script =>
  ({ id, clientId: "c1", stage: "approved", doc: scriptDocSchema.parse(json), approvedAt: null, createdAt: "t", updatedAt: "t" });
const library = [script(reel01, "a"), script(reel06, "b"), script(reel08, "c")];

describe("renderKbText", () => {
  it("includes the KB's consistency notes whole, as the house rules", () => {
    const kb = { image_analysis: { brand_consistency_notes: { value: "HOUSE SPEC: seven locked claim lines…" } } } as never;
    expect(renderKbText(kb)).toContain("House rules (the brand KB's consistency notes, read whole):\nHOUSE SPEC: seven locked claim lines…");
  });

  it("still reads the house rules when the KB page saved them as a list (an empty field is edited as one)", () => {
    const kb = { image_analysis: { brand_consistency_notes: { value: ["Locked lines verbatim", "D1 on every reel"] } } } as never;
    expect(renderKbText(kb)).toContain("House rules (the brand KB's consistency notes, read whole):\nLocked lines verbatim, D1 on every reel");
  });

  it("says plainly when there is no KB", () => {
    expect(renderKbText(null)).toMatch(/no brand KB/);
  });
});

describe("the library", () => {
  it("lists each format once with its beats in order and the reels that use it", () => {
    const formats = libraryFormats(library);
    expect(formats).toHaveLength(3);
    const founder = formats.find((f) => /founder/i.test(f.format))!;
    expect(founder.beats[0]).toBe("HOOK");
    expect(founder.beats.at(-1)).toBe("OUTRO");
    expect(founder.reels).toEqual(["Reel 06"]);
  });

  it("picks examples of the same format, else one of each", () => {
    expect(pickExamples(library, library[1].doc.header.format).map((s) => s.id)).toEqual(["b"]);
    expect(pickExamples(library, "").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("prints examples in the team's layout", () => {
    expect(renderLibrary(library, "")).toContain("| Beat | Visual | VO | On-screen text |");
    expect(renderLibrary([], "")).toMatch(/no scripts yet/);
  });

  it("never learns from a script still at Generate, such as the draft being edited (final review)", () => {
    const draft: Script = { ...script(reel06, "draft"), stage: "generate" };
    draft.doc = { ...draft.doc, header: { ...draft.doc.header, format: "Founder-led", reelNumber: 12 } };
    expect(pickExamples([...library, draft], "Founder-led").map((s) => s.id)).toEqual(["b"]);
    expect(libraryFormats([draft]).length).toBe(0);
    expect(nextReelNumber([...library, draft])).toBe(13); // its reel number is still taken
  });

  it("gives the next free reel number", () => {
    expect(nextReelNumber(library)).toBe(9);
    expect(nextReelNumber([])).toBe(1);
  });
});

describe("renderAvatars", () => {
  it("names each avatar with its id and story", () => {
    expect(renderAvatars([{ id: "a1", name: "James", story: "The founder.", front: null }])).toBe("- James (avatar id a1): The founder.");
    expect(renderAvatars([])).toMatch(/no saved avatars/);
  });
});
