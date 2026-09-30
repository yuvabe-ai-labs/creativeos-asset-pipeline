import type { ParamSpec } from "../types";

// Seedream 5.0 on BytePlus ModelArk (D285). Sizes are the vendor's published "resolution level x
// aspect ratio -> WxH" mapping (ref/byteplus-docs/Image generation API.md, `size`). The API would
// pick the same pixels from a resolution level plus a ratio described in the prompt; we send the
// explicit WxH instead so a 9:16 reel is 9:16 whatever the prompt says.
//
// The param is named `image_size` (not `resolution`) so the shared estimate path, which reads
// `image_size` for every non-OpenAI model, prices it without a Seedream special case.

const SEEDREAM_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"];

type SizeTable = Record<string, Record<string, string>>;

export const SEEDREAM_LITE_SIZES: SizeTable = {
  "2K": {
    "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304", "16:9": "2848x1600",
    "9:16": "1600x2848", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072", "4:3": "3456x2592", "3:4": "2592x3456", "16:9": "4096x2304",
    "9:16": "2304x4096", "3:2": "3744x2496", "2:3": "2496x3744", "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096", "4:3": "4704x3520", "3:4": "3520x4704", "16:9": "5504x3040",
    "9:16": "3040x5504", "3:2": "4992x3328", "2:3": "3328x4992", "21:9": "6240x2656",
  },
};

export const SEEDREAM_PRO_SIZES: SizeTable = {
  "1K": {
    "1:1": "1024x1024", "4:3": "1152x864", "3:4": "864x1152", "16:9": "1424x800",
    "9:16": "800x1424", "3:2": "1248x832", "2:3": "832x1248", "21:9": "1568x672",
  },
  "1.5K": {
    "1:1": "1536x1536", "4:3": "1792x1344", "3:4": "1344x1792", "16:9": "2048x1152",
    "9:16": "1152x2048", "3:2": "1872x1248", "2:3": "1248x1872", "21:9": "2352x1008",
  },
  "2K": {
    "1:1": "2048x2048", "4:3": "2368x1776", "3:4": "1776x2368", "16:9": "2816x1584",
    "9:16": "1584x2816", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3136x1344",
  },
};

function seedreamParams(sizes: SizeTable, resolutionDescription?: string): ParamSpec[] {
  return [
    { name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 0, visible: true,
      defaultValue: "9:16",
      constraints: { type: "select", options: SEEDREAM_ASPECT_RATIOS } },
    { name: "image_size",   label: "Resolution",   component: "select", group: "primary", order: 1, visible: true,
      defaultValue: "2K",
      constraints: { type: "select", options: Object.keys(sizes) },
      ...(resolutionDescription ? { description: resolutionDescription } : {}) },
  ];
}

export const seedreamLiteParams: ParamSpec[] = seedreamParams(SEEDREAM_LITE_SIZES);

export const seedreamProParams: ParamSpec[] = seedreamParams(
  SEEDREAM_PRO_SIZES,
  "1.5K costs the same as 1K; 2K costs twice as much.",
);

/**
 * The vendor's WxH for a resolution level and aspect ratio. The select options are this table's
 * keys, so an unknown pair is a programmer error — it throws rather than guessing a size.
 */
export function seedreamSize(sizes: SizeTable, resolution: string, aspectRatio: string): string {
  const size = sizes[resolution]?.[aspectRatio];
  if (!size) throw new Error(`Seedream has no size for ${resolution} at ${aspectRatio}.`);
  return size;
}
