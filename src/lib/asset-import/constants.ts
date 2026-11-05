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

/** Instagram and Facebook take every post from the last 3 months (D467). */
export const SOCIAL_WINDOW_MONTHS = 3;

/**
 * Not a product limit, however many posts the window holds: only a guard so a runaway run (a
 * page posting hundreds a day) cannot bill without end.
 */
export const SOCIAL_WINDOW_MAX_POSTS = 1000;
/** When nothing was posted in the last 3 months: the page's latest posts, whatever their age. */
export const SOCIAL_FALLBACK_POSTS = 50;

/** How long one import may scrape, the fallback run included — well inside the task's 30 min. */
export const IMPORT_SCRAPE_BUDGET_MS = 12 * 60_000;
/** The least the fallback run is given, even when the window run used most of the budget. */
export const IMPORT_FALLBACK_MIN_MS = 3 * 60_000;

export const WEBSITE_MAX_PAGES = 10;
/** The website actor bills per asset, so the run itself is capped (Apify `maxItems`). */
export const WEBSITE_MAX_ITEMS = 80;

/** Raster images smaller than this on both known sides are icons and badges, not brand assets. */
export const MIN_IMAGE_SIDE_PX = 200;

export const IMPORT_DOWNLOAD_CONCURRENCY = 4;
export const IMPORT_IMAGE_SIZE_LIMIT = 25 * 1024 * 1024;
export const IMPORT_VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;

/** Width of the WebP preview made for every imported image and video poster — what the grid
 *  shows, so a page of tiles costs kilobytes rather than the originals' megabytes. */
export const IMPORT_PREVIEW_PX = 480;

/** Brand assets per page in the infinite grid (4 rows of 6). */
export const IMPORTED_ASSETS_PAGE_SIZE = 24;
export const IMPORTED_ASSETS_MAX_PAGE_SIZE = 60;

/** How often the browser re-reads import status while one is running. */
export const IMPORT_POLL_MS = 4000;
