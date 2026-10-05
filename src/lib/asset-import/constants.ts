// Brand asset import (D302-D305). See
// docs/superpowers/specs/2026-10-05-brand-kb-social-asset-import-design.md.

export const IMPORT_SOURCES = ["website", "instagram", "facebook"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Where a Brand Images row came from. `upload` is the only one the KB analyses (D303). */
export type BrandImageSource = "upload" | ImportSource;

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
};

// Apify actors, chosen by the 2026-10-05 benchmark (spec §2).
export const IMPORT_ACTORS: Record<ImportSource, string> = {
  website: "logiover~website-image-media-extractor",
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
};

/** "Last 50 posts / 3 months" — whichever limit is hit first (Cyril, 2026-10-03). */
export const SOCIAL_POST_LIMIT = 50;
export const SOCIAL_WINDOW_MONTHS = 3;

export const WEBSITE_MAX_PAGES = 10;
/** The website actor bills per asset, so the run itself is capped (Apify `maxItems`). */
export const WEBSITE_MAX_ITEMS = 80;

/** Raster images smaller than this on both known sides are icons and badges, not brand assets. */
export const MIN_IMAGE_SIDE_PX = 200;

export const IMPORT_DOWNLOAD_CONCURRENCY = 4;
export const IMPORT_IMAGE_SIZE_LIMIT = 25 * 1024 * 1024;
export const IMPORT_VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;

/** How often the browser re-reads import status while one is running. */
export const IMPORT_POLL_MS = 4000;
