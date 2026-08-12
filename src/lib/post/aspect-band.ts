import type { PostFormat } from "./types";
import { POST_FORMATS } from "./formats";

export type AspectBand = "portrait" | "square" | "landscape";

/**
 * How far from 1:1 a format may sit and still be treated as square. 4:5 (0.8) is
 * deliberately OUTSIDE this band: it is Instagram's best-performing feed size and has
 * real extra height a square-tuned composition would leave empty.
 */
const SQUARE_TOLERANCE = 0.05;

/**
 * Templates tune ONE composition across three bands rather than shipping a layout per
 * format (D124) — margins, headline size and scrim height differ by band, the structure
 * does not.
 */
export function aspectBand(format: PostFormat): AspectBand {
  const { width, height } = POST_FORMATS[format];
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) return "square";
  return ratio < 1 ? "portrait" : "landscape";
}

/** Tiny readability helper so templates read as data rather than if-chains. */
export function byBand<T>(band: AspectBand, values: Record<AspectBand, T>): T {
  return values[band];
}
