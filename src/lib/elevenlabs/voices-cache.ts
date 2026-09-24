import {
  getAccountVoice, listAccountVoices, listLibraryVoices, type LibraryQuery, type PickerVoice,
} from "./voice-catalog";
import { ACCOUNT_VOICES_TTL_MS, LIBRARY_PAGE_TTL_MS, SINGLE_VOICE_TTL_MS } from "./constants";

// D283 — in-process caches. Failures are never cached; a not-found voice lookup is.
let accountList: { at: number; voices: PickerVoice[] } | null = null;
const singles = new Map<string, { at: number; voice: PickerVoice | null }>();
const libraryPages = new Map<string, { at: number; page: { voices: PickerVoice[]; hasMore: boolean } }>();

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
