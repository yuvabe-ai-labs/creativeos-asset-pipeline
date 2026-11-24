import { websiteResearchPrompt } from "@/prompts/website-research";

// The market research agent (D530). Spec §7: "about five per group and about ten posts per brand";
// tune here only.

/** Brands proposed per tab (Direct, Adjacent) in one brands card. */
export const MARKET_BRANDS_PER_GROUP = 5;
/** Recent posts brought in per confirmed brand. */
export const MARKET_POSTS_PER_BRAND = 10;
/** The web-search model: the one the brand KB's website research already uses. */
export const MARKET_BRANDS_MODEL = websiteResearchPrompt.model;

/** A market job that has not reported for this long is not running, whatever its row says: its
 *  run died. Longer than either task may take (the draft's 30 minutes). */
export const MARKET_STALE_AFTER_MS = 45 * 60_000;

/** The two background jobs (Trigger.dev task ids and `background_jobs.kind`). */
export const MARKET_FETCH_KIND = "market-fetch" as const;
export const MARKET_DRAFT_KIND = "market-draft" as const;
export type MarketJobKind = typeof MARKET_FETCH_KIND | typeof MARKET_DRAFT_KIND;
