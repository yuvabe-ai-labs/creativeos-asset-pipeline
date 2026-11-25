import "server-only";
import { countBucketItems } from "@/lib/db/moodboards";
import { listSignalNames } from "@/lib/db/signals";
import type { ClientRow } from "@/lib/db/types";
import { listRecentJobs } from "@/lib/jobs/db";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import { MARKET_DRAFT_KIND, MARKET_FETCH_KIND, MARKET_STALE_AFTER_MS, type MarketJobKind } from "./constants";
import type { MarketContext } from "./context";

/** What the onboarding copilot knows about market research (D530), once the brand KB is approved:
 *  four small reads in parallel, the same for 3 references or 300 (performance rule 1). The brands
 *  card waiting in the thread and the client's own handle are filled in by the caller. */
export async function loadMarketContext(
  client: Pick<ClientRow, "id" | "market_status">, now: number = Date.now(),
): Promise<MarketContext> {
  const [counts, signals, fetches, drafts] = await Promise.all([
    countBucketItems(client.id),
    listSignalNames(client.id),
    listRecentJobs(client.id, MARKET_FETCH_KIND, 1),
    listRecentJobs(client.id, MARKET_DRAFT_KIND, 1),
  ]);
  const latest = [...fetches, ...drafts].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  // A run that died must not look like one in progress for ever.
  const stopped = latest && JOB_LIVE_STATUSES.has(latest.status) && now - Date.parse(latest.updated_at) >= MARKET_STALE_AFTER_MS;
  return {
    open: true,
    status: client.market_status,
    counts: { ...counts, signals: signals.length },
    signalNames: signals.map((s) => s.name),
    pendingBrands: null,
    job: latest
      ? { kind: latest.kind as MarketJobKind, status: stopped ? "stopped" : latest.status, phaseMessage: latest.phase_message }
      : null,
    // The caller fills it in from the brand details it reads beside this, so nothing waits on it.
    ownHandle: null,
  };
}
