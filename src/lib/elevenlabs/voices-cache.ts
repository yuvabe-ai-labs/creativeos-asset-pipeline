import {
  getAccountVoice, listAccountVoices, listLibraryVoices, type LibraryQuery, type PickerVoice,
} from "./voice-catalog";
import {
  ACCOUNT_VOICES_TTL_MS, LIBRARY_PAGE_TTL_MS, SINGLE_VOICE_TTL_MS, VOICE_CACHE_MAX_ENTRIES,
} from "./constants";

// D283 — in-process caches. Failures are never cached; a not-found voice lookup is.
let accountList: { at: number; voices: PickerVoice[] } | null = null;
const singles = new Map<string, { at: number; voice: PickerVoice | null }>();
const libraryPages = new Map<string, { at: number; page: { voices: PickerVoice[]; hasMore: boolean } }>();

/**
 * Review fix — these two maps have no natural upper bound (one entry per distinct voiceId or
 * filter combination ever looked up), so a long-running process would grow them unboundedly.
 * On every write: drop entries past their own TTL, then, if still over the cap, drop the
 * oldest (by `at`) until back at the cap.
 */
function pruneAndCap<K, V extends { at: number }>(map: Map<K, V>, ttlMs: number, now: number): void {
  for (const [key, entry] of map) {
    if (now - entry.at > ttlMs) map.delete(key);
  }
  if (map.size <= VOICE_CACHE_MAX_ENTRIES) return;
  const oldestFirst = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldestFirst.slice(0, map.size - VOICE_CACHE_MAX_ENTRIES)) {
    map.delete(key);
  }
}

export async function getAccountVoicesCached(now: () => number = Date.now): Promise<PickerVoice[]> {
  const t = now();
  if (accountList && t - accountList.at <= ACCOUNT_VOICES_TTL_MS) return accountList.voices;
  const voices = await listAccountVoices();
  accountList = { at: t, voices };
  return voices;
}

export async function getVoiceCached(voiceId: string, now: () => number = Date.now): Promise<PickerVoice | null> {
  const t = now();
  const hit = singles.get(voiceId);
  if (hit && t - hit.at <= SINGLE_VOICE_TTL_MS) return hit.voice;
  const voice = await getAccountVoice(voiceId);
  singles.set(voiceId, { at: t, voice });
  pruneAndCap(singles, SINGLE_VOICE_TTL_MS, t);
  return voice;
}

/** Stable key regardless of property order. */
function libraryKey(q: LibraryQuery): string {
  return JSON.stringify(Object.keys(q).sort().map((k) => [k, q[k as keyof LibraryQuery]]));
}

export async function getLibraryPageCached(
  q: LibraryQuery,
  now: () => number = Date.now,
): Promise<{ voices: PickerVoice[]; hasMore: boolean }> {
  const t = now();
  const key = libraryKey(q);
  const hit = libraryPages.get(key);
  if (hit && t - hit.at <= LIBRARY_PAGE_TTL_MS) return hit.page;
  const page = await listLibraryVoices(q);
  libraryPages.set(key, { at: t, page });
  pruneAndCap(libraryPages, LIBRARY_PAGE_TTL_MS, t);
  return page;
}

/** After saving a Library voice: the account list and that voice's lookup must refresh. */
export function invalidateAccountVoices(voiceId?: string): void {
  accountList = null;
  if (voiceId) singles.delete(voiceId);
}

export function _resetVoiceCaches(): void {
  accountList = null;
  singles.clear();
  libraryPages.clear();
}
