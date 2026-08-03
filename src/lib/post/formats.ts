import type { PostFormat } from "./types";

export type FormatSpec = {
  width: number;
  height: number;
  label: string;
  dpi?: number; // only set for print formats
};

export const POST_FORMATS: Record<PostFormat, FormatSpec> = {
  "ig-square": { width: 1080, height: 1080, label: "Instagram square (1:1)" },
  "ig-story": { width: 1080, height: 1920, label: "Instagram story (9:16)" },
  "linkedin": { width: 1200, height: 627, label: "LinkedIn (1.91:1)" },
  "a4-print": { width: 2480, height: 3508, label: "A4 print (300 DPI)", dpi: 300 },
};

export function getFormatSpec(format: PostFormat): FormatSpec {
  return POST_FORMATS[format];
}
