export const REFERENCE_KINDS = [
  "image",
  "gif",
  "video",
  "youtube",
  "instagram",
  "tiktok",
  "link",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const MARKET_BUCKETS = ["direct", "adjacent"] as const;
export type MarketBucket = (typeof MARKET_BUCKETS)[number];

/** Max bytes we'll pull for a re-hosted thumbnail (grid preview, not the media). */
export const THUMBNAIL_SIZE_LIMIT = 5 * 1024 * 1024;
