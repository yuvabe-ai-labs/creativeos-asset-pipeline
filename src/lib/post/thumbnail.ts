import type Konva from "konva";

/**
 * Longest edge of a captured card thumbnail, in device px.
 *
 * The card is `w-56` (224 CSS px), which on a 2x display is 448 device px before React Flow's
 * zoom is applied at all. The first version targeted 200px and produced a 160x200 image — a
 * 2.8x upscale on an ordinary laptop, which is why it looked soft.
 */
export const THUMBNAIL_MAX_PX = 480;

/**
 * Ceiling on Konva's pixelRatio.
 *
 * A post is authored at 1080px and the on-screen stage is roughly 430px, so re-rendering at
 * up to ~2.5x recovers detail that genuinely exists in the scene. Held at 2 because past that
 * the gain is slight and the bytes are not.
 */
const MAX_PIXEL_RATIO = 2;

/** WebP first — around 30% smaller than JPEG at matched quality, so it buys resolution. */
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

/**
 * Scale factor for rendering the stage into a thumbnail.
 *
 * Above 1 is not upscaling. `toCanvas` re-runs the scene graph at the requested resolution,
 * so text and shapes are re-rasterised sharper and photos are re-sampled from their originals
 * — which are far larger than the downscaled on-screen stage. The earlier version capped this
 * at 1 on the reasoning that anything more was invented detail; that was wrong, and it is why
 * a small stage produced a soft card.
 *
 * A zero or negative dimension — a stage measured before layout — yields 1 rather than
 * Infinity or NaN, so a capture attempted too early produces a harmless image instead of
 * asking Konva for an unbounded canvas.
 */
export function thumbnailPixelRatio(stageW: number, stageH: number, maxPx: number): number {
  const longest = Math.max(stageW, stageH);
  if (!Number.isFinite(longest) || longest <= 0) return 1;
  return Math.min(MAX_PIXEL_RATIO, maxPx / longest);
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

    return encodeSmallest(flattened);
  } catch {
    return null;
  }
}

/**
 * WebP when the browser can actually encode it, JPEG otherwise.
 *
 * `toDataURL` does NOT throw for an unsupported type — it silently falls back to PNG, which
 * for a photographic thumbnail is several times larger than the JPEG we were trying to avoid.
 * Safari did this until 17. So the result is checked rather than the browser sniffed: if the
 * data URL does not come back as WebP, the encode did not happen and JPEG is used instead.
 */
function encodeSmallest(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", WEBP_QUALITY);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
