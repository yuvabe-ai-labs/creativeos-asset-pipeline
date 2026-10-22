// The reel's caption style as CSS for the stage (D396). Sizes are px on a frame 1080 px on its
// short edge, in container query units so they scale with the stage. Outline, box, dim and the
// shadow mirror what premiere-title.ts writes, so the preview matches Premiere.
import type { CSSProperties } from "react";
import { dimColor, type CaptionStyle } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";

const px = (n: number) => `calc(${n} / 1080 * 100cqmin)`;
const STROKE_RATIO = 0.09;
const MIN_STROKE = 4;
const BOX_ALPHA = "b8"; // 72%, the title's back-fill opacity

/** The caption box: font, size and where it sits. */
export function captionBoxStyle(style: CaptionStyle): CSSProperties {
  return {
    left: `${style.x * 100}%`,
    top: `${style.y * 100}%`,
    fontFamily: CAPTION_FONT_CSS[style.font],
    fontSize: px(style.size),
    lineHeight: 1.12,
    color: style.color,
  };
}

/** The line: the box sits behind it, wrapping with the text. */
export function lineStyle(style: CaptionStyle): CSSProperties {
  return style.box
    ? { background: `${style.boxColor}${BOX_ALPHA}`, padding: "0.08em 0.32em", borderRadius: "0.18em", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }
    : {};
}

export type WordState = "said" | "active" | "upcoming";

/** One word: outline or shadow, and its colour for where the speech is (D398). */
export function wordStyle(style: CaptionStyle, state: WordState): CSSProperties {
  const finish: CSSProperties = style.outline
    ? { WebkitTextStroke: `${px(Math.max(MIN_STROKE, style.size * STROKE_RATIO))} #000`, paintOrder: "stroke fill" }
    : style.box
      ? {}
      : { textShadow: "0 0.06em 0.3em rgba(0,0,0,.6)" };
  if (!style.wordByWord || state === "said") return finish;
  if (state === "active") return { ...finish, color: style.activeColor };
  if (style.upcoming === "hide") return { ...finish, visibility: "hidden" };
  if (style.upcoming === "dim") return { ...finish, color: dimColor(style) };
  return finish;
}
