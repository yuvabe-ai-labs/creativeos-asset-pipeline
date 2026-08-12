// Every layer's x/y/w/h is normalized 0-1 of the canvas. fontSize is normalized against the
// canvas's SHORTER EDGE (D123) — not its height — so identical copy reads at the same visual
// size on a 9:16 story, a 1:1 square and a 16:9 thumbnail. For square formats the shorter
// edge IS the height, so square posts render exactly as they always have.

export function normalizedToPx(value: number, containerPx: number): number {
  return value * containerPx;
}

export function pxToNormalized(px: number, containerPx: number): number {
  return containerPx === 0 ? 0 : px / containerPx;
}

export function fontSizeToPx(fontSize: number, containerW: number, containerH: number): number {
  return fontSize * Math.min(containerW, containerH);
}

export function pxToFontSize(px: number, containerW: number, containerH: number): number {
  const basis = Math.min(containerW, containerH);
  return basis === 0 ? 0 : px / basis;
}

// The inspector shows a legible number ("20") instead of the raw normalized fraction
// ("0.0185") via a pure conversion against a fixed 1080px baseline — independent of
// whatever format is actually selected, so the displayed number doesn't jump around
// when the operator switches formats (post-node-design.md §4).
export const FONT_SIZE_BASELINE_PX = 1080;

export function displayFontSize(fontSize: number): number {
  return Math.round(fontSize * FONT_SIZE_BASELINE_PX);
}

export function fontSizeFromDisplay(displaySize: number): number {
  return displaySize / FONT_SIZE_BASELINE_PX;
}

/**
 * Space to leave above the text in the inline editor overlay, so it sits where the Konva
 * text it replaces sits.
 *
 * Every text layer renders with `verticalAlign: "middle"` (layer-konva-props.ts), meaning
 * Konva centres the type block inside the layer's box. A `<textarea>` has no equivalent — it
 * always starts at the top — so without this the text visibly jumped upward the instant edit
 * mode opened and dropped back when it closed.
 *
 * Clamped at zero: text taller than its box should start at the top and scroll, and a
 * negative padding would push the first line out of view entirely.
 */
export function editorTopPadding(
  boxHeightPx: number,
  fontSizePx: number,
  lineHeight: number,
  lineCount: number,
): number {
  const lines = Math.max(1, lineCount);
  const blockHeight = fontSizePx * lineHeight * lines;
  return Math.max(0, (boxHeightPx - blockHeight) / 2);
}
