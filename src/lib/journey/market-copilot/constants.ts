import { websiteResearchPrompt } from "@/prompts/website-research";

// The market research agent (D530). Spec §7: "about five per group and about ten posts per brand";
// tune here only.

/** Brands proposed per tab (Direct, Adjacent) in one brands card. */
export const MARKET_BRANDS_PER_GROUP = 5;
/** Recent posts brought in per confirmed brand. */
export const MARKET_POSTS_PER_BRAND = 10;
/** The web-search model: the one the brand KB's website research already uses. */
export const MARKET_BRANDS_MODEL = websiteResearchPrompt.model;

/** Reads one post (its video or picture, and caption): the image cards' model, cheap per post. */
export const MARKET_READ_MODEL = "gemini-3.5-flash-lite";
/** Groups every reading into draft signals in one call: the script writer's model. */
export const MARKET_GROUP_MODEL = "gemini-3.1-pro-preview";
/** The most drafts one run shows; each needs at least MARKET_DRAFT_MIN_POSTS posts behind it. */
export const MARKET_DRAFTS_MAX = 6;
export const MARKET_DRAFT_MIN_POSTS = 2;
/** Media sent inline to the reader; anything bigger is read from its thumbnail. */
export const MARKET_READ_MAX_BYTES = 20 * 1024 * 1024;
/** How long a draft waits for archives still downloading before it reads what it has. */
export const MARKET_ARCHIVE_WAIT_MS = 10 * 60_000;

/** A market job that has not reported for this long is not running, whatever its row says: its
 *  run died. Longer than either task may take (the draft's 30 minutes). */
export const MARKET_STALE_AFTER_MS = 45 * 60_000;

/** The two background jobs (Trigger.dev task ids and `background_jobs.kind`). */
export const MARKET_FETCH_KIND = "market-fetch" as const;
export const MARKET_DRAFT_KIND = "market-draft" as const;
export type MarketJobKind = typeof MARKET_FETCH_KIND | typeof MARKET_DRAFT_KIND;
