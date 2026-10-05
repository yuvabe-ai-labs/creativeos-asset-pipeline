/** Longest client name accepted — room for a long legal name, not for abuse. */
export const CLIENT_NAME_MAX_LENGTH = 120;

// svg and gif are allowed for logos beyond the standard image extension set.
export const LOGO_EXTENSIONS = new Set([
  "png",
  "svg",
  "jpg",
  "jpeg",
  "webp",
  "gif",
]);
