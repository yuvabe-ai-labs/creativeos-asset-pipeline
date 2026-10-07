// Brand image analysis (D312, D313). See
// docs/superpowers/specs/2026-10-07-kb-image-analysis-design.md.
import type { BrandImageSource } from "@/lib/asset-import/constants";

/** Reads each image into a card, and writes the Image Analysis tab from the cards. Gemini's newest
 *  Flash-Lite: no announced shutdown, ~546 tokens an image, no reasoning tokens (D313). */
export const IMAGE_CARD_MODEL = "gemini-3.5-flash-lite";
export const IMAGE_SUMMARY_MODEL = "gemini-3.5-flash-lite";

/** Bump when the card prompt or schema changes: cards made by an older version are re-made. */
export const IMAGE_CARD_VERSION = 1;

export const IMAGE_CATEGORIES = [
  "product",
  "lifestyle",
  "people",
  "text_graphic",
  "customer_content",
  "behind_the_scenes",
  "logo_brand_mark",
  "third_party_or_ui",
  "other",
] as const;
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const IMAGE_CATEGORY_LABELS: Record<ImageCategory, string> = {
  product: "Product",
  lifestyle: "Lifestyle",
  people: "People",
  text_graphic: "Text & graphic",
  customer_content: "Customer content",
  behind_the_scenes: "Behind the scenes",
  logo_brand_mark: "Logo & brand mark",
  third_party_or_ui: "Third-party or interface",
  other: "Other",
};

/** Not the brand's own imagery (retailer badges, app icons, payment logos on its website): kept as
 *  a card, but left out of every tally and summary. */
export const NON_BRAND_CATEGORIES: ReadonlySet<ImageCategory> = new Set(["third_party_or_ui"]);

/** How much one image counts when combining. Uploads were chosen by the team. */
export const SOURCE_WEIGHT: Record<BrandImageSource, number> = {
  upload: 3,
  website: 1,
  instagram: 1,
  facebook: 1,
};

/** Images read at once. Flash-Lite answers in ~1.5 s, so this keeps a 200-image brand near a minute. */
export const IMAGE_CARD_CONCURRENCY = 6;

/** Longest side an image is sent at. Medium media resolution reads at about this size anyway. */
export const IMAGE_CARD_MAX_PX = 1024;

/** Most cards described to the summary call (the most heavily weighted first). */
export const SUMMARY_MAX_CARDS = 240;

/** How many dominant colours the tab lists. */
export const DOMINANT_COLOUR_COUNT = 6;

/** Image count at which a summarised field is reported as high / medium confidence. */
export const CONFIDENCE_AT = { high: 20, medium: 6 } as const;
