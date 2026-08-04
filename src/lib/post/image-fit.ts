// How an image layer's bitmap is fitted into its layer box. Konva's <Image> stretches
// the source to width/height unconditionally, so `fit` has to be expressed as either a
// source-crop rect ("cover") or an adjusted destination rect ("contain").

export type Rect = { x: number; y: number; width: number; height: number };

// "cover": the largest CENTRED sub-rect of the source image whose aspect ratio matches
// the box, handed to Konva as `crop` — the box fills completely, nothing is stretched,
// the overflowing axis is trimmed evenly on both sides. Coordinates are in the SOURCE
// image's own pixel space.
export function computeCoverCrop(
  imgW: number, imgH: number, boxW: number, boxH: number,
): Rect {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: 0, y: 0, width: Math.max(imgW, 0), height: Math.max(imgH, 0) };
  }
  const boxRatio = boxW / boxH;
  const imgRatio = imgW / imgH;
  if (imgRatio > boxRatio) {
    // Source is proportionally wider than the box — trim the left/right.
    const width = imgH * boxRatio;
    return { x: (imgW - width) / 2, y: 0, width, height: imgH };
  }
  // Source is proportionally taller (or an exact match) — trim the top/bottom.
  const height = imgW / boxRatio;
  return { x: 0, y: (imgH - height) / 2, width: imgW, height };
}

// "contain": the whole image, aspect preserved, centred inside the box — expressed as a
// DESTINATION rect relative to the box's own top-left (so `x`/`y` are the letterbox
// offsets, 0 on the axis the image already fills). Never larger than the box.
export function computeContainRect(
  imgW: number, imgH: number, boxW: number, boxH: number,
): Rect {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: 0, y: 0, width: Math.max(boxW, 0), height: Math.max(boxH, 0) };
  }
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}
