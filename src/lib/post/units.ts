// Every layer's x/y/w/h is normalized 0-1 of the canvas; fontSize is normalized against
// canvas HEIGHT. This is what lets one composition render at any output size, including
// A4 at 300 DPI (2480x3508) — see post-node-design.md §4.

export function normalizedToPx(value: number, containerPx: number): number {
  return value * containerPx;
}

export function pxToNormalized(px: number, containerPx: number): number {
  return containerPx === 0 ? 0 : px / containerPx;
}

export function fontSizeToPx(fontSize: number, containerHeightPx: number): number {
  return fontSize * containerHeightPx;
}

export function pxToFontSize(px: number, containerHeightPx: number): number {
  return containerHeightPx === 0 ? 0 : px / containerHeightPx;
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
