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
const styleLine = (ass: string) => ass.split("\n").find((l) => l.startsWith("Style: Caption,"))!;
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

  it("draws a box behind boxed captions, with its opacity", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const style = styleLine(buildAss(plan, FULL)!).split(",");
    expect(style[15]).toBe("3"); // BorderStyle: opaque box, drawn in the outline colour
    expect(style[5]).toBe(assColor(plan.titles[0].box!.color, Math.round(255 * (1 - plan.titles[0].box!.opacity / 100))));
  });

  it("writes one event per word: the said word coloured, upcoming words dimmed, at the caption's place", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const ev = events(buildAss(plan, FULL)!);
    expect(ev).toHaveLength(2);
    const t = plan.titles[0];
    expect(ev[0]).toContain(`${assTime(t.start / plan.fps)},${assTime(t.end / plan.fps)},Caption`);
    expect(ev[0]).toContain(`{\\pos(${Math.round(t.x * 720)},${Math.round(t.y * 1280)})}`);
    expect(ev[0]).toMatch(/\{\\1c&H[0-9A-F]{6}&\}make\{\\r\} \{\\1c&H[0-9A-F]{6}&\}dosa\{\\r\}/);
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
