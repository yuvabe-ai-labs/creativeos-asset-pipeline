import { describe, it, expect } from "vitest";
import { panelForRow, panelTitle, storyboardFor, type StoryboardPanel } from "../storyboard";
import { scriptDocSchema } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const doc = scriptDocSchema.parse(reel01);
const url = (id: string) => `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/${id}/panel__a.png`;

describe("storyboardFor", () => {
  it("lists the approved panels in the script's order, named by position", () => {
    const [first, , third] = doc.shots;
    const out = storyboardFor(doc, {
      [third.id]: { takeId: "t3", url: url(third.id) },
      [first.id]: { takeId: "t1", url: url(first.id) },
    });
    expect(out).toEqual([
      { label: "S1", beat: first.beat, shotId: first.id, url: url(first.id) },
      { label: "S3", beat: third.beat, shotId: third.id, url: url(third.id) },
    ]);
  });

  it("ignores a frozen panel for a shot the script no longer has", () => {
    expect(storyboardFor(doc, { gone: { takeId: "t", url: url("gone") } })).toEqual([]);
  });
});

describe("panelTitle", () => {
  it("reads S3 · HOOK — storyboard, and drops an empty beat", () => {
    expect(panelTitle({ label: "S3", beat: "Hook" })).toBe("S3 · HOOK — storyboard");
    expect(panelTitle({ label: "S4", beat: "  " })).toBe("S4 — storyboard");
  });
});

describe("panelForRow", () => {
  const panels: StoryboardPanel[] = [{ label: "S3", beat: "HOOK", shotId: "s03", url: url("s03") }];

  it("matches a row by its name, ignoring case and spaces", () => {
    expect(panelForRow(panels, { label: "S3" })?.shotId).toBe("s03");
    expect(panelForRow(panels, { label: " s3 " })?.shotId).toBe("s03");
  });

  it("gives an unnamed, renamed or missing row nothing", () => {
    expect(panelForRow(panels, { label: "" })).toBeUndefined();
    expect(panelForRow(panels, {})).toBeUndefined();
    expect(panelForRow(panels, { label: "Shot 3" })).toBeUndefined();
    expect(panelForRow(panels, undefined)).toBeUndefined();
    expect(panelForRow(undefined, { label: "S3" })).toBeUndefined();
  });
});
