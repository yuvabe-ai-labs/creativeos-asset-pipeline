import { strFromU8, unzipSync, zipSync, type Zippable } from "fflate";
import { describe, expect, it } from "vitest";
import { fontsUsed, packageEntries, packageManifest, packageReadme } from "../package";
import { planSequence, type SequencePlan } from "../sequence-plan";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";

const piece = (id: string, src: string, o: Partial<Piece> = {}): Piece => ({
  id, sourceNodeId: src, in: 0, out: 2, picture: "original", sound: "original", ...o,
});
const cap = (font: Caption["font"]): Caption => ({ id: font, pieceId: "1", at: 0.2, duration: 1, text: font, x: 0.5, y: 0.8, font, size: 84, color: "#ffffff" });
const planOf = (pieces: Piece[], captions: Caption[] = []): SequencePlan => {
  const r = planSequence({ v: 1, shape: "9:16", sources: [], pieces, captions }, [source("a", { handle: "VID-AAAA" }), source("d", { kind: "dubbing", handle: "DUB-DDDD" })]);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const bytesFor = (plan: SequencePlan) => ({
  media: new Map(plan.media.map((m) => [m.id, new Uint8Array([m.id, 1, 2, 3])])),
  fonts: fontsUsed(plan).flatMap((k) => [{ name: `${k}.ttf`, bytes: new Uint8Array([9]) }, { name: `${k}-OFL.txt`, bytes: new Uint8Array([8]) }]),
});
// Files only: fflate also writes folder entries ("creativeos-reel/"), which every unzip tool expects.
const names = (entries: Zippable) => Object.keys(unzipSync(zipSync(entries))).filter((n) => !n.endsWith("/")).sort();
const NOW = new Date("2026-10-20T12:00:00Z");

describe("package", () => {
  it("zips exactly the layout, without captions or fonts when there are none", () => {
    const plan = planOf([piece("1", "a")]);
    expect(names(packageEntries(plan, bytesFor(plan), NOW))).toEqual([
      "creativeos-reel/README.txt",
      "creativeos-reel/creativeos-premiere.xml",
      "creativeos-reel/manifest.json",
      "creativeos-reel/media/001_VID-AAAA_take.mp4",
      "creativeos-reel/timeline.otio",
    ]);
  });

  it("adds captions.srt and only the fonts used", () => {
    const plan = planOf([piece("1", "a")], [cap("anton"), cap("anton"), cap("poppins")]);
    expect(fontsUsed(plan)).toEqual(["anton", "poppins"]);
    const files = names(packageEntries(plan, bytesFor(plan), NOW));
    expect(files).toContain("creativeos-reel/captions.srt");
    expect(files).toContain("creativeos-reel/fonts/anton.ttf");
    expect(files).toContain("creativeos-reel/fonts/poppins-OFL.txt");
    expect(files.filter((f) => f.includes("/fonts/"))).toHaveLength(4);
  });

  it("stores media without compression", () => {
    const plan = planOf([piece("1", "a")]);
    const entry = packageEntries(plan, bytesFor(plan), NOW)["creativeos-reel"] as Zippable;
    const media = (entry.media as Zippable)["001_VID-AAAA_take.mp4"];
    expect(Array.isArray(media) && media[1]).toEqual({ level: 0 });
  });

  it("tells the reader to drag the XML into the Project panel", () => {
    const readme = packageReadme(planOf([piece("1", "a")]));
    expect(readme).toContain("Drag creativeos-premiere.xml into Premiere's Project panel.");
    expect(readme).not.toContain("File > Import > creativeos-premiere.xml");
    expect(readme).not.toContain("A3/A4");
    expect(readme).not.toContain("V2:");
    const full = packageReadme(planOf([piece("1", "d", { sound: "dubbed" })], [cap("anton")]));
    expect(full).toContain("A3/A4: the dubbed sound");
    expect(full).toContain("V2: the captions as editable Premiere text.");
  });

  it("writes a manifest", () => {
    const plan = planOf([piece("1", "a")]);
    const m = packageManifest(plan, NOW) as { generator: string; createdAt: string; sequence: { fps: number }; media: Array<{ fileName: string }> };
    expect(m.generator).toBe("creativeos-rough-cut-editor");
    expect(m.createdAt).toBe("2026-10-20T12:00:00.000Z");
    expect(m.sequence.fps).toBe(24);
    expect(m.media.map((x) => x.fileName)).toEqual(["001_VID-AAAA_take.mp4"]);
    const zipped = unzipSync(zipSync(packageEntries(plan, bytesFor(plan), NOW)));
    expect(JSON.parse(strFromU8(zipped["creativeos-reel/manifest.json"])).generator).toBe("creativeos-rough-cut-editor");
  });
});
