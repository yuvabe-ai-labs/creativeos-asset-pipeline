// One caption style for the reel (D396): the look (font, size, colour, word by word and how
// words not said yet show, plus the outline / box / caps a preset sets) and where captions sit.
// Presets are looks: they never move or retime captions. The stage and the Premiere writer both
// read these helpers, so what the user sees is what Premiere shows.
import * as z from "zod";
import { CAPTION_FONT_KEYS, type CaptionFontKey } from "./caption-fonts";
import type { EditDoc } from "./types";

export const UPCOMING = ["show", "dim", "hide"] as const;
export type Upcoming = (typeof UPCOMING)[number];

export type CaptionLook = {
  font: CaptionFontKey;
  /** px on a frame 1080 px on its short edge */
  size: number;
  color: string;
  wordByWord: boolean;
  /** the word being said, when wordByWord */
  activeColor: string;
  upcoming: Upcoming;
  outline: boolean;
  box: boolean;
  boxColor: string;
  upper: boolean;
};
export type CaptionStyle = CaptionLook & { x: number; y: number };

export const LOOK_KEYS = ["font", "size", "color", "wordByWord", "activeColor", "upcoming", "outline", "box", "boxColor", "upper"] as const satisfies readonly (keyof CaptionLook)[];

const BASE: CaptionLook = {
  font: "poppins", size: 62, color: "#ffffff", wordByWord: false, activeColor: "#ffca2d",
  upcoming: "show", outline: false, box: false, boxColor: "#000000", upper: false,
};

export const PRESET_KEYS = ["clean", "bold", "karaoke", "boxed"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export const CAPTION_PRESETS: Record<PresetKey, { label: string; sample: string; look: CaptionLook }> = {
  clean: { label: "Clean", sample: "Clean", look: BASE },
  bold: { label: "Bold pop", sample: "Bold", look: { ...BASE, font: "montserrat", size: 84, wordByWord: true, outline: true, upper: true } },
  karaoke: { label: "Karaoke", sample: "Sing", look: { ...BASE, font: "anton", size: 104, wordByWord: true, upcoming: "hide", outline: true, upper: true } },
  boxed: { label: "Boxed", sample: "Boxed", look: { ...BASE, font: "poppins", size: 58, wordByWord: true, activeColor: "#c4b5fd", upcoming: "dim", box: true, boxColor: "#111111" } },
};

export const DEFAULT_POSITION = { x: 0.5, y: 0.72 } as const;
export const DEFAULT_CAPTION_STYLE: CaptionStyle = { ...CAPTION_PRESETS.bold.look, ...DEFAULT_POSITION };

const EDGE = 0.04;
export const MIN_SIZE = 30;
export const MAX_SIZE = 200;
export const BOX_OPACITY = 72;
const STROKE_RATIO = 0.09;
const MIN_STROKE_PX = 4;
const BOX_PAD_RATIO = 0.2;
const DIM_KEEP = 0.45;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const CaptionStyleSchema = z.object({
  font: z.enum(CAPTION_FONT_KEYS as [CaptionFontKey, ...CaptionFontKey[]]),
  size: z.number().finite().min(MIN_SIZE).max(MAX_SIZE),
  color: hex,
  wordByWord: z.boolean(),
  activeColor: hex,
  upcoming: z.enum(UPCOMING),
  outline: z.boolean(),
  box: z.boolean(),
  boxColor: hex,
  upper: z.boolean(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The doc with the style patched, or the SAME doc when nothing changed (rule 4). */
export function applyCaptionStyle(doc: EditDoc, patch: Partial<CaptionStyle>): EditDoc {
  const next: CaptionStyle = { ...doc.captionStyle, ...patch };
  next.x = clamp(next.x, EDGE, 1 - EDGE);
  next.y = clamp(next.y, EDGE, 1 - EDGE);
  next.size = clamp(Math.round(next.size), MIN_SIZE, MAX_SIZE);
  const changed = (Object.keys(next) as (keyof CaptionStyle)[]).some((k) => next[k] !== doc.captionStyle[k]);
  return changed ? { ...doc, captionStyle: next } : doc;
}

export function presetOf(style: CaptionStyle): PresetKey | null {
  return PRESET_KEYS.find((k) => LOOK_KEYS.every((key) => CAPTION_PRESETS[k].look[key] === style[key])) ?? null;
}

const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Words not said yet, dimmed: a solid colour (Premiere titles have no per-character opacity). */
export function dimColor(style: Pick<CaptionLook, "color" | "box" | "boxColor">): string {
  const a = toRgb(style.color);
  const b = toRgb(style.box ? style.boxColor : "#000000");
  return toHex(a.map((v, i) => v * DIM_KEEP + b[i] * (1 - DIM_KEEP)));
}

export function displayText(text: string, style: Pick<CaptionLook, "upper">): string {
  return style.upper ? text.toLocaleUpperCase() : text;
}

const scaled = (px: number, shortEdge: number) => (px * shortEdge) / 1080;

export function sizePx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(style.size, shortEdge));
}

export function strokePx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(Math.max(MIN_STROKE_PX, style.size * STROKE_RATIO), shortEdge));
}

export function boxPadPx(style: Pick<CaptionLook, "size">, shortEdge: number): number {
  return Math.round(scaled(style.size * BOX_PAD_RATIO, shortEdge));
}
