import { describe, expect, it } from "vitest";
import { assColor, assTime, buildAss } from "../render-ass";
import { planSequence, type SequencePlan } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE, type CaptionStyle } from "../caption-style";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";

const piece: Piece = { id: "p1", sourceNodeId: "a", in: 0, out: 121 / 24, picture: "original", sound: "original" };
const words = [{ text: "make", at: 1, duration: 0.5 }, { text: "dosa", at: 1.5, duration: 0.5 }];
const caption: Caption = { id: "c", pieceId: "p1", at: 1, duration: 1.3, text: "make dosa", words };
const planWith = (look: Partial<CaptionStyle>): SequencePlan => {
  const r = planSequence({ v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...look }, shape: "9:16", sources: [], pieces: [piece], captions: [caption] }, [source("a")]);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const FULL = { width: 720, height: 1280 };
const styleLine = (ass: string, name = "Caption") => ass.split("\n").find((l) => l.startsWith(`Style: ${name},`))!;
const events = (ass: string) => ass.split("\n").filter((l) => l.startsWith("Dialogue:"));

describe("assColor / assTime", () => {
  it("writes colours as &HAABBGGRR and times as h:mm:ss.cc", () => {
    expect(assColor("#ffca2d")).toBe("&H002DCAFF");
    expect(assColor("#111111", 0x47)).toBe("&H47111111");
    expect(assTime(3725.456)).toBe("1:02:05.46");
    expect(assTime(0)).toBe("0:00:00.00");
  });
});

describe("buildAss", () => {
  it("is null without captions", () => {
    const r = planSequence({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], pieces: [piece], captions: [] }, [source("a")]);
    if (!r.ok) throw new Error(r.reason);
    expect(buildAss(r.plan, FULL)).toBeNull();
  });

  it("uses the reel's font, sized from its em to libass's line height, outlined", () => {
    const plan = planWith({ ...CAPTION_PRESETS.clean.look, font: "montserrat", size: 84, outline: true, box: false });
    const ass = buildAss(plan, FULL)!;
    expect(ass).toContain("PlayResX: 720\nPlayResY: 1280");
    const style = styleLine(ass).split(",");
    expect(style[1]).toBe("Montserrat ExtraBold"); // libass matches the family name, not the PostScript name
    expect(style[7]).toBe("0"); // Bold: ExtraBold is its own family here
    expect(Number(style[2])).toBeCloseTo(plan.titles[0].sizePx * 1.562, 1);
    expect(style[15]).toBe("1"); // BorderStyle: outline
    expect(Number(style[16])).toBeCloseTo(plan.titles[0].stroke!.widthPx / 2, 1);
  });

  it("names Poppins and Playfair by family with Bold on, so libass picks the bold file", () => {
    for (const [font, family] of [["poppins", "Poppins"], ["playfair-display", "Playfair Display"]] as const) {
      const style = styleLine(buildAss(planWith({ ...CAPTION_PRESETS.clean.look, font }), FULL)!).split(",");
      expect(style[1]).toBe(family);
      expect(style[7]).toBe("1");
    }
  });

  it("draws the box as its own style, so adjacent words do not double its opacity", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const ass = buildAss(plan, FULL)!;
    const t = plan.titles[0];
    const box = styleLine(ass, "Box").split(",");
    expect(box[15]).toBe("3"); // BorderStyle: opaque box, drawn in the outline colour
    expect(box[5]).toBe(assColor(t.box!.color, Math.round(255 * (1 - t.box!.opacity / 100))));
    expect(Number(box[16])).toBeCloseTo(t.box!.sizePx, 1);
    expect(box[3].startsWith("&HFF")).toBe(true); // its own text is invisible
    expect(box[17]).toBe("0");
    const text = styleLine(ass).split(",");
    expect(text[15]).toBe("1");
    expect(text[16]).toBe("0");
    expect(text[17]).toBe("0");
    expect(box[1]).toBe(text[1]);
    expect(box[2]).toBe(text[2]);
  });

  it("writes a box event and a word event per title, the box below, at the caption's place", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const ev = events(buildAss(plan, FULL)!);
    expect(plan.titles).toHaveLength(2);
    expect(ev).toHaveLength(4);
    const t = plan.titles[0];
    const when = `${assTime(t.start / plan.fps)},${assTime(t.end / plan.fps)}`;
    expect(ev[0]).toContain(`Dialogue: ${t.track * 2},${when},Box,`);
    expect(ev[1]).toContain(`Dialogue: ${t.track * 2 + 1},${when},Caption,`);
    for (const e of ev.slice(0, 2)) expect(e).toContain(`{\\pos(${Math.round(t.x * 720)},${Math.round(t.y * 1280)})}`);
    expect(ev[0]).toMatch(/\}make dosa$/); // one segment, so one box
    expect(ev[1]).toMatch(/\{\\1c&H[0-9A-F]{6}&\}make\{\\r\} \{\\1c&H[0-9A-F]{6}&\}dosa\{\\r\}/);
  });

  it("keeps a single style and event per title without a box", () => {
    const ass = buildAss(planWith({ ...CAPTION_PRESETS.clean.look, box: false }), FULL)!;
    expect(ass).not.toContain("Style: Box,");
    expect(events(ass).every((e) => e.includes(",Caption,"))).toBe(true);
    expect(events(ass)[0].startsWith("Dialogue: 1,")).toBe(true);
  });

  it("hides upcoming words for Karaoke without collapsing their space", () => {
    const ass = buildAss(planWith(CAPTION_PRESETS.karaoke.look), FULL)!;
    expect(events(ass)[0]).toContain("{\\1a&HFF&\\3a&HFF&}DOSA{\\r}");
  });

  it("scales everything for a smaller output", () => {
    const plan = planWith({ ...CAPTION_PRESETS.clean.look, font: "anton" });
    const half = buildAss(plan, { width: 360, height: 640 })!;
    expect(half).toContain("PlayResX: 360\nPlayResY: 640");
    expect(Number(styleLine(half).split(",")[2])).toBeCloseTo((plan.titles[0].sizePx / 2) * 1.7334, 1);
  });

  it("keeps braces and line breaks from becoming ASS codes", () => {
    const plan = planWith(CAPTION_PRESETS.clean.look);
    plan.titles = [{ ...plan.titles[0], text: "a {b}\nc", runs: undefined }];
    expect(events(buildAss(plan, FULL)!)[0]).toMatch(/\}a \(b\)\\Nc$/);
  });
});
