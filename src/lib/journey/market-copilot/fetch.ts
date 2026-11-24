import "server-only";
import { getClientById } from "@/lib/db/clients";
import { claimCopilotCard, getCopilotCard, insertCopilotMessages } from "@/lib/db/copilot-messages";
import { ensureSystemBoards, listBucketUrls } from "@/lib/db/moodboards";
import { describeError } from "@/lib/describe-error";
import { failJob, getJob, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import { fetchProfileDetails } from "@/lib/market/apify";
import { ingestReference } from "@/lib/market/ingest";
import { normalizeProfileItem } from "@/lib/market/performance";
import { MARKET_POSTS_PER_BRAND } from "./constants";
import { fetchingLine, type MarketFetchInput } from "./start";

// One market-fetch run (D530 step 2): each confirmed brand's recent Instagram posts come in as
// ordinary references in Direct or Adjacent, where the person sees them arrive. A brand that cannot
// be fetched is named and the others carry on; the run fails only when no brand returned posts.
// Paid work: the task never retries (a retry would pay the scraper twice).

const NOTE_CAPTION_CHARS = 140;
export const DRAFT_SIGNALS_CHOICE = "Draft signals";
const FETCH_FAILED = "No brand returned any posts.";

/** One post, however its url is written: "/reel/X/?igsh=…" and "/p/X/" are the same post. */
export function postKey(url: string): string {
  const m = url.match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|reels|tv)\/([^/?#]+)/i);
  return m ? `instagram:${m[1]}` : url.trim().replace(/\/+$/, "");
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function closingLine(added: number, brandsWithPosts: number, failed: string[]): string {
  const missed = failed.length > 0
    ? ` I could not bring in posts from ${failed.map((h) => `@${h}`).join(", ")}: the handle may be wrong or the account private.`
    : "";
  if (added === 0) return `No new posts: everything recent from these brands is already in Direct and Adjacent.${missed}`;
  return `${plural(added, "post")} from ${plural(brandsWithPosts, "brand")} ${added === 1 ? "is" : "are"} in Direct and Adjacent. Delete any you don't want, then tell me to draft signals.${missed}`;
}

export async function runMarketFetch(
  jobId: string,
  deps: { fetchProfile?: typeof fetchProfileDetails; ingest?: typeof ingestReference } = {},
): Promise<{ added: number; failed: string[] }> {
  const fetchProfile = deps.fetchProfile ?? fetchProfileDetails;
  const ingest = deps.ingest ?? ingestReference;
  const job = await getJob<MarketFetchInput>(jobId);
  if (!job?.client_id) return { added: 0, failed: [] };
  const clientId = job.client_id;
  const { messageId, brands } = job.input;

  const fail = async (reason: string) => {
    await failJob(jobId, reason);
    // Said once in the thread; it also puts the list back for the person.
    await sayJobFailed({ client_id: clientId, kind: "market-fetch", input: job.input });
  };

  let added = 0;
  const failed: string[] = [];
  let brandsWithPosts = 0;
  try {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN is not set.");
    await startJob(jobId, fetchingLine(brands.length));
    const [boards, savedUrls] = await Promise.all([ensureSystemBoards(clientId), listBucketUrls(clientId)]);
    const saved = new Set([...savedUrls].map(postKey));

    // One brand after the other: each is one scraper call, and the person sees posts arrive.
    for (const brand of brands) {
      let posts: ReturnType<typeof normalizeProfileItem>["posts"];
      try {
        const profile = await fetchProfile(brand.handle, { token });
        posts = profile ? normalizeProfileItem(profile).posts : [];
      } catch (e) {
        console.error("[market-fetch] could not fetch a brand", { jobId, handle: brand.handle, error: describeError(e) });
        posts = [];
      }
      if (posts.length === 0) {
        failed.push(brand.handle);
        continue;
      }
      brandsWithPosts += 1;
      const recent = [...posts].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)).slice(0, MARKET_POSTS_PER_BRAND);
      const boardId = brand.group === "direct" ? boards.direct.id : boards.adjacent.id;
      for (const post of recent) {
        const key = postKey(post.postUrl);
        if (saved.has(key)) continue;
        const caption = post.caption.replace(/\s+/g, " ").trim().slice(0, NOTE_CAPTION_CHARS);
        await ingest({
          boardId, clientId, url: post.postUrl,
          note: caption ? `@${brand.handle} · ${caption}` : `@${brand.handle}`,
          addedBy: job.created_by ?? undefined,
        });
        saved.add(key);
        added += 1;
      }
      await setJobPhase(jobId, `${fetchingLine(brands.length)} ${plural(added, "post")} in so far.`);
    }

    if (brandsWithPosts === 0) {
      await fail(FETCH_FAILED);
      return { added, failed };
    }

    const card = await getCopilotCard(clientId, messageId, "brands");
    if (card?.status === "fetching") await claimCopilotCard(clientId, messageId, "brands", "fetching", { ...card, status: "fetched" });
    const client = await getClientById(clientId);
    if (client) await ensureOpening(client);
    await insertCopilotMessages(clientId, ONBOARDING, null, [{
      role: "assistant", content: closingLine(added, brandsWithPosts, failed), suggestions: added > 0 ? [DRAFT_SIGNALS_CHOICE] : [],
    }]);
    await succeedJob(jobId, { added, failed });
    return { added, failed };
  } catch (e) {
    console.error("[market-fetch] failed", { jobId, error: describeError(e) });
    await fail(e instanceof Error ? e.message : String(e));
    return { added, failed };
  }
}
