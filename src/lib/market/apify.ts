// Thin client for the one Apify call the performance pipeline makes (D235).
// run-sync-get-dataset-items runs the actor and returns dataset items in one request
// (~9s for a profile in the 2026-09-03 spike; server-side cap via ?timeout=).
import type { ApifyProfileItem } from "./performance";

const ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";

export async function fetchProfileDetails(
  handle: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<ApifyProfileItem | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyProfileItem[];
  return items[0] ?? null;
}
