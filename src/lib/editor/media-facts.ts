// Media facts for the files a reel uses, measured once per file on first use (D391). Cached rows
// come back in one query; the rest are probed from their headers, a few at a time, and saved in
// one write. A failed probe is NOT cached, so reopening the editor tries again.
import "server-only";
import { listMediaFacts, saveMediaFacts } from "@/lib/db/media-facts";
import { isOwnStoredUrl } from "@/lib/storage";
import { probeMediaUrl } from "./probe";
import type { MediaFacts } from "./types";

const PROBE_CONCURRENCY = 6;

type Deps = {
  list: (urls: string[]) => Promise<Map<string, MediaFacts>>;
  save: (rows: Array<{ url: string; facts: MediaFacts }>) => Promise<void>;
  probe: (url: string) => Promise<MediaFacts>;
  isOwn: (url: string) => boolean;
};

const defaultDeps: Deps = { list: listMediaFacts, save: saveMediaFacts, probe: probeMediaUrl, isOwn: isOwnStoredUrl };

export async function ensureMediaFacts(urls: string[], deps: Deps = defaultDeps): Promise<Map<string, MediaFacts | null>> {
  const unique = [...new Set(urls)];
  // Only our own stored files are ever fetched (the URLs come from our DB, but never trust them).
  const own = unique.filter((u) => deps.isOwn(u));
  const cached = await deps.list(own);
  const out = new Map<string, MediaFacts | null>(unique.map((u) => [u, cached.get(u) ?? null]));

  const missing = own.filter((u) => !cached.has(u));
  const measured: Array<{ url: string; facts: MediaFacts }> = [];
  for (let i = 0; i < missing.length; i += PROBE_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + PROBE_CONCURRENCY).map(async (url) => {
        try {
          const facts = await deps.probe(url);
          measured.push({ url, facts });
          out.set(url, facts);
        } catch (err) {
          console.warn("[editor] couldn't measure", url, err);
        }
      }),
    );
  }
  if (measured.length) await deps.save(measured);
  return out;
}
