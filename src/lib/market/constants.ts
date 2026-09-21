export const REFERENCE_KINDS = [
  "image",
  "gif",
  "video",
  "youtube",
  "instagram",
  "tiktok",
  "link",
  "pinterest",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const MARKET_BUCKETS = ["direct", "adjacent"] as const;
export type MarketBucket = (typeof MARKET_BUCKETS)[number];

/** Max bytes we'll pull for a re-hosted thumbnail (grid preview, not the media). */
export const THUMBNAIL_SIZE_LIMIT = 5 * 1024 * 1024;

/** Max bytes we'll pull for an archived media file (D264). A 17s reel measured
 *  ~4 MB and a 20s Short ~0.85 MB against the live providers, so this is generous;
 *  it exists to turn a runaway response into a recorded failure rather than an OOM
 *  in the task runner. */
export const MARKET_MEDIA_SIZE_LIMIT = 200 * 1024 * 1024;

/** Give up on an item after this many archive attempts (D271). */
export const MAX_ARCHIVE_ATTEMPTS = 4;

/** A row claimed but unfinished for this long was abandoned by a crashed run. */
export const STUCK_ARCHIVE_MINUTES = 30;

/** How strongly attached market signals reshape a script parse (D204). */
export const SIGNAL_MODES = ["tint", "rewrite"] as const;
export type SignalMode = (typeof SIGNAL_MODES)[number];
export const DEFAULT_SIGNAL_MODE: SignalMode = "tint";

/** CSS-columns masonry for the Direct/Adjacent shelves — shared by the live grid and
 *  its loading skeleton so the placeholder staggers exactly like the real tiles. */
export const MARKET_MASONRY =
  "columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid";
