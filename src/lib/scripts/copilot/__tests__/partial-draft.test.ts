import { describe, it, expect } from "vitest";
import { completeJson, parsePartialDraft, previewDoc } from "../partial-draft";

const full = JSON.stringify({
  header: { title: "Kerala Piravi at our table", format: "UGC", region: "South", postDate: "Sun 1 Nov", theme: "", aspect: "9:16", targetLength: "50 sec", production: "AI-generated" },
  context: { purpose: "p", settingAndCamera: "s", disclaimers: "D1", watchOuts: ["w"] },
  cast: [{ key: "sara", name: "Saraswathi", description: "55", avatarId: null, isLead: true }],
  shots: [
    { beat: "HOOK", lengthSeconds: 5, visual: "v1", vo: "Happy \"Piravi\".", onScreenText: "Kerala Piravi", onScreen: ["sara"] },
    { beat: "INTRO", lengthSeconds: 6, visual: "v2", vo: "Red rice.", onScreenText: "Red rice", onScreen: [] },
  ],
  summary: "s",
});

describe("completeJson", () => {
  it("closes an open string, object and array so the prefix parses", () => {
    expect(JSON.parse(completeJson('{"a": [1, {"b": "hal'))).toEqual({ a: [1, { b: "hal" }] });
  });

  it("drops a dangling key, colon or comma", () => {
    expect(JSON.parse(completeJson('{"a": 1, "b":'))).toEqual({ a: 1 });
    expect(JSON.parse(completeJson('{"a": 1, "b'))).toEqual({ a: 1 });
    expect(JSON.parse(completeJson('{"a": [1, 2,'))).toEqual({ a: [1, 2] });
  });

  it("keeps escaped quotes inside strings", () => {
    expect(JSON.parse(completeJson('{"vo": "Happy \\"Piravi\\" to'))).toEqual({ vo: 'Happy "Piravi" to' });
  });
});

describe("parsePartialDraft", () => {
  it("shows the header as soon as it arrives, and no shots yet", () => {
    const cut = full.slice(0, full.indexOf('"context"') + 4);
    const p = parsePartialDraft(cut)!;
    expect(p.header.title).toBe("Kerala Piravi at our table");
    expect(p.shots).toEqual([]);
  });

  it("shows only finished shots while the shots list is still open", () => {
    const cut = full.slice(0, full.indexOf('"INTRO"') + 20);
    const p = parsePartialDraft(cut)!;
    expect(p.shots.map((s) => s.beat)).toEqual(["HOOK"]);
    expect(p.cast.map((c) => c.name)).toEqual(["Saraswathi"]);
  });

  it("shows every shot once the text is complete", () => {
    expect(parsePartialDraft(full)!.shots).toHaveLength(2);
  });

  it("is null before anything useful has arrived", () => {
    expect(parsePartialDraft("")).toBeNull();
    expect(parsePartialDraft('{"head')).toBeNull();
  });
});

describe("previewDoc", () => {
  it("makes a read-only script to draw, with who is on screen resolved by key", () => {
    const doc = previewDoc(parsePartialDraft(full)!);
    expect(doc.header.title).toBe("Kerala Piravi at our table");
    expect(doc.shots.map((s) => s.id)).toEqual(["preview-1", "preview-2"]);
    expect(doc.shots[0].onScreen).toEqual([doc.cast[0].id]);
  });

  it("titles a draft whose header has not arrived", () => {
    expect(previewDoc({ header: {}, context: {}, cast: [], shots: [] }).header.title).toBe("Writing the first draft…");
  });
});
