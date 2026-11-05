/** Longest client name accepted — room for a long legal name, not for abuse. */
export const CLIENT_NAME_MAX_LENGTH = 120;

// svg is allowed for logos beyond the standard image extension set. No gif (YUV-392): a logo is
// still, and an animated one misbehaves wherever it is placed.
export const LOGO_EXTENSIONS = new Set([
  "png",
  "svg",
  "jpg",
  "jpeg",
  "webp",
]);

/** The logo types in plain words, for the picker's hint and its "not a logo" message (YUV-392). */
export const LOGO_TYPES_LABEL = "PNG, JPG, SVG or WebP";
