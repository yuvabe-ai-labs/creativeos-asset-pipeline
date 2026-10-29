import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import reel06 from "@/lib/scripts/fixtures/reel-06.json";
import reel08 from "@/lib/scripts/fixtures/reel-08.json";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import { libraryFormats, nextReelNumber, pickExamples, renderAvatars, renderKbText, renderLibrary, renderSignalBrief, renderSignalDigest, todayLabel } from "../prompt-context";

const script = (json: unknown, id: string): Script =>
  ({ id, clientId: "c1", stage: "approved", doc: scriptDocSchema.parse(json), approvedAt: null, createdAt: "t", updatedAt: "t" });
const library = [script(reel01, "a"), script(reel06, "b"), script(reel08, "c")];

describe("renderKbText", () => {
  it("reads the KB's Content Rules whole, and no longer the image analysis's consistency notes", () => {
    const kb = {
      compliance: { content_rules: { value: "Sells 2 and 3 BHK flats in Whitefield." } },
      image_analysis: { brand_consistency_notes: { value: "The look is consistent." } },
    } as never;
    const text = renderKbText(kb);
    expect(text).toContain("Content rules (read whole):\nSells 2 and 3 BHK flats in Whitefield.");
    expect(text).not.toContain("The look is consistent.");
  });

  it("still reads Content Rules when the KB page saved them as a list (an empty field is edited as one)", () => {
    const kb = { compliance: { content_rules: { value: ["Sells flats", "No price claims"] } } } as never;
    expect(renderKbText(kb)).toContain("Content rules (read whole):\nSells flats, No price claims");
  });

  it("tells the copilot where the audience is and what it wants", () => {
    const kb = { target_audience: { location: { value: "Bengaluru" }, pain_points: { value: ["long commutes"] }, desires: { value: null } } } as never;
    const text = renderKbText(kb);
    expect(text).toContain("Audience location: Bengaluru");
    expect(text).toContain("Pain points: long commutes");
    expect(text).not.toContain("Desires");
  });

  it("renders an old KB with no Content Rules without gaps or undefined", () => {
    expect(renderKbText({ compliance: {} } as never)).not.toContain("undefined");
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
    expect(renderAvatars([{ id: "a1", name: "James", story: "The founder.", front: null, specific: false }])).toBe("- James (avatar id a1): The founder.");
    // The model is told which avatar is a real person's photo, so it can tell two Jameses apart too.
    expect(renderAvatars([{ id: "a2", name: "James", story: "The founder.", front: null, specific: true }])).toBe("- James (avatar id a2, a real person's photo): The founder.");
    expect(renderAvatars([])).toMatch(/no saved avatars/);
  });
});

describe("renderSignalBrief", () => {
  it("labels each signal with the handle the model answers with, in order", () => {
    const signal = (id: string, name: string) => ({ id, name, tags: [], description: "", items: [] }) as never;
    const text = renderSignalBrief([signal("sig-1", "Onam lunches"), signal("sig-2", "Dabba prep")]);
    expect(text).toBe("[S1] Market signal: Onam lunches\n\n[S2] Market signal: Dabba prep");
  });
});

describe("todayLabel", () => {
  it("names the date in India, where the agency works", () => {
    expect(todayLabel(new Date("2026-10-27T20:00:00Z"))).toBe("Wed 28 Oct 2026");
  });
});

describe("renderSignalDigest", () => {
  const signal = (i: number) => ({ id: `sig-${i}`, name: `Signal ${i}`, tags: [], description: `What people do ${"at length ".repeat(20)}`, items: [] }) as never;

  it("is one short line per signal, cut on a line boundary", () => {
    const digest = renderSignalDigest(Array.from({ length: 30 }, (_, i) => signal(i)));
    expect(digest.startsWith("[S1] Signal 0")).toBe(true);
    expect(digest.length).toBeLessThanOrEqual(1500);
    expect(digest.endsWith("\n")).toBe(false);
  });

  it("is empty when the client has no signals", () => {
    expect(renderSignalDigest([])).toBe("");
  });
});
