// Brand image analysis (D312, D313). See
// docs/superpowers/specs/2026-10-07-kb-image-analysis-design.md.
import type { BrandImageSource } from "@/lib/asset-import/constants";

/** Reads each image into a card. Gemini's newest Flash-Lite: no announced shutdown, ~546 tokens an
 *  image, no reasoning tokens (D313). */
export const IMAGE_CARD_MODEL = "gemini-3.5-flash-lite";
/** Writes the Image Analysis tab from all the cards in one call, which can be 1,000+ cards: the
 *  larger Flash reasons over them. One call a run, so its speed and price barely matter (D315). */
export const IMAGE_SUMMARY_MODEL = "gemini-3.8-flash";

/** Bump when the card prompt or schema changes: cards made by an older version are re-made. */
export const IMAGE_CARD_VERSION = 2;

// Two fixed axes, the same for every brand (D314). FORMAT is what the image looks like, from the
// standard product-photography vocabulary; PURPOSE is why it was posted, from the standard content
// pillars (educate, entertain, inspire, promote, plus connect).

export const IMAGE_FORMATS = [
  "product_shot",
  "flat_lay",
  "in_use",
  "detail",
  "people",
  "text_graphic",
  "behind_the_scenes",
  "logo_brand_mark",
  "third_party_or_ui",
  "other",
] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const IMAGE_FORMAT_LABELS: Record<ImageFormat, string> = {
  product_shot: "Product shot",
  flat_lay: "Flat lay",
  in_use: "In use",
  detail: "Detail",
  people: "People",
  text_graphic: "Text & graphic",
  behind_the_scenes: "Behind the scenes",
  logo_brand_mark: "Logo & brand mark",
  third_party_or_ui: "Third-party or interface",
  other: "Other",
};

/** Not the brand's own imagery (retailer badges, app icons, payment logos on its website): kept as
 *  a card, but left out of every tally and summary. */
export const NON_BRAND_FORMATS: ReadonlySet<ImageFormat> = new Set(["third_party_or_ui"]);

export const IMAGE_PURPOSES = ["educate", "promote", "inspire", "entertain", "connect"] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

export const IMAGE_PURPOSE_LABELS: Record<ImagePurpose, string> = {
  educate: "Educate",
  promote: "Promote",
  inspire: "Inspire",
  entertain: "Entertain",
  connect: "Connect",
};

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

/**
 * Most cards described to the summary call (D316). A card is ~97 tokens, so 1,000 is ~97k: the size
 * tested on 3.8 Flash, where it still wrote specific fields. Above it a sample that keeps the mix is
 * sent (sample.ts); the counts always cover every card.
 */
export const SUMMARY_MAX_CARDS = 1000;
/** Above the cap, uploads take up to this share of the places. */
export const SUMMARY_UPLOAD_SHARE = 1 / 3;
/** Above the cap, every format-and-source group sends at least this many cards. */
export const SUMMARY_MIN_PER_GROUP = 3;

/** How many dominant colours the tab lists. */
export const DOMINANT_COLOUR_COUNT = 6;

/** Image count at which a summarised field is reported as high / medium confidence. */
export const CONFIDENCE_AT = { high: 20, medium: 6 } as const;
