import type Konva from "konva";

/** Longest edge of a captured card thumbnail, in CSS px. */
export const THUMBNAIL_MAX_PX = 200;

/**
 * JPEG rather than PNG. A 200px PNG of a real post runs 40-80KB once base64'd — roughly
 * fifteen times the node's own layer data, carried on every post node in the canvas payload.
 * At this quality the same image is 6-10KB and the difference is invisible at card size.
 */
const THUMBNAIL_QUALITY = 0.72;

/**
 * Scale factor that fits the stage's longest edge into `maxPx`.
 *
 * Capped at 1: a stage already smaller than the target stays 1:1 rather than being blown up
 * and re-compressed, which only costs bytes. A zero or negative dimension — a stage measured
 * before layout — yields 1 rather than Infinity or NaN, so a capture attempted too early
 * produces a harmless image instead of throwing.
 */
export function thumbnailPixelRatio(stageW: number, stageH: number, maxPx: number): number {
  const longest = Math.max(stageW, stageH);
  if (!Number.isFinite(longest) || longest <= 0) return 1;
  return Math.min(1, maxPx / longest);
}

/**
 * The Konva stage flattened to a small JPEG data URL, for the node card.
 *
 * Captured from the REAL stage rather than re-rendered in DOM: post-layers-preview.tsx is a
 * second renderer and had already drifted five ways from the canvas (shape primitives all
 * drawing as rectangles, rotation ignored, group transforms ignored). A capture matches by
 * construction and keeps matching as the canvas gains features.
 *
 * Composited onto white first. A post with no background layer has a transparent stage, and
 * JPEG renders transparency BLACK — white is what post-stage.tsx already shows behind the
 * artboard, so this matches what the operator was just looking at.
 *
 * Returns null rather than throwing. The canvas can be tainted by a cross-origin image that
 * slipped past the proxy, and a card that cannot produce a thumbnail is not worth interrupting
 * anyone over — the caller simply keeps whatever preview it had.
 *
 * The caller must clear the selection before calling: Konva's Transformer handles are real
 * nodes and would be baked into the image (usePostExport does the same, via flushSync).
 */
export function captureThumbnail(
  stage: Konva.Stage,
  maxPx: number = THUMBNAIL_MAX_PX,
): string | null {
  try {
    const pixelRatio = thumbnailPixelRatio(stage.width(), stage.height(), maxPx);
    const source = stage.toCanvas({ pixelRatio });
    if (source.width === 0 || source.height === 0) return null;

    const flattened = document.createElement("canvas");
    flattened.width = source.width;
    flattened.height = source.height;
    const ctx = flattened.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flattened.width, flattened.height);
    ctx.drawImage(source, 0, 0);

    return flattened.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
  } catch {
    return null;
  }
}
