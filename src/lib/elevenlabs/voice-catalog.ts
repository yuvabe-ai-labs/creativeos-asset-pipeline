// D283 — the ElevenLabs voice catalog: account voices (/v2/voices) and the public Voice Library
// (/v1/shared-voices), normalised to one PickerVoice shape. Current endpoints only — /v1/voices
// is not used. Server-side only in practice (needs the key); no `server-only` import so shared
// types can be imported with `import type` from client code.
import { ELEVENLABS_API_BASE, ACCOUNT_VOICES_PAGE_SIZE, LIBRARY_PAGE_SIZE } from "./constants";
import { ElevenLabsHttpError, elevenLabsKey } from "./client";

export type VoiceLabels = {
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  useCase?: string;
  descriptive?: string;
};

export type PickerVoice = {
  voiceId: string;
  source: "account" | "library";
  name: string;
  description: string | null;
  previewUrl: string | null;
  labels: VoiceLabels;
  category: string;
  /** ≥ 1. Legacy custom-rate Library voices cost `priceMultiplier`× the standard rate. */
  priceMultiplier: number;
  /** Library rows and saved Library voices: the voice owner's public id. */
  publicOwnerId?: string;
  /** Saved Library voices: the Library voice_id it was copied from. */
  originalVoiceId?: string;
  /** Library rows: already saved to this account. */
  isAddedByUser?: boolean;
};

export type LibraryQuery = {
  search?: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  useCase?: string;
  sort?: string;
  page: number;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

export function priceMultiplierOf(rate: unknown): number {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 1 ? rate : 1;
}

function compact(labels: VoiceLabels): VoiceLabels {
  return Object.fromEntries(Object.entries(labels).filter(([, v]) => v !== undefined)) as VoiceLabels;
}

export function mapAccountVoice(raw: unknown): PickerVoice | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.voice_id !== "string" || typeof r.name !== "string") return null;
  const l = (r.labels ?? {}) as Record<string, unknown>;
  const sharing = (r.sharing ?? null) as Record<string, unknown> | null;
  return {
    voiceId: r.voice_id,
    source: "account",
    name: r.name,
    description: str(r.description) ?? null,
    previewUrl: str(r.preview_url) ?? null,
    labels: compact({
      gender: str(l.gender), age: str(l.age), accent: str(l.accent), language: str(l.language),
      useCase: str(l.use_case), descriptive: str(l.descriptive),
    }),
    category: str(r.category) ?? "premade",
    priceMultiplier: priceMultiplierOf(sharing?.rate),
    ...(str(sharing?.public_owner_id) ? { publicOwnerId: str(sharing?.public_owner_id) } : {}),
    ...(str(sharing?.original_voice_id) ? { originalVoiceId: str(sharing?.original_voice_id) } : {}),
  };
}

export function mapLibraryVoice(raw: unknown): PickerVoice | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.voice_id !== "string" || typeof r.name !== "string") return null;
  if (typeof r.public_owner_id !== "string") return null;
  return {
    voiceId: r.voice_id,
    source: "library",
    name: r.name,
    description: str(r.description) ?? null,
    previewUrl: str(r.preview_url) ?? null,
    labels: compact({
      gender: str(r.gender), age: str(r.age), accent: str(r.accent), language: str(r.language),
      useCase: str(r.use_case), descriptive: str(r.descriptive),
    }),
    category: str(r.category) ?? "professional",
    priceMultiplier: priceMultiplierOf(r.rate),
    publicOwnerId: r.public_owner_id,
    isAddedByUser: r.is_added_by_user === true,
  };
}

async function getJson(url: string, what: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { headers: { "xi-api-key": elevenLabsKey() } });
  if (!res.ok) throw new ElevenLabsHttpError(res.status, await res.text().catch(() => ""), what);
  return (await res.json()) as Record<string, unknown>;
}

const mapAll = <T>(list: unknown, map: (r: unknown) => T | null): T[] =>
  (Array.isArray(list) ? list : []).map(map).filter((v): v is T => v !== null);

/** Every account voice, following next_page_token. */
export async function listAccountVoices(fetchImpl: typeof fetch = fetch): Promise<PickerVoice[]> {
  const out: PickerVoice[] = [];
  let token: string | undefined;
  do {
    const url =
      `${ELEVENLABS_API_BASE}/v2/voices?page_size=${ACCOUNT_VOICES_PAGE_SIZE}&include_total_count=false` +
      (token ? `&next_page_token=${encodeURIComponent(token)}` : "");
    const json = await getJson(url, "voices", fetchImpl);
    out.push(...mapAll(json.voices, mapAccountVoice));
    token = json.has_more === true ? str(json.next_page_token) : undefined;
  } while (token);
  return out;
}

export async function getAccountVoice(voiceId: string, fetchImpl: typeof fetch = fetch): Promise<PickerVoice | null> {
  const json = await getJson(
    `${ELEVENLABS_API_BASE}/v2/voices?voice_ids=${encodeURIComponent(voiceId)}`,
    "voice lookup",
    fetchImpl,
  );
  return mapAll(json.voices, mapAccountVoice).find((v) => v.voiceId === voiceId) ?? null;
}

export async function listLibraryVoices(
  q: LibraryQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<{ voices: PickerVoice[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    page_size: String(LIBRARY_PAGE_SIZE),
    page: String(q.page),
    include_custom_rates: "true",
  });
  if (q.search) params.set("search", q.search);
  if (q.gender) params.set("gender", q.gender);
  if (q.age) params.set("age", q.age);
  if (q.accent) params.set("accent", q.accent);
  if (q.language) params.set("language", q.language);
  if (q.useCase) params.set("use_cases", q.useCase);
  if (q.sort) params.set("sort", q.sort);
  const json = await getJson(`${ELEVENLABS_API_BASE}/v1/shared-voices?${params}`, "voice library", fetchImpl);
  return { voices: mapAll(json.voices, mapLibraryVoice), hasMore: json.has_more === true };
}

/** Save a Library voice to the account; returns the account voice_id to use from now on. */
export async function saveLibraryVoice(
  args: { publicOwnerId: string; voiceId: string; name: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `${ELEVENLABS_API_BASE}/v1/voices/add/${encodeURIComponent(args.publicOwnerId)}/${encodeURIComponent(args.voiceId)}`,
    {
      method: "POST",
      headers: { "xi-api-key": elevenLabsKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: args.name }),
    },
  );
  if (!res.ok) throw new ElevenLabsHttpError(res.status, await res.text().catch(() => ""), "voice save");
  const json = (await res.json()) as { voice_id?: unknown };
  if (typeof json.voice_id !== "string") throw new Error("ElevenLabs voice save returned no voice_id");
  return json.voice_id;
}
