# Voice Picker with Voice Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Video Gen node's plain voice `Select` with a rich dropdown that browses the ElevenLabs account ("My voices") and the public Voice Library, with search, filters, infinite scroll, inline preview on every row, and correct billing for custom-rate voices.

**Architecture:** A new server-side catalog module (`src/lib/elevenlabs/voice-catalog.ts`) talks to the current ElevenLabs endpoints (`/v2/voices`, `/v1/shared-voices`, `/v1/voices/add/...`) and normalises both sources to one `PickerVoice` shape with a `priceMultiplier`. Three thin routes expose it (list, single lookup, save). The price multiplier flows through the existing D282 pipeline (route reservation → `VoicePayload` → `meta.voice` → settlement). The UI is a popover built from shadcn primitives, driven by two hooks; all filtering/sorting/query-building logic lives in pure, unit-tested helpers.

**Tech Stack:** Next.js route handlers, vitest, React, shadcn (Base UI) `Popover` / `Tabs` / `Select` / `InputGroup` / `ScrollArea` / `Badge` / `Skeleton` / `Button`, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-25-voice-picker-library-design.md` (ADR D283, refines D282).

## Global Constraints

- ElevenLabs endpoints, exactly: account list/lookup `GET https://api.elevenlabs.io/v2/voices` (`page_size` ≤ 100, `next_page_token`, `voice_ids`, `include_total_count`); library `GET https://api.elevenlabs.io/v1/shared-voices` (`page`, `page_size`, `search`, `gender`, `age`, `accent`, `language`, `use_cases`, `sort`, `include_custom_rates=true`); save `POST https://api.elevenlabs.io/v1/voices/add/{public_user_id}/{voice_id}` body `{ "new_name": string }`. Header `xi-api-key: ELEVEN_LABS_API_KEY`. `GET /v1/voices` must no longer be called anywhere.
- `priceMultiplier` = library row `rate`, account voice `sharing.rate`; `1` when absent, non-numeric or `< 1`.
- Voice cost = `(durationSeconds / 60) × VOICE_CHANGE_USD_PER_MINUTE (0.12) × priceMultiplier`; charged only when the voice change was applied.
- Library page size 30; account list page size 100 following `next_page_token`; account list cache 5 min; single-voice cache 5 min per id; library page cache 60 s per query.
- After saving a Library voice, always use the `voice_id` the save call returns.
- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI, `render` prop, not `asChild`) — never a native `<button>`/`<input>`/`<select>`; icons/buttons inside a field use `InputGroup*`. Lucide icons only, `strokeWidth={1.5}`. Colors via tokens only.
- `src/components/<feature>/` holds only `.tsx`; sub-components stay in `src/components/nodes/` prefixed `video-gen-voice-picker-*`; non-UI logic lives in `src/lib/elevenlabs/`.
- The ElevenLabs key never reaches the browser: client code imports from `voice-catalog.ts` with `import type` only.
- API routes use `apiOk` / `apiError`; auth via `resolveCallerContextOrNull()` → 401.
- Nothing the Trigger tasks import may import `server-only`.
- Run tests per path, not the full suite (known timeout flakes). Shell: Windows Git Bash; quote paths with `[`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/elevenlabs/constants.ts` | Modify | Page sizes, TTLs, library filter option lists |
| `src/lib/elevenlabs/client.ts` | Modify | Keep STS + errors; drop `listVoices`/`mapVoices`/`ElevenLabsVoice`; share `apiKey`; generalise `ElevenLabsHttpError` |
| `src/lib/elevenlabs/voice-catalog.ts` | Create | `PickerVoice`, mappers, `priceMultiplierOf`, list/lookup/save calls |
| `src/lib/elevenlabs/voices-cache.ts` | Rewrite | Account-list, single-voice and library-page caches |
| `src/lib/elevenlabs/voice-filters.ts` | Create | Pure: account filtering/sorting, label options, library query building, cursor |
| `src/lib/elevenlabs/cost.ts` | Modify | Multiplier parameter |
| `src/lib/elevenlabs/api.ts` | Rewrite | Browser wrappers for the three routes |
| `src/app/api/elevenlabs/voices/route.ts` | Rewrite | `GET` list (`source=account|library`) |
| `src/app/api/elevenlabs/voices/[voiceId]/route.ts` | Create | `GET` single voice |
| `src/app/api/elevenlabs/voices/save/route.ts` | Create | `POST` save a Library voice |
| `src/lib/voice-change/types.ts`, `meta.ts`, `deliver.ts` | Modify | `priceMultiplier` through the pipeline |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Modify | Single-voice lookup + multiplier reservation |
| `src/lib/generations/complete.ts` | Modify | Settle with multiplier |
| `src/components/shared/infinite-scroll-sentinel.tsx` | Move | From `src/components/review/` |
| `src/hooks/use-voice-browser.ts` | Create | Tabs, search, filters, lists, paging, preview playback |
| `src/hooks/use-selected-voice.ts` | Create | Resolves the node's `voiceId` |
| `src/components/nodes/video-gen-voice-picker.tsx` | Create | Trigger + popover shell + label/effective-voice helpers |
| `src/components/nodes/video-gen-voice-picker-filters.tsx` | Create | Search + filter row |
| `src/components/nodes/video-gen-voice-picker-list.tsx` | Create | Scroll list, states, sentinel |
| `src/components/nodes/video-gen-voice-picker-row.tsx` | Create | One voice row |
| `src/components/nodes/video-gen-focus-view.tsx` | Modify | Swap to the new picker |
| `src/components/nodes/video-gen-voice-select.tsx`, its test, `src/hooks/use-elevenlabs-voices.ts` | Delete | Replaced |

---

### Task 1: Voice catalog (server) — current ElevenLabs endpoints, one `PickerVoice` shape

**Files:**
- Modify: `src/lib/elevenlabs/constants.ts`, `src/lib/elevenlabs/client.ts`
- Create: `src/lib/elevenlabs/voice-catalog.ts`
- Rewrite: `src/lib/elevenlabs/voices-cache.ts`
- Test: `src/lib/elevenlabs/__tests__/voice-catalog.test.ts` (new), `src/lib/elevenlabs/__tests__/voices-cache.test.ts` (rewrite), `src/lib/elevenlabs/__tests__/client.test.ts` (drop `mapVoices`/`listVoices` blocks)

**Interfaces:**
- Produces:
  - `type VoiceLabels = { gender?: string; age?: string; accent?: string; language?: string; useCase?: string; descriptive?: string }`
  - `type PickerVoice = { voiceId: string; source: "account" | "library"; name: string; description: string | null; previewUrl: string | null; labels: VoiceLabels; category: string; priceMultiplier: number; publicOwnerId?: string; originalVoiceId?: string; isAddedByUser?: boolean }`
  - `type LibraryQuery = { search?: string; gender?: string; age?: string; accent?: string; language?: string; useCase?: string; sort?: string; page: number }`
  - `priceMultiplierOf(rate: unknown): number`
  - `mapAccountVoice(raw: unknown): PickerVoice | null`, `mapLibraryVoice(raw: unknown): PickerVoice | null`
  - `listAccountVoices(fetchImpl?): Promise<PickerVoice[]>` (all pages)
  - `getAccountVoice(voiceId: string, fetchImpl?): Promise<PickerVoice | null>`
  - `listLibraryVoices(q: LibraryQuery, fetchImpl?): Promise<{ voices: PickerVoice[]; hasMore: boolean }>`
  - `saveLibraryVoice(args: { publicOwnerId: string; voiceId: string; name: string }, fetchImpl?): Promise<string>` (returns the account voice_id)
  - Cache (`voices-cache.ts`): `getAccountVoicesCached(now?)`, `getVoiceCached(voiceId, now?)`, `getLibraryPageCached(q, now?)`, `invalidateAccountVoices()`, `_resetVoiceCaches()`
  - `client.ts` keeps `speechToSpeech`, `ElevenLabsKeyMissingError`, and exports `elevenLabsKey(): string`; `ElevenLabsHttpError(status, detail, what = "speech-to-speech")` message `ElevenLabs ${what} failed: ${status} ${detail}`.

- [ ] **Step 1: Constants**

Append to `src/lib/elevenlabs/constants.ts` (and delete `VOICES_CACHE_TTL_MS`, replaced below):
```ts
// D283 — voice picker paging and caching.
export const ACCOUNT_VOICES_PAGE_SIZE = 100;
export const LIBRARY_PAGE_SIZE = 30;
export const ACCOUNT_VOICES_TTL_MS = 5 * 60 * 1000;
export const SINGLE_VOICE_TTL_MS = 5 * 60 * 1000;
export const LIBRARY_PAGE_TTL_MS = 60 * 1000;

/** ElevenLabs Voice Library filter values (the API's own vocabulary). */
export const LIBRARY_GENDERS = ["female", "male", "neutral"] as const;
export const LIBRARY_AGES = ["young", "middle_aged", "old"] as const;
export const LIBRARY_ACCENTS = [
  "indian", "american", "british", "australian", "african", "arabic", "irish", "canadian",
] as const;
export const LIBRARY_LANGUAGES = [
  { value: "hi", label: "Hindi" }, { value: "en", label: "English" }, { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" }, { value: "ml", label: "Malayalam" }, { value: "kn", label: "Kannada" },
  { value: "bn", label: "Bengali" }, { value: "mr", label: "Marathi" }, { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
] as const;
export const LIBRARY_USE_CASES = [
  "social_media", "advertisement", "conversational", "narrative_story", "informative_educational",
  "entertainment_tv", "characters_animation",
] as const;
export const LIBRARY_SORTS = [
  { value: "trending", label: "Trending" },
  { value: "cloned_by_count", label: "Most used" },
  { value: "created_date", label: "Newest" },
] as const;
```

- [ ] **Step 2: Write the failing tests**

`src/lib/elevenlabs/__tests__/voice-catalog.test.ts`:
```ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  priceMultiplierOf, mapAccountVoice, mapLibraryVoice, listAccountVoices, getAccountVoice,
  listLibraryVoices, saveLibraryVoice,
} from "../voice-catalog";
import { ElevenLabsKeyMissingError, ElevenLabsHttpError } from "../client";

beforeEach(() => { process.env.ELEVEN_LABS_API_KEY = "k"; });
afterEach(() => { delete process.env.ELEVEN_LABS_API_KEY; });

// Shapes copied from live responses, 2026-09-25.
const ACCOUNT_RAW = {
  voice_id: "a1", name: "Sarah", category: "premade", description: "Young adult woman",
  preview_url: "https://p/sarah.mp3",
  labels: { gender: "female", age: "young", accent: "american", language: "en", use_case: "informative_educational", descriptive: "professional" },
};
const SAVED_RAW = {
  voice_id: "s1", name: "David", category: "professional", description: null, preview_url: null,
  labels: { gender: "male" },
  sharing: { public_owner_id: "own1", original_voice_id: "lib1", rate: 2, fiat_rate: 0.2 },
};
const LIBRARY_RAW = {
  public_owner_id: "own2", voice_id: "lib2", name: "Anjali", accent: "indian", gender: "female",
  age: "young", descriptive: "warm", use_case: "social_media", category: "high_quality",
  language: "hi", description: "Warm, cheerful", preview_url: "https://p/anjali.mp3", rate: 1,
  is_added_by_user: false,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("priceMultiplierOf", () => {
  it("uses numeric rates ≥ 1 and defaults everything else to 1", () => {
    expect(priceMultiplierOf(2)).toBe(2);
    expect(priceMultiplierOf(1.5)).toBe(1.5);
    expect(priceMultiplierOf(undefined)).toBe(1);
    expect(priceMultiplierOf(null)).toBe(1);
    expect(priceMultiplierOf(0.5)).toBe(1);
    expect(priceMultiplierOf("2")).toBe(1);
  });
});

describe("mapAccountVoice / mapLibraryVoice", () => {
  it("maps an account voice, labels renamed to camelCase", () => {
    expect(mapAccountVoice(ACCOUNT_RAW)).toEqual({
      voiceId: "a1", source: "account", name: "Sarah", description: "Young adult woman",
      previewUrl: "https://p/sarah.mp3", category: "premade", priceMultiplier: 1,
      labels: { gender: "female", age: "young", accent: "american", language: "en", useCase: "informative_educational", descriptive: "professional" },
    });
  });

  it("takes a saved Library voice's multiplier from sharing.rate", () => {
    const v = mapAccountVoice(SAVED_RAW)!;
    expect(v.priceMultiplier).toBe(2);
    expect(v.originalVoiceId).toBe("lib1");
    expect(v.publicOwnerId).toBe("own1");
  });

  it("maps a Library voice from its flat fields", () => {
    expect(mapLibraryVoice(LIBRARY_RAW)).toEqual({
      voiceId: "lib2", source: "library", name: "Anjali", description: "Warm, cheerful",
      previewUrl: "https://p/anjali.mp3", category: "high_quality", priceMultiplier: 1,
      publicOwnerId: "own2", isAddedByUser: false,
      labels: { gender: "female", age: "young", accent: "indian", language: "hi", useCase: "social_media", descriptive: "warm" },
    });
  });

  it("returns null for malformed rows", () => {
    expect(mapAccountVoice({ name: "x" })).toBeNull();
    expect(mapLibraryVoice({ voice_id: "v", name: "n" })).toBeNull(); // no public_owner_id
    expect(mapLibraryVoice(null)).toBeNull();
  });
});

describe("listAccountVoices", () => {
  it("follows next_page_token across pages on /v2/voices", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ voices: [ACCOUNT_RAW], has_more: true, next_page_token: "t2" }))
      .mockResolvedValueOnce(json({ voices: [SAVED_RAW], has_more: false, next_page_token: null }));
    const voices = await listAccountVoices(fetchImpl as unknown as typeof fetch);
    expect(voices.map((v) => v.voiceId)).toEqual(["a1", "s1"]);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false",
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false&next_page_token=t2",
    );
    expect(fetchImpl.mock.calls[0][1]).toEqual({ headers: { "xi-api-key": "k" } });
  });

  it("throws ElevenLabsKeyMissingError without a key", async () => {
    delete process.env.ELEVEN_LABS_API_KEY;
    await expect(listAccountVoices(vi.fn())).rejects.toBeInstanceOf(ElevenLabsKeyMissingError);
  });

  it("throws ElevenLabsHttpError with the status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const err = await listAccountVoices(fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("voices");
  });
});

describe("getAccountVoice", () => {
  it("looks one voice up with voice_ids", async () => {
    const fetchImpl = vi.fn(async () => json({ voices: [SAVED_RAW], has_more: false }));
    const v = await getAccountVoice("s1", fetchImpl as unknown as typeof fetch);
    expect(v?.voiceId).toBe("s1");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v2/voices?voice_ids=s1");
  });

  it("returns null when the account doesn't have it", async () => {
    const fetchImpl = vi.fn(async () => json({ voices: [], has_more: false }));
    expect(await getAccountVoice("gone", fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});

describe("listLibraryVoices", () => {
  it("builds the shared-voices query and reports has_more", async () => {
    const fetchImpl = vi.fn(async () => json({ voices: [LIBRARY_RAW], has_more: true }));
    const out = await listLibraryVoices(
      { search: "warm", gender: "female", language: "hi", useCase: "social_media", sort: "trending", page: 2 },
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toEqual({ voices: [mapLibraryVoice(LIBRARY_RAW)], hasMore: true });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api.elevenlabs.io/v1/shared-voices");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page_size: "30", page: "2", include_custom_rates: "true", search: "warm", gender: "female",
      language: "hi", use_cases: "social_media", sort: "trending",
    });
  });
});

describe("saveLibraryVoice", () => {
  it("posts to /v1/voices/add and returns the new account id", async () => {
    const fetchImpl = vi.fn(async () => json({ voice_id: "acct9" }));
    const id = await saveLibraryVoice(
      { publicOwnerId: "own2", voiceId: "lib2", name: "Anjali" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(id).toBe("acct9");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/voices/add/own2/lib2", {
      method: "POST",
      headers: { "xi-api-key": "k", "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: "Anjali" }),
    });
  });

  it("surfaces ElevenLabs' refusal with its status and message", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"detail":{"message":"Voice not allowed"}}', { status: 403 }));
    const err = await saveLibraryVoice({ publicOwnerId: "o", voiceId: "v", name: "n" }, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("Voice not allowed");
  });
});
```

Rewrite `src/lib/elevenlabs/__tests__/voices-cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listAccountVoices: vi.fn(),
  getAccountVoice: vi.fn(),
  listLibraryVoices: vi.fn(),
}));
vi.mock("../voice-catalog", () => mocks);

import {
  getAccountVoicesCached, getVoiceCached, getLibraryPageCached, invalidateAccountVoices, _resetVoiceCaches,
} from "../voices-cache";

const V = { voiceId: "a", source: "account", name: "A", description: null, previewUrl: null, labels: {}, category: "premade", priceMultiplier: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  _resetVoiceCaches();
});

describe("getAccountVoicesCached", () => {
  it("reuses the list for 5 minutes, reloads after, and never caches a failure", async () => {
    mocks.listAccountVoices.mockRejectedValueOnce(new Error("down")).mockResolvedValue([V]);
    await expect(getAccountVoicesCached(() => 0)).rejects.toThrow("down");
    await getAccountVoicesCached(() => 0);
    await getAccountVoicesCached(() => 4 * 60 * 1000);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(2);
    await getAccountVoicesCached(() => 5 * 60 * 1000 + 1);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(3);
  });

  it("invalidateAccountVoices forces a reload", async () => {
    mocks.listAccountVoices.mockResolvedValue([V]);
    await getAccountVoicesCached(() => 0);
    invalidateAccountVoices();
    await getAccountVoicesCached(() => 1);
    expect(mocks.listAccountVoices).toHaveBeenCalledTimes(2);
  });
});

describe("getVoiceCached", () => {
  it("caches per id, including a not-found result", async () => {
    mocks.getAccountVoice.mockResolvedValueOnce(V).mockResolvedValueOnce(null);
    expect(await getVoiceCached("a", () => 0)).toEqual(V);
    expect(await getVoiceCached("a", () => 1000)).toEqual(V);
    expect(await getVoiceCached("gone", () => 0)).toBeNull();
    expect(await getVoiceCached("gone", () => 1000)).toBeNull();
    expect(mocks.getAccountVoice).toHaveBeenCalledTimes(2);
  });
});

describe("getLibraryPageCached", () => {
  it("caches each distinct query for 60 s", async () => {
    mocks.listLibraryVoices.mockResolvedValue({ voices: [], hasMore: false });
    await getLibraryPageCached({ page: 0, gender: "female" }, () => 0);
    await getLibraryPageCached({ gender: "female", page: 0 }, () => 30_000);
    await getLibraryPageCached({ page: 1, gender: "female" }, () => 30_000);
    expect(mocks.listLibraryVoices).toHaveBeenCalledTimes(2);
    await getLibraryPageCached({ page: 0, gender: "female" }, () => 61_000);
    expect(mocks.listLibraryVoices).toHaveBeenCalledTimes(3);
  });
});
```

In `client.test.ts`, delete the `mapVoices` and `listVoices` `describe` blocks and remove them from the import. Keep the `speechToSpeech` tests; add:
```ts
describe("ElevenLabsHttpError", () => {
  it("names what failed", () => {
    expect(new ElevenLabsHttpError(403, "no", "voice save").message).toBe("ElevenLabs voice save failed: 403 no");
    expect(new ElevenLabsHttpError(429, "busy").message).toBe("ElevenLabs speech-to-speech failed: 429 busy");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/elevenlabs`
Expected: FAIL — `../voice-catalog` missing; cache exports missing.

- [ ] **Step 4: Implement**

`src/lib/elevenlabs/client.ts` — remove `ElevenLabsVoice`, `mapVoices`, `listVoices` and the `CUSTOM_VOICE_CATEGORIES` import; export the key helper and generalise the error:
```ts
// D282 — ElevenLabs HTTP client. No `server-only`: the Trigger tasks import this too.
import { ELEVENLABS_API_BASE, VOICE_CHANGE_MODEL_ID } from "./constants";

export class ElevenLabsKeyMissingError extends Error {
  constructor() {
    super("ELEVEN_LABS_API_KEY is not set");
    this.name = "ElevenLabsKeyMissingError";
  }
}

// Carries the HTTP status so callers can classify retryable (429, 5xx) vs not (other 4xx).
export class ElevenLabsHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what = "speech-to-speech") {
    super(`ElevenLabs ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "ElevenLabsHttpError";
    this.status = status;
  }
}

export function elevenLabsKey(): string {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new ElevenLabsKeyMissingError();
  return key;
}

export async function speechToSpeech(
  args: { audio: Buffer; voiceId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(args.audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model_id", VOICE_CHANGE_MODEL_ID);
  const res = await fetchImpl(
    `${ELEVENLABS_API_BASE}/v1/speech-to-speech/${encodeURIComponent(args.voiceId)}`,
    { method: "POST", headers: { "xi-api-key": elevenLabsKey() }, body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ElevenLabsHttpError(res.status, detail);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

`src/lib/elevenlabs/voice-catalog.ts`:
```ts
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
```

Note: `new URL(...).searchParams` in the library test compares values, so `URLSearchParams` encoding is fine; `encodeURIComponent("s1")` is `s1`.

`src/lib/elevenlabs/voices-cache.ts` (full rewrite):
```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/elevenlabs`
Expected: PASS. (`src/app/api/elevenlabs/voices/route.ts` and the video-generate route still import `getVoicesCached` and will fail type-checking until Tasks 2 and 3 — do NOT run `tsc` here; the two routes are rewritten next.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/elevenlabs
git commit -m "feat(voice): voice catalog on current ElevenLabs endpoints (D283)"
```

---

### Task 2: Picker routes — list, single lookup, save

**Files:**
- Rewrite: `src/app/api/elevenlabs/voices/route.ts`, `src/app/api/elevenlabs/voices/route.test.ts`
- Create: `src/app/api/elevenlabs/voices/[voiceId]/route.ts` + `route.test.ts`, `src/app/api/elevenlabs/voices/save/route.ts` + `route.test.ts`
- Rewrite: `src/lib/elevenlabs/api.ts`
- Create: `src/lib/elevenlabs/route-errors.ts`

**Interfaces:**
- Consumes (Task 1): `getAccountVoicesCached`, `getVoiceCached`, `getLibraryPageCached`, `invalidateAccountVoices`, `saveLibraryVoice`, `type PickerVoice`, `ElevenLabsKeyMissingError`, `ElevenLabsHttpError`, `VOICE_NOT_SET_UP_MESSAGE`
- Produces:
  - `GET /api/elevenlabs/voices?source=account` → `{ voices: PickerVoice[], nextCursor: null }`
  - `GET /api/elevenlabs/voices?source=library&search&gender&age&accent&language&useCase&sort&cursor` → `{ voices, nextCursor: string | null }` (cursor = page number as a string)
  - `GET /api/elevenlabs/voices/{voiceId}` → `{ voice: PickerVoice }` | 404
  - `POST /api/elevenlabs/voices/save` body `{ publicOwnerId, voiceId, name }` → `{ voice: PickerVoice }`
  - `elevenLabsRouteError(e: unknown): Response` (503 key missing; ElevenLabs 4xx passed through with its message; else 502)
  - Browser: `elevenLabsApi.listVoices(params: Record<string, string>)`, `elevenLabsApi.saveVoice(body)` — both throw `Error(serverMessage)` on non-OK

- [ ] **Step 1: Write the failing tests**

`src/app/api/elevenlabs/voices/route.test.ts` (replace the file):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountVoicesCached: vi.fn(),
  getLibraryPageCached: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({
  getAccountVoicesCached: mocks.getAccountVoicesCached,
  getLibraryPageCached: mocks.getLibraryPageCached,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { GET } from "./route";
import { ElevenLabsKeyMissingError, ElevenLabsHttpError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

const V = { voiceId: "a", source: "account", name: "A", description: null, previewUrl: null, labels: {}, category: "premade", priceMultiplier: 1 };
const get = (qs = "") => GET(new Request(`http://x/api/elevenlabs/voices${qs}`));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices", () => {
  it("defaults to the whole account list with no cursor", async () => {
    mocks.getAccountVoicesCached.mockResolvedValue([V]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: [V], nextCursor: null });
  });

  it("pages the Library, passing filters and returning the next cursor", async () => {
    mocks.getLibraryPageCached.mockResolvedValue({ voices: [V], hasMore: true });
    const res = await get("?source=library&search=warm&gender=female&language=hi&useCase=social_media&sort=trending&cursor=2");
    expect(mocks.getLibraryPageCached).toHaveBeenCalledWith({
      page: 2, search: "warm", gender: "female", language: "hi", useCase: "social_media", sort: "trending",
    });
    expect(await res.json()).toEqual({ voices: [V], nextCursor: "3" });
  });

  it("returns nextCursor null on the last Library page, and page 0 without a cursor", async () => {
    mocks.getLibraryPageCached.mockResolvedValue({ voices: [], hasMore: false });
    const res = await get("?source=library");
    expect(mocks.getLibraryPageCached).toHaveBeenCalledWith({ page: 0 });
    expect((await res.json()).nextCursor).toBeNull();
  });

  it("400s on an unknown source or a bad cursor", async () => {
    expect((await get("?source=nope")).status).toBe(400);
    expect((await get("?source=library&cursor=-1")).status).toBe(400);
  });

  it("503s without a key, passes ElevenLabs 4xx through, 502s otherwise", async () => {
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new ElevenLabsKeyMissingError());
    const a = await get();
    expect(a.status).toBe(503);
    expect((await a.json()).error).toBe(VOICE_NOT_SET_UP_MESSAGE);
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new ElevenLabsHttpError(403, "forbidden", "voices"));
    expect((await get()).status).toBe(403);
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await get()).status).toBe(502);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
  });
});
```

`src/app/api/elevenlabs/voices/[voiceId]/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getVoiceCached: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: mocks.getVoiceCached }));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { GET } from "./route";

const V = { voiceId: "s1", source: "account", name: "David", description: null, previewUrl: null, labels: {}, category: "professional", priceMultiplier: 2 };
const get = (id: string) => GET(new Request(`http://x/api/elevenlabs/voices/${id}`), { params: Promise.resolve({ voiceId: id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices/[voiceId]", () => {
  it("returns the voice with its multiplier", async () => {
    mocks.getVoiceCached.mockResolvedValue(V);
    const res = await get("s1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voice: V });
  });

  it("404s when the account doesn't have it", async () => {
    mocks.getVoiceCached.mockResolvedValue(null);
    const res = await get("gone");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("That voice is no longer on the ElevenLabs account.");
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await get("s1")).status).toBe(401);
  });
});
```

`src/app/api/elevenlabs/voices/save/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  saveLibraryVoice: vi.fn(),
  getAccountVoicesCached: vi.fn(),
  getVoiceCached: vi.fn(),
  invalidateAccountVoices: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voice-catalog", () => ({ saveLibraryVoice: mocks.saveLibraryVoice }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({
  getAccountVoicesCached: mocks.getAccountVoicesCached,
  getVoiceCached: mocks.getVoiceCached,
  invalidateAccountVoices: mocks.invalidateAccountVoices,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { POST } from "./route";
import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";

const SAVED = { voiceId: "acct9", source: "account", name: "Anjali", description: null, previewUrl: null, labels: {}, category: "professional", priceMultiplier: 1, originalVoiceId: "lib2" };
const post = (body: unknown) => POST(new Request("http://x/api/elevenlabs/voices/save", { method: "POST", body: JSON.stringify(body) }));
const BODY = { publicOwnerId: "own2", voiceId: "lib2", name: "Anjali" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccountVoicesCached.mockResolvedValue([]);
});

describe("POST /api/elevenlabs/voices/save", () => {
  it("saves, refreshes the caches and returns the saved account voice", async () => {
    mocks.saveLibraryVoice.mockResolvedValue("acct9");
    mocks.getVoiceCached.mockResolvedValue(SAVED);
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voice: SAVED });
    expect(mocks.saveLibraryVoice).toHaveBeenCalledWith(BODY);
    expect(mocks.invalidateAccountVoices).toHaveBeenCalledWith("acct9");
  });

  it("reuses an existing saved copy instead of adding a duplicate", async () => {
    mocks.getAccountVoicesCached.mockResolvedValue([SAVED]);
    const res = await post(BODY);
    expect(await res.json()).toEqual({ voice: SAVED });
    expect(mocks.saveLibraryVoice).not.toHaveBeenCalled();
  });

  it("passes ElevenLabs' refusal through", async () => {
    mocks.saveLibraryVoice.mockRejectedValue(new ElevenLabsHttpError(403, "Voice not allowed", "voice save"));
    const res = await post(BODY);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Voice not allowed");
  });

  it("400s on an invalid body", async () => {
    expect((await post({ voiceId: "x" })).status).toBe(400);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/elevenlabs`
Expected: FAIL — new routes missing; list route has the old shape.

- [ ] **Step 3: Implement**

`src/lib/elevenlabs/route-errors.ts`:
```ts
import { apiError } from "@/lib/api/route-helpers";
import { ElevenLabsHttpError, ElevenLabsKeyMissingError } from "./client";
import { VOICE_NOT_SET_UP_MESSAGE } from "./constants";

/** D283 — one mapping for every ElevenLabs-backed route: 503 unset key, ElevenLabs 4xx through, else 502. */
export function elevenLabsRouteError(e: unknown) {
  if (e instanceof ElevenLabsKeyMissingError) return apiError(VOICE_NOT_SET_UP_MESSAGE, 503);
  if (e instanceof ElevenLabsHttpError && e.status >= 400 && e.status < 500) return apiError(e.message, e.status);
  return apiError(e instanceof Error ? e.message : "Could not reach ElevenLabs.", 502);
}
```

`src/app/api/elevenlabs/voices/route.ts`:
```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAccountVoicesCached, getLibraryPageCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import type { LibraryQuery } from "@/lib/elevenlabs/voice-catalog";

export const dynamic = "force-dynamic";

const LIBRARY_FILTERS = ["search", "gender", "age", "accent", "language", "useCase", "sort"] as const;

// D283 — the voice picker's two tabs. `account`: the whole account list (the browser filters it).
// `library`: one page of the ElevenLabs Voice Library, filtered by ElevenLabs.
export async function GET(req: Request) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);

  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "account";
  if (source !== "account" && source !== "library") return apiError("Unknown voice source.", 400);

  try {
    if (source === "account") {
      return apiOk({ voices: await getAccountVoicesCached(), nextCursor: null });
    }
    const cursor = url.searchParams.get("cursor");
    const page = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(page) || page < 0) return apiError("Invalid cursor.", 400);
    const q: LibraryQuery = { page };
    for (const key of LIBRARY_FILTERS) {
      const value = url.searchParams.get(key);
      if (value) q[key] = value;
    }
    const { voices, hasMore } = await getLibraryPageCached(q);
    return apiOk({ voices, nextCursor: hasMore ? String(page + 1) : null });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
```

`src/app/api/elevenlabs/voices/[voiceId]/route.ts`:
```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

// D283 — the node's selected voice: name, preview and price multiplier, without loading a list.
export async function GET(_req: Request, { params }: { params: Promise<{ voiceId: string }> }) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);
  const { voiceId } = await params;
  try {
    const voice = await getVoiceCached(voiceId);
    if (!voice) return apiError("That voice is no longer on the ElevenLabs account.", 404);
    return apiOk({ voice });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
```

`src/app/api/elevenlabs/voices/save/route.ts`:
```ts
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { saveLibraryVoice } from "@/lib/elevenlabs/voice-catalog";
import { getAccountVoicesCached, getVoiceCached, invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  publicOwnerId: z.string().min(1),
  voiceId: z.string().min(1),
  name: z.string().min(1).max(100),
});

// D283 — picking a Library voice saves it to the account; the node then stores the ACCOUNT id.
export async function POST(req: Request) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);
  const body = parsed.data;

  try {
    // Already saved (by anyone on the account)? Reuse it rather than add a duplicate.
    const existing = (await getAccountVoicesCached()).find(
      (v) => v.originalVoiceId === body.voiceId || v.voiceId === body.voiceId,
    );
    if (existing) return apiOk({ voice: existing });

    const savedId = await saveLibraryVoice(body);
    invalidateAccountVoices(savedId);
    const voice = await getVoiceCached(savedId);
    if (!voice) return apiError("ElevenLabs saved the voice but it isn't on the account yet. Try again.", 502);
    return apiOk({ voice });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
```

`src/lib/elevenlabs/api.ts` (full rewrite):
```ts
// D283 — browser wrappers for the voice picker routes. Throw with the server's message.
import type { PickerVoice } from "./voice-catalog";

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? "Could not reach the voice service.");
  return json;
}

export const elevenLabsApi = {
  listVoices(params: Record<string, string>): Promise<{ voices: PickerVoice[]; nextCursor: string | null }> {
    return call(`/api/elevenlabs/voices?${new URLSearchParams(params)}`);
  },
  async saveVoice(body: { publicOwnerId: string; voiceId: string; name: string }): Promise<PickerVoice> {
    return (
      await call<{ voice: PickerVoice }>("/api/elevenlabs/voices/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).voice;
  },
};
```

There is deliberately no `getVoice` wrapper: `useSelectedVoice` (Task 5) calls the single-voice route directly because it must tell a 404 apart from other failures.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/elevenlabs src/lib/elevenlabs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/elevenlabs src/lib/elevenlabs/api.ts src/lib/elevenlabs/route-errors.ts
git commit -m "feat(voice): voice list, lookup and save routes for the picker (D283)"
```

---

### Task 3: Price multiplier through the generation pipeline

**Files:**
- Modify: `src/lib/elevenlabs/cost.ts`, `src/lib/voice-change/types.ts`, `src/lib/voice-change/meta.ts`, `src/lib/voice-change/deliver.ts`, `src/app/api/nodes/[id]/video-generate/route.ts:31-37,77-104,318-331`, `src/lib/generations/complete.ts:160-180`
- Test: `src/lib/elevenlabs/__tests__/cost.test.ts`, `src/lib/voice-change/__tests__/meta.test.ts`, `src/lib/voice-change/__tests__/deliver.test.ts`, `src/app/api/nodes/[id]/video-generate/route.test.ts`, `src/lib/generations/complete.test.ts`

**Interfaces:**
- Consumes (Task 1): `getVoiceCached(voiceId): Promise<PickerVoice | null>`, `ElevenLabsKeyMissingError`
- Produces:
  - `computeVoiceChangeCost(durationSeconds: number, priceMultiplier = 1): { usd; inr }`
  - `VoicePayload.priceMultiplier: number`; `VoiceMeta.priceMultiplier: number` (readVoiceMeta defaults to 1 when absent)

- [ ] **Step 1: Write the failing tests**

`cost.test.ts` — add:
```ts
it("multiplies by a custom-rate voice's multiplier", () => {
  expect(computeVoiceChangeCost(60, 2).usd).toBeCloseTo(0.24, 10);
  expect(computeVoiceChangeCost(60).usd).toBeCloseTo(0.12, 10);
});
```

`meta.test.ts` — add:
```ts
it("keeps priceMultiplier and defaults it to 1 for versions written before D283", () => {
  expect(readVoiceMeta({ ...OK, priceMultiplier: 2 })?.priceMultiplier).toBe(2);
  expect(readVoiceMeta(OK)?.priceMultiplier).toBe(1);
  expect(readVoiceMeta({ ...OK, priceMultiplier: 0.5 })?.priceMultiplier).toBe(1);
});
```
and update the existing `toEqual` expectations in `meta.test.ts` to include `priceMultiplier: 1`.

`deliver.test.ts` — set `priceMultiplier: 2` on the `VOICE` fixture and update the applied-case `meta.voice` expectation to include `priceMultiplier: 2`; add `expect(out.meta.voice.priceMultiplier).toBe(2)` to the failed case.

`route.test.ts` (video-generate) — replace the `getVoicesCached` mock with a `getVoiceCached` mock:
```ts
// in vi.hoisted mocks:
getVoiceCached: vi.fn(async (id: string) =>
  id === "v1"
    ? { voiceId: "v1", source: "account", name: "Priya", description: null, previewUrl: null, labels: {}, category: "cloned", priceMultiplier: 1 }
    : id === "v2x"
      ? { voiceId: "v2x", source: "account", name: "David", description: null, previewUrl: null, labels: {}, category: "professional", priceMultiplier: 2 }
      : null,
),
// replace the voices-cache vi.mock:
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: mocks.getVoiceCached }));
```
Update the "key missing" test to `mocks.getVoiceCached.mockRejectedValueOnce(new ElevenLabsKeyMissingError())`, the mock-mode test to assert `mocks.getVoiceCached` not called, the payload expectation to include `priceMultiplier: 1`, and add:
```ts
it("reserves the voice cost times a custom-rate voice's multiplier", async () => {
  mocks.graph = simpleGraph();
  const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v2x" });
  expect(res.status).toBe(202);
  const payload = mocks.triggerTask.mock.calls[0][1] as unknown as { params: Record<string, unknown>; voice: { priceMultiplier: number } };
  expect(payload.voice.priceMultiplier).toBe(2);
  const p = payload.params;
  const duration = Number(p.seconds ?? p.duration ?? 0);
  const video = computeVideoCost(GEMINI_OMNI_MODEL_ID, duration, isVideoAudioEnabled(p.audio), asResolutionString(p.resolution))!;
  expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-1", usdToFinalCredits(video.usd + computeVoiceChangeCost(duration, 2).usd));
});
```

`complete.test.ts` — add:
```ts
it("settles a custom-rate voice with its multiplier", async () => {
  await completeGeneration({
    generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8,
    meta: { voice: { ...voice("applied"), priceMultiplier: 2 } },
  });
  expect(mocks.settleGeneration).toHaveBeenCalledWith(
    expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd() + computeVoiceChangeCost(8, 2).usd) }),
  );
});
```
and update the existing applied-voice `paramsUsed` expectation to include `priceMultiplier: 1` (readVoiceMeta now fills it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/elevenlabs src/lib/voice-change src/lib/generations "src/app/api/nodes/[id]/video-generate"`
Expected: FAIL on the new multiplier assertions.

- [ ] **Step 3: Implement**

`src/lib/elevenlabs/cost.ts`:
```ts
/** ElevenLabs bills voice change by audio duration, times the voice's custom-rate multiplier (D283). */
export function computeVoiceChangeCost(
  durationSeconds: number,
  priceMultiplier = 1,
): { usd: number; inr: number } {
  const usd = (durationSeconds / 60) * VOICE_CHANGE_USD_PER_MINUTE * priceMultiplier;
  return { usd, inr: usd * USD_TO_INR };
}
```

`types.ts` — add `priceMultiplier: number;` to both `VoicePayload` and `VoiceMeta` (doc: "≥ 1; D283").

`meta.ts` — add to the returned object:
```ts
    priceMultiplier:
      typeof v.priceMultiplier === "number" && v.priceMultiplier >= 1 ? v.priceMultiplier : 1,
```

`deliver.ts` — `const base = { voiceId: voice.voiceId, voiceName: voice.voiceName, originalUrl: voice.originalUrl, priceMultiplier: voice.priceMultiplier };`

`video-generate/route.ts` — replace the `getVoicesCached` import with `getVoiceCached`, and the lookup block with:
```ts
    let voiceName: string | undefined;
    let voicePriceMultiplier = 1;
    if (voiceId) {
      const blocked = voiceChangeBlockedReason(config.params.map((spec) => spec.name), resolvedParams);
      if (blocked) return apiError(blocked, 400);
      let voice;
      try {
        voice = await getVoiceCached(voiceId);
      } catch (e) {
        return apiError(
          e instanceof ElevenLabsKeyMissingError
            ? VOICE_NOT_SET_UP_MESSAGE
            : "Could not reach ElevenLabs to check the voice. Try again, or generate without a voice.",
          400,
        );
      }
      if (!voice) {
        return apiError("That voice is no longer on the ElevenLabs account. Pick another voice.", 400);
      }
      voiceName = voice.name;
      voicePriceMultiplier = voice.priceMultiplier;
    }
```
Reservation: `const voiceUsd = voiceId ? computeVoiceChangeCost(durationSeconds, voicePriceMultiplier).usd : 0;` and payload: `voice = { voiceId, voiceName, priceMultiplier: voicePriceMultiplier, ...urls };`.

`complete.ts` — `const voiceUsd = voice?.status === "applied" ? computeVoiceChangeCost(input.durationSeconds, voice.priceMultiplier).usd : 0;`

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/lib/elevenlabs src/lib/voice-change src/lib/generations "src/app/api/nodes/[id]/video-generate" src/app/api/elevenlabs && npx tsc --noEmit -p .`
Expected: PASS. `tsc` may still fail ONLY in `src/components/nodes/video-gen-voice-select.tsx`, its test and `src/hooks/use-elevenlabs-voices.ts` (they import the removed `ElevenLabsVoice`/`fetchVoices`); those files are deleted in Task 6. Any other `tsc` error must be fixed here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/elevenlabs/cost.ts src/lib/elevenlabs/__tests__/cost.test.ts src/lib/voice-change src/lib/generations "src/app/api/nodes/[id]/video-generate"
git commit -m "feat(voice): bill custom-rate voices with their multiplier (D283)"
```

---

### Task 4: Pure picker logic — filters, sorting, library query

**Files:**
- Create: `src/lib/elevenlabs/voice-filters.ts`
- Test: `src/lib/elevenlabs/__tests__/voice-filters.test.ts`

**Interfaces:**
- Consumes: `type PickerVoice`, `type VoiceLabels` (Task 1)
- Produces:
  - `type VoiceFilters = { search: string; gender: string; age: string; accent: string; language: string; useCase: string; sort: string }` (empty string = unset)
  - `EMPTY_FILTERS: VoiceFilters`, `ACCOUNT_SORTS = [{ value: "name", label: "Name" }, { value: "newest", label: "Newest" }]`
  - `filterAccountVoices(voices: PickerVoice[], f: VoiceFilters): PickerVoice[]` (custom voices first, then by the chosen sort)
  - `labelOptions(voices: PickerVoice[], key: keyof VoiceLabels): string[]` (distinct, sorted)
  - `libraryParams(f: VoiceFilters, cursor: string | null): Record<string, string>` (only set values; `source: "library"`; `cursor` only when non-null)
  - `hasActiveFilters(f: VoiceFilters): boolean` (ignores `sort`)
  - `formatLabel(value: string): string` ("middle_aged" → "Middle aged")

- [ ] **Step 1: Write the failing test**

`src/lib/elevenlabs/__tests__/voice-filters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS, filterAccountVoices, labelOptions, libraryParams, hasActiveFilters, formatLabel,
} from "../voice-filters";
import type { PickerVoice } from "../voice-catalog";

const v = (voiceId: string, name: string, labels: PickerVoice["labels"], category = "premade", description: string | null = null): PickerVoice => ({
  voiceId, source: "account", name, description, previewUrl: null, labels, category, priceMultiplier: 1,
});

const VOICES = [
  v("1", "Sarah", { gender: "female", age: "young", accent: "american", language: "en", useCase: "informative_educational" }),
  v("2", "Priya", { gender: "female", age: "young", accent: "indian", language: "hi", useCase: "social_media" }, "cloned", "Warm brand voice"),
  v("3", "Adam", { gender: "male", age: "middle_aged", accent: "american", language: "en" }),
];

describe("filterAccountVoices", () => {
  it("returns custom voices first, then by name, with no filters", () => {
    expect(filterAccountVoices(VOICES, EMPTY_FILTERS).map((x) => x.voiceId)).toEqual(["2", "3", "1"]);
  });

  it("filters by every label and matches search on name, description and labels", () => {
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, gender: "female" }).map((x) => x.voiceId)).toEqual(["2", "1"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, accent: "american", age: "middle_aged" }).map((x) => x.voiceId)).toEqual(["3"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, search: "warm" }).map((x) => x.voiceId)).toEqual(["2"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, search: "INDIAN" }).map((x) => x.voiceId)).toEqual(["2"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, language: "ta" })).toEqual([]);
  });

  it("keeps ElevenLabs' order within each group for 'newest'", () => {
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, sort: "newest" }).map((x) => x.voiceId)).toEqual(["2", "1", "3"]);
  });
});

describe("labelOptions", () => {
  it("lists distinct values present, sorted", () => {
    expect(labelOptions(VOICES, "accent")).toEqual(["american", "indian"]);
    expect(labelOptions(VOICES, "useCase")).toEqual(["informative_educational", "social_media"]);
  });
});

describe("libraryParams", () => {
  it("sends only set filters plus the source and cursor", () => {
    expect(libraryParams({ ...EMPTY_FILTERS, gender: "female", language: "hi", sort: "trending" }, "3")).toEqual({
      source: "library", gender: "female", language: "hi", sort: "trending", cursor: "3",
    });
    expect(libraryParams(EMPTY_FILTERS, null)).toEqual({ source: "library" });
  });
});

describe("hasActiveFilters / formatLabel", () => {
  it("ignores sort when deciding whether filters are active", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: "trending" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "x" })).toBe(true);
  });

  it("humanises API values", () => {
    expect(formatLabel("middle_aged")).toBe("Middle aged");
    expect(formatLabel("social_media")).toBe("Social media");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/elevenlabs/__tests__/voice-filters.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/lib/elevenlabs/voice-filters.ts`:
```ts
// D283 — pure voice-picker logic, shared by the hook and components and unit-tested here.
import { CUSTOM_VOICE_CATEGORIES } from "./constants";
import type { PickerVoice, VoiceLabels } from "./voice-catalog";

export type VoiceFilters = {
  search: string;
  gender: string;
  age: string;
  accent: string;
  language: string;
  useCase: string;
  sort: string;
};

export const EMPTY_FILTERS: VoiceFilters = {
  search: "", gender: "", age: "", accent: "", language: "", useCase: "", sort: "",
};

export const ACCOUNT_SORTS = [
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
] as const;

const LABEL_KEYS = ["gender", "age", "accent", "language", "useCase"] as const;

export function hasActiveFilters(f: VoiceFilters): boolean {
  return f.search.trim() !== "" || LABEL_KEYS.some((k) => f[k] !== "");
}

function matchesSearch(v: PickerVoice, q: string): boolean {
  const hay = [v.name, v.description ?? "", ...Object.values(v.labels)].join(" ").toLowerCase();
  return hay.includes(q);
}

/** Account voices after search + label filters; custom voices first, then name (or ElevenLabs' order for "newest"). */
export function filterAccountVoices(voices: PickerVoice[], f: VoiceFilters): PickerVoice[] {
  const q = f.search.trim().toLowerCase();
  const kept = voices.filter(
    (v) => (!q || matchesSearch(v, q)) && LABEL_KEYS.every((k) => !f[k] || v.labels[k] === f[k]),
  );
  const rank = (v: PickerVoice) => (CUSTOM_VOICE_CATEGORIES.has(v.category) ? 0 : 1);
  const indexed = kept.map((v, i) => ({ v, i }));
  indexed.sort(
    (a, b) => rank(a.v) - rank(b.v) || (f.sort === "newest" ? a.i - b.i : a.v.name.localeCompare(b.v.name)),
  );
  return indexed.map((x) => x.v);
}

export function labelOptions(voices: PickerVoice[], key: keyof VoiceLabels): string[] {
  return [...new Set(voices.map((v) => v.labels[key]).filter((x): x is string => Boolean(x)))].sort();
}

export function libraryParams(f: VoiceFilters, cursor: string | null): Record<string, string> {
  const out: Record<string, string> = { source: "library" };
  if (f.search.trim()) out.search = f.search.trim();
  for (const k of LABEL_KEYS) if (f[k]) out[k] = f[k];
  if (f.sort) out.sort = f.sort;
  if (cursor !== null) out.cursor = cursor;
  return out;
}

export function formatLabel(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Note on the "newest" test: `/v2/voices` returns voices in ElevenLabs' order; "newest" keeps that order within each group (custom first). The fixture's original order is 1, 2, 3 → custom `2` first, then `1`, `3`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/elevenlabs/__tests__/voice-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/elevenlabs/voice-filters.ts src/lib/elevenlabs/__tests__/voice-filters.test.ts
git commit -m "feat(voice): pure voice-picker filtering and query helpers (D283)"
```

---

### Task 5: Hooks + shared infinite-scroll sentinel

**Files:**
- Move: `src/components/review/infinite-scroll-sentinel.tsx` → `src/components/shared/infinite-scroll-sentinel.tsx`; update imports in `src/components/identity/review-inbox.tsx:13` and `src/components/canvas/review-drawer/review-drawer.tsx:14`
- Create: `src/hooks/use-voice-browser.ts`, `src/hooks/use-selected-voice.ts`

**Interfaces:**
- Consumes: `elevenLabsApi` (Task 2), `VoiceFilters`, `EMPTY_FILTERS`, `filterAccountVoices`, `libraryParams` (Task 4), `type PickerVoice` (Task 1)
- Produces:
  - `useVoiceBrowser(open: boolean)` returning `{ tab, setTab, filters, setFilter(key, value), clearFilters(), accountVoices (filtered), accountAll, library: { voices, loading, error, hasMore, loadMore() }, accountLoading, accountError, retry(), preview: { playingId, toggle(voice) }, saving: { id, error }, choose(voice): Promise<string | null> }` — `choose` returns the account voiceId to store, or null on a save refusal
  - `useSelectedVoice(voiceId: string | null)` returning `{ voice: PickerVoice | null; loading: boolean; notFound: boolean; error: string | null }`
  - `InfiniteScrollSentinel` at `@/components/shared/infinite-scroll-sentinel` (unchanged API)

- [ ] **Step 1: Move the sentinel**

Run: `git mv src/components/review/infinite-scroll-sentinel.tsx src/components/shared/infinite-scroll-sentinel.tsx`
Update both imports to `@/components/shared/infinite-scroll-sentinel`, and change the component's comment "the reviewer" → "the user" (it now serves two features).

- [ ] **Step 2: Implement `use-selected-voice.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/**
 * D283 — resolves the node's stored voiceId to a voice (name, preview, multiplier) with one lookup,
 * so nothing depends on which list page is loaded. `notFound` = the account no longer has it.
 */
export function useSelectedVoice(voiceId: string | null) {
  const [state, setState] = useState<{ voice: PickerVoice | null; loading: boolean; notFound: boolean; error: string | null }>(
    { voice: null, loading: false, notFound: false, error: null },
  );

  useEffect(() => {
    if (!voiceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the selection clears
      setState({ voice: null, loading: false, notFound: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, notFound: false, error: null }));
    fetch(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { voice?: PickerVoice; error?: string } | null;
        if (cancelled) return;
        if (res.status === 404) setState({ voice: null, loading: false, notFound: true, error: null });
        else if (!res.ok || !json?.voice) setState({ voice: null, loading: false, notFound: false, error: json?.error ?? "Could not load the voice." });
        else setState({ voice: json.voice, loading: false, notFound: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ voice: null, loading: false, notFound: false, error: "Could not load the voice." });
      });
    return () => {
      cancelled = true;
    };
  }, [voiceId]);

  return state;
}
```
(The route is called directly rather than via `elevenLabsApi.getVoice` because the node must tell a 404 apart from other failures. Check how `use-tracked-handles.ts` words its `set-state-in-effect` disable and match it.)

- [ ] **Step 3: Implement `use-voice-browser.ts`**

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import {
  EMPTY_FILTERS, filterAccountVoices, libraryParams, type VoiceFilters,
} from "@/lib/elevenlabs/voice-filters";

export type VoiceTab = "account" | "library";
const SEARCH_DEBOUNCE_MS = 300;

/** D283 — state for the voice picker popover: tabs, filters, both lists, paging, one preview at a time. */
export function useVoiceBrowser(open: boolean) {
  const [tab, setTab] = useState<VoiceTab>("account");
  const [filters, setFilters] = useState<VoiceFilters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [accountAll, setAccountAll] = useState<PickerVoice[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountNonce, setAccountNonce] = useState(0);

  const [library, setLibrary] = useState<{ voices: PickerVoice[]; cursor: string | null; hasMore: boolean }>(
    { voices: [], cursor: null, hasMore: true },
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const libraryReq = useRef(0);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [saving, setSaving] = useState<{ id: string | null; error: string | null }>({ id: null, error: null });

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Account list: load once per open (server caches 5 min); reload on Retry.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for this fetch
    setAccountLoading(true);
    elevenLabsApi
      .listVoices({ source: "account" })
      .then((r) => {
        if (!cancelled) { setAccountAll(r.voices); setAccountError(null); }
      })
      .catch((e: unknown) => {
        if (!cancelled) setAccountError(e instanceof Error ? e.message : "Could not load voices.");
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, accountNonce]);

  const libraryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const fetchLibraryPage = useCallback(
    (cursor: string | null) => {
      const req = ++libraryReq.current;
      setLibraryLoading(true);
      elevenLabsApi
        .listVoices(libraryParams(libraryFilters, cursor))
        .then((r) => {
          if (req !== libraryReq.current) return; // a newer filter change superseded this page
          setLibrary((prev) => ({
            voices: cursor === null ? r.voices : [...prev.voices, ...r.voices],
            cursor: r.nextCursor,
            hasMore: r.nextCursor !== null,
          }));
          setLibraryError(null);
        })
        .catch((e: unknown) => {
          if (req === libraryReq.current) setLibraryError(e instanceof Error ? e.message : "Could not load the Voice Library.");
        })
        .finally(() => {
          if (req === libraryReq.current) setLibraryLoading(false);
        });
    },
    [libraryFilters],
  );

  // Library: first page whenever the tab opens or its filters change.
  useEffect(() => {
    if (!open || tab !== "library") return;
    fetchLibraryPage(null);
  }, [open, tab, fetchLibraryPage]);

  const loadMore = useCallback(() => {
    if (libraryLoading || !library.hasMore || library.cursor === null) return;
    fetchLibraryPage(library.cursor);
  }, [libraryLoading, library.hasMore, library.cursor, fetchLibraryPage]);

  // Preview: one element, one voice at a time; stopped on close/unmount.
  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const togglePreview = useCallback(
    (voice: PickerVoice) => {
      if (playingId === voice.voiceId) return stopPreview();
      stopPreview();
      if (!voice.previewUrl) return;
      const audio = new Audio(voice.previewUrl);
      audio.onended = () => setPlayingId((id) => (id === voice.voiceId ? null : id));
      audioRef.current = audio;
      setPlayingId(voice.voiceId);
      void audio.play().catch(() => setPlayingId(null));
    },
    [playingId, stopPreview],
  );

  // Stop only on an open → closed transition (the trigger's own preview button plays while closed).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) stopPreview();
    wasOpen.current = open;
  }, [open, stopPreview]);
  useEffect(() => stopPreview, [stopPreview]);

  /** The account voiceId to store for `voice`, saving Library voices first. Null on refusal. */
  const choose = useCallback(async (voice: PickerVoice): Promise<string | null> => {
    if (voice.source === "account") return voice.voiceId;
    setSaving({ id: voice.voiceId, error: null });
    try {
      const saved = await elevenLabsApi.saveVoice({
        publicOwnerId: voice.publicOwnerId ?? "",
        voiceId: voice.voiceId,
        name: voice.name,
      });
      setSaving({ id: null, error: null });
      setAccountNonce((n) => n + 1); // the saved voice now belongs under My voices
      return saved.voiceId;
    } catch (e) {
      setSaving({ id: voice.voiceId, error: e instanceof Error ? e.message : "Could not save this voice." });
      return null;
    }
  }, []);

  return {
    tab,
    setTab,
    filters,
    setFilter: (key: keyof VoiceFilters, value: string) => setFilters((f) => ({ ...f, [key]: value })),
    clearFilters: () => setFilters((f) => ({ ...EMPTY_FILTERS, sort: f.sort })),
    accountAll,
    accountVoices: filterAccountVoices(accountAll, filters),
    accountLoading,
    accountError,
    library: { voices: library.voices, loading: libraryLoading, error: libraryError, hasMore: library.hasMore, loadMore },
    retry: () => (tab === "account" ? setAccountNonce((n) => n + 1) : fetchLibraryPage(null)),
    preview: { playingId, toggle: togglePreview },
    saving,
    choose,
  };
}
```

Filters are shared across tabs but each tab uses the keys it supports; switching tabs keeps search text. Changing tab resets `sort` is NOT needed — account ignores Library sort values and vice versa (unknown account sort = name order).

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit -p . && npm run lint -- src/hooks/use-voice-browser.ts src/hooks/use-selected-voice.ts src/components/shared src/components/identity/review-inbox.tsx src/components/canvas/review-drawer/review-drawer.tsx`
Expected: clean except the files Task 6 deletes (`video-gen-voice-select.tsx`, its test, `use-elevenlabs-voices.ts`). Fix any `react-hooks/*` lint error with the repo's precedent (`use-tracked-handles.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-voice-browser.ts src/hooks/use-selected-voice.ts src/components/shared src/components/review src/components/identity/review-inbox.tsx src/components/canvas/review-drawer/review-drawer.tsx
git commit -m "feat(voice): voice browser hooks; share the infinite-scroll sentinel (D283)"
```

---

### Task 6: The Voice picker components + focus-view swap

**Files:**
- Create: `src/components/nodes/video-gen-voice-picker.tsx`, `src/components/nodes/video-gen-voice-picker-filters.tsx`, `src/components/nodes/video-gen-voice-picker-list.tsx`, `src/components/nodes/video-gen-voice-picker-row.tsx`
- Test: `src/components/nodes/__tests__/video-gen-voice-picker.test.tsx` (moved from `video-gen-voice-select.test.tsx`)
- Modify: `src/components/nodes/video-gen-focus-view.tsx` (imports ~128-132, ~537, ~1216-1236, ~1602-1611)
- Delete: `src/components/nodes/video-gen-voice-select.tsx`, `src/components/nodes/__tests__/video-gen-voice-select.test.tsx`, `src/hooks/use-elevenlabs-voices.ts`

**Interfaces:**
- Consumes: `useVoiceBrowser`, `useSelectedVoice` (Task 5); `formatLabel`, `labelOptions`, `hasActiveFilters`, `ACCOUNT_SORTS`, `VoiceFilters` (Task 4); library option constants (Task 1); `computeVoiceChangeCost(duration, multiplier)` (Task 3); `InfiniteScrollSentinel` (Task 5)
- Produces:
  - `voiceTriggerLabel({ value, selected, loading, notFound, blockedReason }): string`
  - `resolveEffectiveVoiceId({ value, loading, notFound, error, blockedReason }): string | null`
  - `<VideoGenVoicePicker value onChange blockedReason selected selectedLoading selectedNotFound selectedError />`

- [ ] **Step 1: Write the failing test**

`src/components/nodes/__tests__/video-gen-voice-picker.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { voiceTriggerLabel, resolveEffectiveVoiceId } from "../video-gen-voice-picker";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

const PRIYA: PickerVoice = {
  voiceId: "v1", source: "account", name: "Priya", description: null, previewUrl: null,
  labels: { gender: "female", accent: "indian" }, category: "cloned", priceMultiplier: 1,
};
const base = { value: "v1", selected: PRIYA, loading: false, notFound: false, blockedReason: null };

describe("voiceTriggerLabel", () => {
  it("covers every state", () => {
    expect(voiceTriggerLabel({ ...base, blockedReason: "Audio off" })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, value: null, selected: null })).toBe("Original (no change)");
    expect(voiceTriggerLabel({ ...base, selected: null, loading: true })).toBe("Loading voice…");
    expect(voiceTriggerLabel({ ...base, selected: null, notFound: true })).toBe("Unavailable voice");
    expect(voiceTriggerLabel(base)).toBe("Priya");
    expect(voiceTriggerLabel({ ...base, selected: null })).toBe("Selected voice");
  });
});

describe("resolveEffectiveVoiceId", () => {
  const r = { value: "v1", loading: false, notFound: false, error: null, blockedReason: null };
  it("drops the voice only when blocked or confirmed gone", () => {
    expect(resolveEffectiveVoiceId(r)).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, value: null })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, blockedReason: "Audio off" })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, notFound: true })).toBeNull();
    expect(resolveEffectiveVoiceId({ ...r, loading: true })).toBe("v1");
    expect(resolveEffectiveVoiceId({ ...r, error: "network" })).toBe("v1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/video-gen-voice-picker.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the row**

`src/components/nodes/video-gen-voice-picker-row.tsx`:
```tsx
"use client";

import { Check, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  voice: PickerVoice;
  selected: boolean;
  playing: boolean;
  saving: boolean;
  saveError: string | null;
  onSelect: () => void;
  onTogglePreview: () => void;
};

// D283 — one voice: inline preview, name, two labels, one-line description, price badge, selected check.
export function VideoGenVoicePickerRow({ voice, selected, playing, saving, saveError, onSelect, onTogglePreview }: Props) {
  const labels = [voice.labels.gender, voice.labels.accent ?? voice.labels.language].filter(Boolean) as string[];
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1", selected && "bg-primary/5")}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="nodrag shrink-0"
          aria-label={`${playing ? "Stop" : "Play"} preview of ${voice.name}`}
          disabled={!voice.previewUrl}
          onClick={onTogglePreview}
        >
          {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="nodrag h-auto min-w-0 flex-1 justify-start gap-2 px-1.5 py-1 text-left"
          onClick={onSelect}
          disabled={saving}
          aria-pressed={selected}
          data-voice-row
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{voice.name}</span>
              {voice.priceMultiplier > 1 && (
                <Badge variant="secondary" title={`Costs ${voice.priceMultiplier}× the standard rate`}>
                  {voice.priceMultiplier}×
                </Badge>
              )}
            </span>
            {voice.description && (
              <span className="truncate text-xs text-muted-foreground">{voice.description}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {labels.map((l) => (
              <Badge key={l} variant="outline" className="text-[0.65rem]">{formatLabel(l)}</Badge>
            ))}
          </span>
          {saving ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" strokeWidth={1.5} />
          ) : selected ? (
            <Check className="size-4 shrink-0 text-primary" strokeWidth={1.5} />
          ) : null}
        </Button>
      </div>
      {saveError && <p className="px-10 pb-1 text-xs text-destructive">{saveError}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement the filters**

`src/components/nodes/video-gen-voice-picker-filters.tsx`:
```tsx
"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LIBRARY_ACCENTS, LIBRARY_AGES, LIBRARY_GENDERS, LIBRARY_LANGUAGES, LIBRARY_SORTS, LIBRARY_USE_CASES,
} from "@/lib/elevenlabs/constants";
import { ACCOUNT_SORTS, formatLabel, hasActiveFilters, labelOptions, type VoiceFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { VoiceTab } from "@/hooks/use-voice-browser";

const ANY = "any";

type Option = { value: string; label: string };
const opts = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: formatLabel(v) }));

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(!v || v === ANY ? "" : String(v))}>
      <SelectTrigger size="sm" className="nodrag h-7 text-xs" aria-label={label}>
        <SelectValue>{value ? (options.find((o) => o.value === value)?.label ?? formatLabel(value)) : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} className="text-xs">Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Props = {
  tab: VoiceTab;
  filters: VoiceFilters;
  accountAll: PickerVoice[];
  onFilter: (key: keyof VoiceFilters, value: string) => void;
  onClear: () => void;
};

// D283 — search + filter row. My voices: options from the loaded voices' labels. Library: ElevenLabs' vocabulary.
export function VideoGenVoicePickerFilters({ tab, filters, accountAll, onFilter, onClear }: Props) {
  const lib = tab === "library";
  const genders = lib ? opts(LIBRARY_GENDERS) : opts(labelOptions(accountAll, "gender"));
  const ages = lib ? opts(LIBRARY_AGES) : opts(labelOptions(accountAll, "age"));
  const accents = lib ? opts(LIBRARY_ACCENTS) : opts(labelOptions(accountAll, "accent"));
  const languages: Option[] = lib ? [...LIBRARY_LANGUAGES] : opts(labelOptions(accountAll, "language"));
  const useCases = lib ? opts(LIBRARY_USE_CASES) : opts(labelOptions(accountAll, "useCase"));
  const sorts: Option[] = lib ? [...LIBRARY_SORTS] : [...ACCOUNT_SORTS];

  return (
    <div className="flex flex-col gap-2">
      <InputGroup className="nodrag">
        <InputGroupAddon>
          <Search className="size-4" strokeWidth={1.5} />
        </InputGroupAddon>
        <InputGroupInput
          id="voice-picker-search"
          placeholder={lib ? "Search 18,000+ voices…" : "Search your voices…"}
          value={filters.search}
          onChange={(e) => onFilter("search", e.target.value)}
        />
        {filters.search && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton aria-label="Clear search" onClick={() => onFilter("search", "")}>
              <X className="size-3.5" strokeWidth={1.5} />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect label="Gender" value={filters.gender} options={genders} onChange={(v) => onFilter("gender", v)} />
        <FilterSelect label="Age" value={filters.age} options={ages} onChange={(v) => onFilter("age", v)} />
        <FilterSelect label="Accent" value={filters.accent} options={accents} onChange={(v) => onFilter("accent", v)} />
        <FilterSelect label="Language" value={filters.language} options={languages} onChange={(v) => onFilter("language", v)} />
        <FilterSelect label="Use case" value={filters.useCase} options={useCases} onChange={(v) => onFilter("useCase", v)} />
        <FilterSelect label="Sort" value={filters.sort} options={sorts} onChange={(v) => onFilter("sort", v)} />
        {hasActiveFilters(filters) && (
          <Button type="button" variant="link" size="sm" className="nodrag h-7 px-1 text-xs" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
```
Before finishing, open `src/components/ui/input-group.tsx` and `select.tsx` to confirm `InputGroupButton`'s default size and that `SelectTrigger` accepts `size="sm"`; adjust the prop names to what exists.

- [ ] **Step 5: Implement the list**

`src/components/nodes/video-gen-voice-picker-list.tsx`:
```tsx
"use client";

import { Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VideoGenVoicePickerRow } from "./video-gen-voice-picker-row";

type Props = {
  voices: PickerVoice[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  filtered: boolean;
  infinite: { hasMore: boolean; onMore: () => void } | null;
  playingId: string | null;
  saving: { id: string | null; error: string | null };
  onSelect: (voice: PickerVoice | null) => void;
  onTogglePreview: (voice: PickerVoice) => void;
  onRetry: () => void;
  onClearFilters: () => void;
};

// D283 — "Original" first, then voice rows; skeleton / empty / error states; infinite scroll for the Library.
export function VideoGenVoicePickerList(p: Props) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-voice-row]"));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)];
    next?.focus();
    e.preventDefault();
  }

  const initialLoading = p.loading && p.voices.length === 0;
  return (
    <ScrollArea className="h-[340px]">
      <div className="flex flex-col gap-0.5 pr-2" onKeyDown={onKeyDown}>
        <Button
          type="button"
          variant="ghost"
          className="nodrag h-9 justify-between px-2.5 text-sm"
          onClick={() => p.onSelect(null)}
          aria-pressed={p.selectedId === null}
          data-voice-row
        >
          Original (no change)
          {p.selectedId === null && <Check className="size-4 text-primary" strokeWidth={1.5} />}
        </Button>

        {initialLoading &&
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mx-1.5 my-1 h-9" />)}

        {!initialLoading && p.error && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <span>{p.error}</span>
            <Button type="button" variant="outline" size="sm" className="nodrag" onClick={p.onRetry}>Retry</Button>
          </div>
        )}

        {!initialLoading && !p.error && p.voices.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-2.5 py-6 text-xs text-muted-foreground">
            No voices match.
            {p.filtered && (
              <Button type="button" variant="outline" size="sm" className="nodrag" onClick={p.onClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {p.voices.map((v) => (
          <VideoGenVoicePickerRow
            key={`${v.source}:${v.voiceId}`}
            voice={v}
            selected={p.selectedId === v.voiceId}
            playing={p.playingId === v.voiceId}
            saving={p.saving.id === v.voiceId && !p.saving.error}
            saveError={p.saving.id === v.voiceId ? p.saving.error : null}
            onSelect={() => p.onSelect(v)}
            onTogglePreview={() => p.onTogglePreview(v)}
          />
        ))}

        {p.infinite && p.infinite.hasMore && !p.error && p.voices.length > 0 && (
          <InfiniteScrollSentinel onVisible={p.infinite.onMore} loading={p.loading} />
        )}
      </div>
    </ScrollArea>
  );
}
```
Keyboard: ↑/↓ move between row select buttons (`data-voice-row`), Enter selects (native button), each row's play button is its own tab stop.

- [ ] **Step 6: Implement the picker (trigger + popover) and the pure helpers**

`src/components/nodes/video-gen-voice-picker.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatLabel, hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";

/** What the trigger reads. `blockedReason` wins; then loading; then a confirmed-gone voice. */
export function voiceTriggerLabel(a: {
  value: string | null;
  selected: PickerVoice | null;
  loading: boolean;
  notFound: boolean;
  blockedReason: string | null;
}): string {
  if (a.blockedReason || !a.value) return "Original (no change)";
  if (a.selected) return a.selected.name;
  if (a.loading) return "Loading voice…";
  if (a.notFound) return "Unavailable voice";
  return "Selected voice";
}

/**
 * The voice id to send and price. Dropped when blocked (audio off / mock) or when the lookup
 * CONFIRMED the account no longer has it; kept while loading or on a lookup error, so a flaky
 * lookup never silently generates without the voice (the route gives its own clear 400).
 */
export function resolveEffectiveVoiceId(a: {
  value: string | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  blockedReason: string | null;
}): string | null {
  if (!a.value || a.blockedReason || a.notFound) return null;
  return a.value;
}

type Props = {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  blockedReason: string | null;
  selected: PickerVoice | null;
  selectedLoading: boolean;
  selectedNotFound: boolean;
};

// D283 — the Video Gen voice picker: trigger + popover over My voices and the Voice Library.
export function VideoGenVoicePicker({ value, onChange, blockedReason, selected, selectedLoading, selectedNotFound }: Props) {
  const [open, setOpen] = useState(false);
  const b = useVoiceBrowser(open);
  const label = voiceTriggerLabel({ value, selected, loading: selectedLoading, notFound: selectedNotFound, blockedReason });
  const subLabels = !blockedReason && selected
    ? [selected.labels.gender, selected.labels.accent].filter(Boolean).map((l) => formatLabel(l as string)).join(" · ")
    : "";

  async function pick(voice: PickerVoice | null) {
    if (!voice) {
      onChange(null);
      setOpen(false);
      return;
    }
    const id = await b.choose(voice);
    if (id) {
      onChange(id);
      setOpen(false);
    }
  }

  const lib = b.tab === "library";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={Boolean(blockedReason)}
            render={
              <Button type="button" variant="outline" className="nodrag h-auto min-h-8 flex-1 justify-between gap-2 py-1.5 text-left" aria-label="Voice" />
            }
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{label}</span>
              {subLabels && <span className="truncate text-xs text-muted-foreground">{subLabels}</span>}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[440px] max-w-[calc(100vw-2rem)] p-3">
            <div className="flex flex-col gap-3">
              <Tabs value={b.tab} onValueChange={(t) => b.setTab(t as VoiceTab)}>
                <TabsList>
                  <TabsTrigger value="account">My voices</TabsTrigger>
                  <TabsTrigger value="library">Voice Library</TabsTrigger>
                </TabsList>
              </Tabs>
              <VideoGenVoicePickerFilters
                tab={b.tab}
                filters={b.filters}
                accountAll={b.accountAll}
                onFilter={b.setFilter}
                onClear={b.clearFilters}
              />
              <VideoGenVoicePickerList
                voices={lib ? b.library.voices : b.accountVoices}
                selectedId={value}
                loading={lib ? b.library.loading : b.accountLoading}
                error={lib ? b.library.error : b.accountError}
                filtered={hasActiveFilters(b.filters)}
                infinite={lib ? { hasMore: b.library.hasMore, onMore: b.library.loadMore } : null}
                playingId={b.preview.playingId}
                saving={b.saving}
                onSelect={(v) => void pick(v)}
                onTogglePreview={b.preview.toggle}
                onRetry={b.retry}
                onClearFilters={b.clearFilters}
              />
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="nodrag shrink-0"
          aria-label={selected ? `Play preview of ${selected.name}` : "Play voice preview"}
          disabled={!selected?.previewUrl || Boolean(blockedReason)}
          onClick={() => selected && b.preview.toggle(selected)}
        >
          {selected && b.preview.playingId === selected.voiceId ? (
            <Pause className="size-4" strokeWidth={1.5} />
          ) : (
            <Play className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>
      {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      {!blockedReason && selected && selected.priceMultiplier > 1 && (
        <p className="text-xs text-muted-foreground">This voice costs {selected.priceMultiplier}× the standard voice-change rate.</p>
      )}
      {!blockedReason && selected && (
        <p className="text-xs text-muted-foreground">The clip&apos;s voice is changed after it generates. Timing stays the same.</p>
      )}
    </div>
  );
}
```
Before finishing: confirm in `src/components/ui/popover.tsx` that `PopoverTrigger` supports `render` and `disabled`, and in `tabs.tsx` the `Tabs` `onValueChange` signature; adapt minimally. The trigger's preview button shares the hook's single audio element; the hook stops playback only on an open → closed transition, so the trigger preview works while the popover is closed.

- [ ] **Step 7: Swap the focus view**

In `src/components/nodes/video-gen-focus-view.tsx`:
- Replace the imports at ~128-129 with:
```ts
import { VideoGenVoicePicker, resolveEffectiveVoiceId } from "./video-gen-voice-picker";
import { useSelectedVoice } from "@/hooks/use-selected-voice";
```
- Replace `const voiceList = useElevenLabsVoices(open);` (~537) with `const selectedVoice = useSelectedVoice(voiceIdProp);`
- Replace the `resolveEffectiveVoiceId({...})` call and the voice cost (~1224-1236) with:
```ts
  const effectiveVoiceId = resolveEffectiveVoiceId({
    value: voiceIdProp,
    loading: selectedVoice.loading,
    notFound: selectedVoice.notFound,
    error: selectedVoice.error,
    blockedReason: voiceBlockedReason,
  });
  const videoCostEstimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  const voiceCostUsd = effectiveVoiceId
    ? computeVoiceChangeCost(durationSeconds, selectedVoice.voice?.priceMultiplier ?? 1).usd
    : 0;
```
(keep the existing `estimatedCredits` line after it).
- Replace the `<VideoGenVoiceSelect … />` block (~1603-1610) with:
```tsx
                    <VideoGenVoicePicker
                      value={voiceIdProp}
                      onChange={(v) => onPatch({ voiceId: v })}
                      blockedReason={voiceBlockedReason}
                      selected={selectedVoice.voice}
                      selectedLoading={selectedVoice.loading}
                      selectedNotFound={selectedVoice.notFound}
                    />
```
- Delete `src/components/nodes/video-gen-voice-select.tsx`, `src/components/nodes/__tests__/video-gen-voice-select.test.tsx`, `src/hooks/use-elevenlabs-voices.ts` (`git rm`).

- [ ] **Step 8: Verify**

Run: `npx vitest run src/components/nodes src/lib/elevenlabs src/lib/voice-change src/lib/generations src/app/api/elevenlabs "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit -p . && npm run lint -- src/components/nodes/video-gen-voice-picker*.tsx src/components/nodes/video-gen-focus-view.tsx src/hooks src/lib/elevenlabs`
Expected: all PASS, `tsc` clean, lint clean (pre-existing unrelated warnings only). Also `grep -rn "v1/voices\"\|/v1/voices?" src` returns nothing (no legacy list call).

- [ ] **Step 9: Commit**

```bash
git add -A src/components/nodes src/hooks
git commit -m "feat(voice): rich voice picker with Voice Library, filters and inline preview (D283)"
```

---

### Task 7: Manual check in the running app

**Files:** none (fix-ups only if something is wrong).

- [ ] **Step 1:** Run `npm run dev` and `npm run dev:trigger` (`.env.local` has `FFMPEG_PATH`).
- [ ] **Step 2:** On a Gemini Omni Video Gen node, open the Voice picker. My voices shows 21 voices; type "sarah" (instant filter); set Gender = Female; Clear filters works.
- [ ] **Step 3:** Voice Library tab: set Language = Hindi, Gender = Female; scroll past 60 rows (two more pages load); preview two rows — starting the second stops the first; closing the popover stops playback.
- [ ] **Step 4:** Pick a Library voice → spinner → selected; reopen → it appears under My voices. Generate → the clip is re-voiced (`voice: "applied"`), and the usage shows the charge.
- [ ] **Step 5:** Find a `2×` voice in the Library (sort Most used; badge visible), pick it, and confirm the credit estimate on Generate roughly doubles the voice part. Do not generate unless you want to spend the credits.
- [ ] **Step 6:** Delete the test voices you saved from the ElevenLabs website (My Voices) if you don't want them kept.
- [ ] **Step 7:** Record any issue found as a fix commit, then update the spec if behaviour differs.
