import type { PostFormat } from "./types";

export type FormatSpec = {
  width: number;
  height: number;
  /** Full human label, e.g. "Instagram post — portrait". Never shows the key. */
  label: string;
  /** Compact label for tight spots like the node card, e.g. "Instagram portrait". */
  shortLabel: string;
  platform: string;
  dpi?: number; // only set for print formats
};

export const POST_FORMATS: Record<PostFormat, FormatSpec> = {
  "ig-portrait": {
    width: 1080, height: 1350, platform: "Instagram",
    label: "Instagram post — portrait", shortLabel: "Instagram portrait",
  },
  "ig-square": {
    width: 1080, height: 1080, platform: "Instagram",
    label: "Instagram post — square", shortLabel: "Instagram square",
  },
  "ig-story": {
    width: 1080, height: 1920, platform: "Instagram",
    label: "Instagram story & reel", shortLabel: "Instagram story",
  },
  "facebook-post": {
    width: 1200, height: 1500, platform: "Facebook",
    label: "Facebook post", shortLabel: "Facebook post",
  },
  "linkedin-post": {
    width: 1200, height: 627, platform: "LinkedIn",
    label: "LinkedIn post", shortLabel: "LinkedIn post",
  },
  "linkedin-square": {
    width: 1080, height: 1080, platform: "LinkedIn",
    label: "LinkedIn post — square", shortLabel: "LinkedIn square",
  },
  "x-post": {
    width: 1600, height: 900, platform: "X",
    label: "X post", shortLabel: "X post",
  },
  "youtube-thumb": {
    width: 1280, height: 720, platform: "Other",
    label: "YouTube thumbnail", shortLabel: "YouTube thumbnail",
  },
  "pinterest-pin": {
    width: 1000, height: 1500, platform: "Other",
    label: "Pinterest pin", shortLabel: "Pinterest pin",
  },
  "a4-print": {
    width: 2480, height: 3508, platform: "Print",
    label: "A4 print (300 DPI)", shortLabel: "A4 print", dpi: 300,
  },
};

/** Display order for the Size panel. Instagram first; portrait before square (4:5 performs best). */
export const FORMATS_BY_PLATFORM: { platform: string; formats: PostFormat[] }[] = [
  { platform: "Instagram", formats: ["ig-portrait", "ig-square", "ig-story"] },
  { platform: "Facebook", formats: ["facebook-post"] },
  { platform: "LinkedIn", formats: ["linkedin-post", "linkedin-square"] },
  { platform: "X", formats: ["x-post"] },
  { platform: "Other", formats: ["youtube-thumb", "pinterest-pin"] },
  { platform: "Print", formats: ["a4-print"] },
];

/**
 * Formats persisted before this rename. `PostFormat` values live in node JSONB with no
 * migration (D10), so old values must keep resolving at read time forever.
 */
const LEGACY_FORMAT_KEYS: Record<string, PostFormat> = {
  linkedin: "linkedin-post",
};

export const DEFAULT_FORMAT: PostFormat = "ig-square";

/** Normalises anything read out of node data into a real PostFormat. */
export function resolveFormat(key: string | undefined): PostFormat {
  if (!key) return DEFAULT_FORMAT;
  if (key in POST_FORMATS) return key as PostFormat;
  return LEGACY_FORMAT_KEYS[key] ?? DEFAULT_FORMAT;
}

export function getFormatSpec(format: PostFormat): FormatSpec {
  return POST_FORMATS[format];
}
