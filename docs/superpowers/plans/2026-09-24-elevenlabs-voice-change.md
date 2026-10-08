# ElevenLabs Voice Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An optional voice on the Video Gen node; when set, the generated clip's audio is re-voiced with ElevenLabs speech-to-speech and the node's version is the re-voiced video (falling back to the original if the voice change fails).

**Architecture:** The `video-generate` route validates the voice, reserves video + voice credits and mints two signed GCS upload URLs. The `video-generate` Trigger task generates as today, stores the original through its signed URL, then calls a new `video-revoice` child task with `triggerAndWait` (ffmpeg extract → ElevenLabs → ffmpeg mux → signed PUT). One webhook carries the already-stored URL (`stored: true`) plus `meta.voice`; `completeGeneration` skips its download/upload, records the voice on the version and settles the voice cost only when applied. All logic lives in `src/lib/**` with injected dependencies so vitest (which only runs `src/**/*.test.ts`) covers it; the files in `trigger/` are thin wrappers.

**Tech Stack:** Next.js route handlers, Trigger.dev v4 SDK (`@trigger.dev/sdk/v3` import path, as the repo uses) + `@trigger.dev/build` ffmpeg extension, Google Cloud Storage signed URLs, ElevenLabs REST API, vitest, React + shadcn (Base UI) `Select`.

**Spec:** `docs/superpowers/specs/2026-09-24-elevenlabs-voice-change-design.md` (ADR D282).

## Global Constraints

- Env var name is exactly `ELEVEN_LABS_API_KEY`. Never sent to the browser.
- ElevenLabs base URL `https://api.elevenlabs.io`; speech-to-speech model `eleven_multilingual_sts_v2`; auth header `xi-api-key`.
- Voice change price: `VOICE_CHANGE_USD_PER_MINUTE = 0.12`.
- Signed upload URL expiry: 2 hours (`2 * 60 * 60 * 1000` ms).
- Storage paths: `clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/video-gen/{generationId}-original.mp4` and `…-revoiced.mp4`.
- With no voice selected, the generation path must be unchanged (same payload, same webhook body).
- Every interactive control is a shadcn primitive from `src/components/ui/*` — never a native `<select>`/`<button>` (CLAUDE.md).
- Lucide icons only, `strokeWidth={1.5}`. Colors via CSS variables/tokens only.
- Nothing the Trigger task imports may import `server-only`.
- API routes use `apiOk` / `apiError` from `src/lib/api/route-helpers.ts`, never `NextResponse.json`.
- Commit after each task; end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests per file/directory (`npx vitest run <path>`), not the full suite — the full run has ~11 known timeout flakes.

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/elevenlabs/constants.ts` | Create | Base URL, model id, price, custom categories, error copy |
| `src/lib/elevenlabs/cost.ts` | Create | `computeVoiceChangeCost` |
| `src/lib/elevenlabs/client.ts` | Create | `listVoices`, `speechToSpeech`, `mapVoices`, key handling |
| `src/lib/elevenlabs/voices-cache.ts` | Create | 5-minute in-process cache over `listVoices` |
| `src/lib/elevenlabs/voice-eligibility.ts` | Create | `voiceChangeBlockedReason` — shared by route and UI |
| `src/lib/elevenlabs/api.ts` | Create | Browser fetch wrapper for the voices route |
| `src/app/api/elevenlabs/voices/route.ts` | Create | `GET` voice list |
| `src/lib/storage/paths.ts` | Modify | `pathForVideoGenVoice` |
| `src/lib/storage/index.ts` | Modify | `signVideoGenVoiceUrls`, `isOwnStoredUrl` |
| `src/lib/video-gen/download-headers.ts` | Create | Provider download headers (moved out of `complete.ts`) |
| `src/lib/media/ffmpeg.ts` | Create | `extractAudio`, `replaceAudio` |
| `src/lib/voice-change/types.ts` | Create | `VoicePayload`, `VoiceMeta`, `RevoicePayload`, `RevoiceResult` |
| `src/lib/voice-change/meta.ts` | Create | `readVoiceMeta` (validates `meta.voice` / `params_used.voice`) |
| `src/lib/voice-change/http.ts` | Create | `fetchBytes`, `putBytes` |
| `src/lib/voice-change/revoice.ts` | Create | `revoiceVideo` — the child task's steps |
| `src/lib/voice-change/deliver.ts` | Create | `deliverWithVoice` — `video-generate`'s voice branch |
| `trigger/video-revoice.ts` | Create | Child task wrapper |
| `trigger/video-generate.ts` | Modify | Voice branch |
| `trigger.config.ts` | Modify | ffmpeg build extension |
| `src/lib/generations/complete.ts` | Modify | `stored`, bucket guard, voice meta, voice cost |
| `src/lib/generations/version-params.ts` | Modify | Hide raw `voice` object, show "Voice" entry |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Modify | `voiceId` guard, reserve, sign URLs, payload |
| `src/lib/video-gen/api.ts` | Modify | `voiceId` on `StartGenerationPayload` |
| `src/lib/canvas-nodes.ts` | Modify | `voiceId` on `VideoGenNodeData` |
| `src/hooks/use-elevenlabs-voices.ts` | Create | Loads voices for the picker |
| `src/components/nodes/video-gen-voice-select.tsx` | Create | The Voice control |
| `src/components/nodes/video-gen-focus-view.tsx` | Modify | Wire the control, estimate, failed note |
| `src/components/nodes/video-gen-node.tsx` | Modify | Pass `voiceId` |
| `src/components/nodes/video-gen-usage-popover.tsx` | Modify | "· voice" in the row meta |
| `.env.example` | Modify | Document `ELEVEN_LABS_API_KEY` |

---

### Task 1: ElevenLabs core — constants, cost, client, cache, eligibility

**Files:**
- Create: `src/lib/elevenlabs/constants.ts`, `src/lib/elevenlabs/cost.ts`, `src/lib/elevenlabs/client.ts`, `src/lib/elevenlabs/voices-cache.ts`, `src/lib/elevenlabs/voice-eligibility.ts`
- Test: `src/lib/elevenlabs/__tests__/cost.test.ts`, `src/lib/elevenlabs/__tests__/client.test.ts`, `src/lib/elevenlabs/__tests__/voices-cache.test.ts`, `src/lib/elevenlabs/__tests__/voice-eligibility.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `VOICE_CHANGE_USD_PER_MINUTE: number`, `ELEVENLABS_API_BASE: string`, `VOICE_CHANGE_MODEL_ID: string`, `VOICE_NOT_SET_UP_MESSAGE: string`
  - `computeVoiceChangeCost(durationSeconds: number): { usd: number; inr: number }`
  - `type ElevenLabsVoice = { voiceId: string; name: string; category: string; previewUrl: string | null }`
  - `class ElevenLabsKeyMissingError extends Error`
  - `mapVoices(raw: unknown): ElevenLabsVoice[]` (custom first, then by name)
  - `listVoices(fetchImpl?: typeof fetch): Promise<ElevenLabsVoice[]>`
  - `speechToSpeech(args: { audio: Buffer; voiceId: string }, fetchImpl?: typeof fetch): Promise<Buffer>`
  - `getVoicesCached(loader?: () => Promise<ElevenLabsVoice[]>, now?: () => number): Promise<ElevenLabsVoice[]>`, `_resetVoicesCache(): void`
  - `voiceChangeBlockedReason(paramNames: string[], params: Record<string, unknown>, opts?: { mock?: boolean }): string | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/elevenlabs/__tests__/cost.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeVoiceChangeCost } from "../cost";
import { USD_TO_INR } from "@/lib/pricing";

describe("computeVoiceChangeCost", () => {
  it("charges $0.12 per minute, pro-rated by the second", () => {
    expect(computeVoiceChangeCost(60).usd).toBeCloseTo(0.12, 10);
    expect(computeVoiceChangeCost(8).usd).toBeCloseTo(0.016, 10);
  });

  it("converts to INR with the shared rate", () => {
    const { usd, inr } = computeVoiceChangeCost(48);
    expect(inr).toBeCloseTo(usd * USD_TO_INR, 10);
  });

  it("is zero for a zero-length clip", () => {
    expect(computeVoiceChangeCost(0)).toEqual({ usd: 0, inr: 0 });
  });
});
```

`src/lib/elevenlabs/__tests__/client.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { mapVoices, listVoices, speechToSpeech, ElevenLabsKeyMissingError } from "../client";

afterEach(() => {
  delete process.env.ELEVEN_LABS_API_KEY;
});

describe("mapVoices", () => {
  it("maps fields and puts custom voices first, then sorts by name", () => {
    const voices = mapVoices({
      voices: [
        { voice_id: "p2", name: "Zara", category: "premade", preview_url: "https://p/z.mp3" },
        { voice_id: "c1", name: "Priya", category: "cloned", preview_url: null },
        { voice_id: "p1", name: "Adam", category: "premade", preview_url: "https://p/a.mp3" },
        { voice_id: "g1", name: "Brand", category: "generated" },
      ],
    });
    expect(voices.map((v) => v.voiceId)).toEqual(["g1", "c1", "p1", "p2"]);
    expect(voices[1]).toEqual({ voiceId: "c1", name: "Priya", category: "cloned", previewUrl: null });
    expect(voices[2].previewUrl).toBe("https://p/a.mp3");
  });

  it("drops malformed rows and tolerates a missing list", () => {
    expect(mapVoices({ voices: [{ name: "no id" }, null] })).toEqual([]);
    expect(mapVoices(null)).toEqual([]);
  });
});

describe("listVoices", () => {
  it("throws ElevenLabsKeyMissingError when the key is unset", async () => {
    await expect(listVoices(vi.fn())).rejects.toBeInstanceOf(ElevenLabsKeyMissingError);
  });

  it("calls /v1/voices with the key header", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ voices: [{ voice_id: "a", name: "A", category: "premade" }] })),
    );
    const voices = await listVoices(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": "k" },
    });
    expect(voices).toHaveLength(1);
  });

  it("throws with the status on a non-OK response", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(listVoices(fetchImpl as unknown as typeof fetch)).rejects.toThrow("401");
  });
});

describe("speechToSpeech", () => {
  it("posts multipart audio + model_id and returns the audio bytes", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");
      expect(form.get("audio")).toBeInstanceOf(Blob);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const out = await speechToSpeech(
      { audio: Buffer.from([9, 9]), voiceId: "voice-1" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/speech-to-speech/voice-1");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toEqual({ "xi-api-key": "k" });
    expect([...out]).toEqual([1, 2, 3]);
  });

  it("throws with ElevenLabs' message on failure", async () => {
    process.env.ELEVEN_LABS_API_KEY = "k";
    const fetchImpl = vi.fn(async () => new Response("quota_exceeded", { status: 429 }));
    await expect(
      speechToSpeech({ audio: Buffer.from([1]), voiceId: "v" }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/429.*quota_exceeded/);
  });
});
```

`src/lib/elevenlabs/__tests__/voices-cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVoicesCached, _resetVoicesCache } from "../voices-cache";

const V = [{ voiceId: "a", name: "A", category: "premade", previewUrl: null }];

beforeEach(() => _resetVoicesCache());

describe("getVoicesCached", () => {
  it("reuses the list for 5 minutes, then reloads", async () => {
    const loader = vi.fn(async () => V);
    let t = 0;
    const now = () => t;
    await getVoicesCached(loader, now);
    t = 4 * 60 * 1000;
    await getVoicesCached(loader, now);
    expect(loader).toHaveBeenCalledTimes(1);
    t = 5 * 60 * 1000 + 1;
    await getVoicesCached(loader, now);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(V);
    await expect(getVoicesCached(loader, () => 0)).rejects.toThrow("down");
    await expect(getVoicesCached(loader, () => 0)).resolves.toEqual(V);
  });
});
```

`src/lib/elevenlabs/__tests__/voice-eligibility.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { voiceChangeBlockedReason } from "../voice-eligibility";

describe("voiceChangeBlockedReason", () => {
  it("allows a model with no audio param (audio is always generated)", () => {
    expect(voiceChangeBlockedReason(["duration"], {})).toBeNull();
  });

  it("allows a model whose audio param is on", () => {
    expect(voiceChangeBlockedReason(["audio"], { audio: "native" })).toBeNull();
  });

  it("blocks a model whose audio param is off", () => {
    expect(voiceChangeBlockedReason(["audio"], { audio: "off" })).toMatch(/Audio/);
  });

  it("blocks mock mode", () => {
    expect(voiceChangeBlockedReason([], {}, { mock: true })).toMatch(/mock/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/elevenlabs`
Expected: FAIL — cannot resolve `../cost`, `../client`, `../voices-cache`, `../voice-eligibility`.

- [ ] **Step 3: Implement**

`src/lib/elevenlabs/constants.ts`:
```ts
// D282 — ElevenLabs voice change. Prices from the ElevenAPI pricing page, checked 2026-09-24.
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
export const VOICE_CHANGE_MODEL_ID = "eleven_multilingual_sts_v2";
export const VOICE_CHANGE_USD_PER_MINUTE = 0.12;

/** Voices we created on the account (cloned / designed / professional) — listed before stock. */
export const CUSTOM_VOICE_CATEGORIES = new Set(["cloned", "generated", "professional"]);

export const VOICES_CACHE_TTL_MS = 5 * 60 * 1000;

export const VOICE_NOT_SET_UP_MESSAGE =
  "Voice change isn't set up — ELEVEN_LABS_API_KEY is missing.";
```

`src/lib/elevenlabs/cost.ts`:
```ts
import { USD_TO_INR } from "@/lib/pricing";
import { VOICE_CHANGE_USD_PER_MINUTE } from "./constants";

/** ElevenLabs bills voice change by audio duration only. */
export function computeVoiceChangeCost(durationSeconds: number): { usd: number; inr: number } {
  const usd = (durationSeconds / 60) * VOICE_CHANGE_USD_PER_MINUTE;
  return { usd, inr: usd * USD_TO_INR };
}
```

`src/lib/elevenlabs/client.ts`:
```ts
// D282 — ElevenLabs HTTP client. No `server-only`: the Trigger tasks import this too.
import { CUSTOM_VOICE_CATEGORIES, ELEVENLABS_API_BASE, VOICE_CHANGE_MODEL_ID } from "./constants";

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string | null;
};

export class ElevenLabsKeyMissingError extends Error {
  constructor() {
    super("ELEVEN_LABS_API_KEY is not set");
    this.name = "ElevenLabsKeyMissingError";
  }
}

function apiKey(): string {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new ElevenLabsKeyMissingError();
  return key;
}

export function mapVoices(raw: unknown): ElevenLabsVoice[] {
  const list = (raw as { voices?: unknown } | null)?.voices;
  if (!Array.isArray(list)) return [];
  const voices: ElevenLabsVoice[] = [];
  for (const row of list) {
    const r = row as Record<string, unknown> | null;
    if (!r || typeof r.voice_id !== "string" || typeof r.name !== "string") continue;
    voices.push({
      voiceId: r.voice_id,
      name: r.name,
      category: typeof r.category === "string" ? r.category : "premade",
      previewUrl: typeof r.preview_url === "string" ? r.preview_url : null,
    });
  }
  const rank = (v: ElevenLabsVoice) => (CUSTOM_VOICE_CATEGORIES.has(v.category) ? 0 : 1);
  return voices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function listVoices(fetchImpl: typeof fetch = fetch): Promise<ElevenLabsVoice[]> {
  const res = await fetchImpl(`${ELEVENLABS_API_BASE}/v1/voices`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices request failed: ${res.status}`);
  return mapVoices(await res.json());
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
    { method: "POST", headers: { "xi-api-key": apiKey() }, body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs speech-to-speech failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
```

Note: `encodeURIComponent("voice-1")` is `voice-1`, matching the test.

`src/lib/elevenlabs/voices-cache.ts`:
```ts
import { listVoices, type ElevenLabsVoice } from "./client";
import { VOICES_CACHE_TTL_MS } from "./constants";

let cache: { at: number; voices: ElevenLabsVoice[] } | null = null;

/** The account's voices, reused for 5 minutes. A failed load is never cached. */
export async function getVoicesCached(
  loader: () => Promise<ElevenLabsVoice[]> = () => listVoices(),
  now: () => number = Date.now,
): Promise<ElevenLabsVoice[]> {
  const t = now();
  if (cache && t - cache.at <= VOICES_CACHE_TTL_MS) return cache.voices;
  const voices = await loader();
  cache = { at: t, voices };
  return voices;
}

export function _resetVoicesCache(): void {
  cache = null;
}
```

`src/lib/elevenlabs/voice-eligibility.ts`:
```ts
import { isVideoAudioEnabled } from "@/lib/video-gen/cost";

/**
 * D282 — why a voice can't be applied to this generation, or null when it can. Shared by the
 * focus view (disables the picker) and the video-generate route (rejects the request), so both
 * say the same thing. A model with no `audio` param always generates sound.
 */
export function voiceChangeBlockedReason(
  paramNames: string[],
  params: Record<string, unknown>,
  opts: { mock?: boolean } = {},
): string | null {
  if (opts.mock) return "Voice change is off in mock mode.";
  if (paramNames.includes("audio") && !isVideoAudioEnabled(params.audio)) {
    return "Turn Audio on to change the voice — this video will be silent.";
  }
  return null;
}
```

Append to `.env.example`:
```
# D282 — ElevenLabs voice change (Video Gen node). Also set in Vercel and both Trigger.dev projects.
ELEVEN_LABS_API_KEY=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/elevenlabs`
Expected: PASS (4 files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elevenlabs .env.example
git commit -m "feat(voice): ElevenLabs client, voice cost and eligibility (D282)"
```

---

### Task 2: Voice list route

**Files:**
- Create: `src/app/api/elevenlabs/voices/route.ts`, `src/lib/elevenlabs/api.ts`
- Test: `src/app/api/elevenlabs/voices/route.test.ts`

**Interfaces:**
- Consumes: `getVoicesCached`, `ElevenLabsKeyMissingError`, `VOICE_NOT_SET_UP_MESSAGE`, `ElevenLabsVoice` (Task 1)
- Produces:
  - `GET /api/elevenlabs/voices` → `200 { voices: ElevenLabsVoice[] }` | `503 { error: VOICE_NOT_SET_UP_MESSAGE }` | `502 { error }` | `401`
  - `elevenLabsApi.fetchVoices(): Promise<ElevenLabsVoice[]>` (throws `Error(message)` on non-OK)

- [ ] **Step 1: Write the failing test**

`src/app/api/elevenlabs/voices/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getVoicesCached: vi.fn(),
  resolveCallerContext: vi.fn(async () => ({ userId: "u1" })),
}));

vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoicesCached: mocks.getVoicesCached }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: mocks.resolveCallerContext }));

import { GET } from "./route";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices", () => {
  it("returns the account's voices", async () => {
    const voices = [{ voiceId: "a", name: "A", category: "cloned", previewUrl: null }];
    mocks.getVoicesCached.mockResolvedValue(voices);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices });
  });

  it("503s with a setup message when the key is missing", async () => {
    mocks.getVoicesCached.mockRejectedValue(new ElevenLabsKeyMissingError());
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(VOICE_NOT_SET_UP_MESSAGE);
  });

  it("502s when ElevenLabs fails", async () => {
    mocks.getVoicesCached.mockRejectedValue(new Error("ElevenLabs voices request failed: 500"));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContext.mockRejectedValueOnce(new Error("Unauthenticated"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getVoicesCached).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/elevenlabs`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement**

Before writing the route, open `src/lib/dal.ts` and confirm how `resolveCallerContext()` behaves with no session (throws vs. redirects). If it redirects rather than throws, keep the try/catch anyway — it is harmless — and adjust the 401 test to mock whatever it does.

`src/app/api/elevenlabs/voices/route.ts`:
```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getVoicesCached } from "@/lib/elevenlabs/voices-cache";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

export const dynamic = "force-dynamic";

// D282 — the Video Gen node's voice picker. The ElevenLabs key stays on the server.
export async function GET() {
  try {
    await resolveCallerContext();
  } catch {
    return apiError("Unauthorized.", 401);
  }
  try {
    const voices = await getVoicesCached();
    return apiOk({ voices });
  } catch (e) {
    if (e instanceof ElevenLabsKeyMissingError) return apiError(VOICE_NOT_SET_UP_MESSAGE, 503);
    return apiError(e instanceof Error ? e.message : "Could not load ElevenLabs voices.", 502);
  }
}
```

`src/lib/elevenlabs/api.ts`:
```ts
// Client-safe wrapper for /api/elevenlabs/voices. Throws with the server's message.
import type { ElevenLabsVoice } from "./client";

export const elevenLabsApi = {
  async fetchVoices(): Promise<ElevenLabsVoice[]> {
    const res = await fetch("/api/elevenlabs/voices", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as
      | { voices?: ElevenLabsVoice[]; error?: string }
      | null;
    if (!res.ok) throw new Error(json?.error ?? "Could not load voices.");
    return json?.voices ?? [];
  },
};
```

`import type` from `./client` is erased at build time, so the browser bundle never pulls in the server fetch code.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/elevenlabs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/elevenlabs src/lib/elevenlabs/api.ts
git commit -m "feat(voice): GET /api/elevenlabs/voices for the voice picker (D282)"
```

---

### Task 3: Signed upload URLs for the original and re-voiced video

**Files:**
- Modify: `src/lib/storage/paths.ts` (after `pathForVideoGen`, ~line 83), `src/lib/storage/index.ts` (after `uploadVideoGen`, ~line 109; and next to `parsePathFromUrl`, ~line 251)
- Test: `src/lib/storage/video-gen-voice-urls.test.ts`

**Interfaces:**
- Consumes: `_signPutUrl(path, contentType, expiresMs)` and `publicUrlFor(path)` from `./gcs`; `resolveOwnership(nodeId)` from `./ownership`
- Produces:
  - `pathForVideoGenVoice(args: { clientId: string; canvasId: string; nodeId: string; generationId: string; variant: "original" | "revoiced" }): string`
  - `type VoiceUploadUrls = { originalPutUrl: string; originalUrl: string; revoicedPutUrl: string; revoicedUrl: string }`
  - `signVideoGenVoiceUrls(args: { nodeId: string; generationId: string }): Promise<VoiceUploadUrls>`
  - `isOwnStoredUrl(url: string): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/storage/video-gen-voice-urls.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("./gcs", () => ({
  _put: vi.fn(),
  _remove: vi.fn(),
  _signPutUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
  getBucketName: () => "test-bucket",
  publicUrlFor: (path: string) => `https://storage.googleapis.com/test-bucket/${path}`,
}));
vi.mock("./ownership", () => ({
  resolveOwnership: vi.fn(async () => ({ clientId: "c1", canvasId: "ca1" })),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { signVideoGenVoiceUrls, isOwnStoredUrl } from "./index";
import { pathForVideoGenVoice } from "./paths";
import { _signPutUrl } from "./gcs";

describe("pathForVideoGenVoice", () => {
  it("puts both variants beside the node's video-gen outputs, keyed by generation", () => {
    expect(
      pathForVideoGenVoice({ clientId: "c1", canvasId: "ca1", nodeId: "n1", generationId: "g1", variant: "original" }),
    ).toBe("clients/c1/canvases/ca1/nodes/n1/video-gen/g1-original.mp4");
  });
});

describe("signVideoGenVoiceUrls", () => {
  it("signs two video/mp4 PUT URLs valid for 2 hours and returns their public URLs", async () => {
    const urls = await signVideoGenVoiceUrls({ nodeId: "n1", generationId: "g1" });
    const base = "clients/c1/canvases/ca1/nodes/n1/video-gen";
    expect(urls).toEqual({
      originalPutUrl: `https://signed.example/${base}/g1-original.mp4`,
      originalUrl: `https://storage.googleapis.com/test-bucket/${base}/g1-original.mp4`,
      revoicedPutUrl: `https://signed.example/${base}/g1-revoiced.mp4`,
      revoicedUrl: `https://storage.googleapis.com/test-bucket/${base}/g1-revoiced.mp4`,
    });
    expect(_signPutUrl).toHaveBeenCalledWith(`${base}/g1-original.mp4`, "video/mp4", 2 * 60 * 60 * 1000);
  });
});

describe("isOwnStoredUrl", () => {
  it("accepts only this bucket's public URLs", () => {
    expect(isOwnStoredUrl("https://storage.googleapis.com/test-bucket/a.mp4")).toBe(true);
    expect(isOwnStoredUrl("https://storage.googleapis.com/other/a.mp4")).toBe(false);
    expect(isOwnStoredUrl("https://evil.example/a.mp4")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/storage/video-gen-voice-urls.test.ts`
Expected: FAIL — `pathForVideoGenVoice` / `signVideoGenVoiceUrls` not exported.

- [ ] **Step 3: Implement**

In `src/lib/storage/paths.ts`, directly after `pathForVideoGen`:
```ts
// D282 — the original and re-voiced video of ONE generation. Keyed by generation id (not
// buildStoredName's random name) because the route signs both URLs before the task runs.
export function pathForVideoGenVoice(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  generationId: string;
  variant: "original" | "revoiced";
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/video-gen/${args.generationId}-${args.variant}.mp4`;
}
```

In `src/lib/storage/index.ts`, add `pathForVideoGenVoice` to the `./paths` import list, then after `uploadVideoGen`:
```ts
export type VoiceUploadUrls = {
  originalPutUrl: string;
  originalUrl: string;
  revoicedPutUrl: string;
  revoicedUrl: string;
};

// A generation can run up to 20 minutes before the task uploads; 5 minutes (the default) is far
// too short. Two hours covers the longest generation plus the voice-change retries.
const VOICE_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;

// D282 — the Trigger task has no GCS credentials, so the route signs both uploads up front.
export async function signVideoGenVoiceUrls(args: {
  nodeId: string;
  generationId: string;
}): Promise<VoiceUploadUrls> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const pathFor = (variant: "original" | "revoiced") =>
    pathForVideoGenVoice({ clientId, canvasId, nodeId: args.nodeId, generationId: args.generationId, variant });
  const originalPath = pathFor("original");
  const revoicedPath = pathFor("revoiced");
  const [originalPutUrl, revoicedPutUrl] = await Promise.all([
    _signPutUrl(originalPath, "video/mp4", VOICE_UPLOAD_EXPIRY_MS),
    _signPutUrl(revoicedPath, "video/mp4", VOICE_UPLOAD_EXPIRY_MS),
  ]);
  return {
    originalPutUrl,
    originalUrl: publicUrlFor(originalPath),
    revoicedPutUrl,
    revoicedUrl: publicUrlFor(revoicedPath),
  };
}
```

Next to `parsePathFromUrl`:
```ts
/** True when `url` is a public URL of an object in this app's bucket. */
export function isOwnStoredUrl(url: string): boolean {
  return parsePathFromUrl(url) !== null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/storage`
Expected: PASS (the new file and the existing `index.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage
git commit -m "feat(voice): signed upload URLs for original and re-voiced video (D282)"
```

---

### Task 4: Shared provider download headers

**Files:**
- Create: `src/lib/video-gen/download-headers.ts`
- Modify: `src/lib/generations/complete.ts:21-34` (delete `buildVideoDownloadHeaders`, import the shared one)
- Test: `src/lib/video-gen/__tests__/download-headers.test.ts`

**Interfaces:**
- Produces: `videoDownloadHeaders(modelUsed: string | null): Record<string, string>`

- [ ] **Step 1: Write the failing test**

`src/lib/video-gen/__tests__/download-headers.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { videoDownloadHeaders } from "../download-headers";

afterEach(() => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("videoDownloadHeaders", () => {
  it("adds the Google key for Veo and Gemini", () => {
    process.env.GOOGLE_GENAI_API_KEY = "g";
    expect(videoDownloadHeaders("veo:veo-3")["x-goog-api-key"]).toBe("g");
    expect(videoDownloadHeaders("gemini:omni-flash")["x-goog-api-key"]).toBe("g");
  });

  it("adds a bearer token for OpenAI", () => {
    process.env.OPENAI_API_KEY = "o";
    expect(videoDownloadHeaders("openai:sora-2").Authorization).toBe("Bearer o");
  });

  it("sends only the user agent for other providers", () => {
    expect(videoDownloadHeaders("kling:kling-o1")).toEqual({
      "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)",
    });
    expect(videoDownloadHeaders(null)).toEqual({
      "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/video-gen/__tests__/download-headers.test.ts`
Expected: FAIL — cannot resolve `../download-headers`.

- [ ] **Step 3: Implement**

`src/lib/video-gen/download-headers.ts`:
```ts
// Headers for downloading a finished video from its provider. Shared by completeGeneration and
// the video-generate task's voice branch (D282) — so no `server-only` here.
export function videoDownloadHeaders(modelUsed: string | null): Record<string, string> {
  const base = { "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)" };
  // Veo and Gemini Omni both return a Google Files API URI that needs the API key to download.
  // Same key, same header — they are the same API.
  if (modelUsed?.startsWith("veo:") || modelUsed?.startsWith("gemini:")) {
    return { ...base, "x-goog-api-key": process.env.GOOGLE_GENAI_API_KEY ?? "" };
  }
  if (modelUsed?.startsWith("openai:")) {
    return { ...base, Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` };
  }
  return base;
}
```

In `src/lib/generations/complete.ts`: delete the whole `buildVideoDownloadHeaders` function (lines 21–34), add `import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";`, and change the fetch to:
```ts
  const videoResponse = await fetch(input.videoUrl, {
    headers: videoDownloadHeaders(generation.model_used),
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/video-gen/__tests__/download-headers.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/download-headers.ts src/lib/video-gen/__tests__/download-headers.test.ts src/lib/generations/complete.ts
git commit -m "refactor(video-gen): share provider download headers (D282)"
```

---

### Task 5: ffmpeg helpers + Trigger ffmpeg build extension

**Files:**
- Create: `src/lib/media/ffmpeg.ts`
- Modify: `trigger.config.ts`, `package.json` (dev dependency)
- Test: `src/lib/media/__tests__/ffmpeg.test.ts`

**Interfaces:**
- Produces:
  - `extractAudio(video: Buffer): Promise<Buffer>` — MP3 of the video's first audio stream; rejects if there is none
  - `replaceAudio(video: Buffer, audio: Buffer): Promise<Buffer>` — MP4 with the original picture (copied, not re-encoded) and the new audio

- [ ] **Step 1: Install the build package and add the extension**

Run: `npm i -D @trigger.dev/build@4.6.3`
Expected: `package.json` devDependencies gains `"@trigger.dev/build": "4.6.3"`.

In `trigger.config.ts`, add at the top:
```ts
import { ffmpeg } from "@trigger.dev/build/extensions/core";
```
and inside `build`:
```ts
  build: {
    // sharp comment unchanged…
    external: ["sharp"],
    // D282 — the video-revoice task extracts and replaces audio with ffmpeg. The extension
    // installs the binary into the deploy image and sets FFMPEG_PATH.
    extensions: [ffmpeg()],
  },
```

- [ ] **Step 2: Write the failing test**

`src/lib/media/__tests__/ffmpeg.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudio, replaceAudio } from "../ffmpeg";

const bin = process.env.FFMPEG_PATH ?? "ffmpeg";
const hasFfmpeg = spawnSync(bin, ["-version"]).status === 0;

// Build a 2-second clip with a test pattern and a tone, using ffmpeg itself — no binary fixture
// in the repo.
function makeClip(withAudio: boolean): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "ffmpeg-fixture-"));
  const out = path.join(dir, "clip.mp4");
  const args = ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2"];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=2");
  args.push("-pix_fmt", "yuv420p", "-shortest", out);
  spawnSync(bin, args);
  const bytes = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

describe.skipIf(!hasFfmpeg)("ffmpeg helpers (needs ffmpeg on PATH)", () => {
  it("extracts an MP3 from a clip with sound", async () => {
    const audio = await extractAudio(makeClip(true));
    expect(audio.length).toBeGreaterThan(1000);
  });

  it("rejects a silent clip", async () => {
    await expect(extractAudio(makeClip(false))).rejects.toThrow(/ffmpeg/);
  });

  it("replaces the audio and keeps a playable MP4 with sound", async () => {
    const clip = makeClip(true);
    const audio = await extractAudio(clip);
    const out = await replaceAudio(clip, audio);
    expect(out.subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect((await extractAudio(out)).length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/media`
Expected: FAIL — cannot resolve `../ffmpeg`. (If ffmpeg isn't installed locally, the suite is skipped instead; install ffmpeg, e.g. `winget install Gyan.FFmpeg`, so this task is actually exercised.)

- [ ] **Step 4: Implement**

`src/lib/media/ffmpeg.ts`:
```ts
// D282 — thin ffmpeg wrappers for the video-revoice task. Buffers in, buffers out; temp files
// live in a per-call directory that is always removed.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function ffmpegBin(): string {
  // Set by Trigger.dev's ffmpeg build extension in deployed tasks.
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "revoice-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The video's first audio stream as MP3. Rejects when the video has no audio. */
export async function extractAudio(video: Buffer): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const input = path.join(dir, "in.mp4");
    const output = path.join(dir, "audio.mp3");
    await writeFile(input, video);
    await run(["-i", input, "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-q:a", "2", output]);
    return readFile(output);
  });
}

/** The same picture (stream-copied) with `audio` as its only audio track. */
export async function replaceAudio(video: Buffer, audio: Buffer): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const videoIn = path.join(dir, "in.mp4");
    const audioIn = path.join(dir, "voice.mp3");
    const output = path.join(dir, "out.mp4");
    await writeFile(videoIn, video);
    await writeFile(audioIn, audio);
    await run([
      "-i", videoIn,
      "-i", audioIn,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      output,
    ]);
    return readFile(output);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/media`
Expected: PASS (3 tests) with ffmpeg installed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media trigger.config.ts package.json package-lock.json
git commit -m "feat(voice): ffmpeg audio extract/replace helpers and Trigger ffmpeg extension (D282)"
```

---

### Task 6: Voice-change types, meta parsing and the `video-revoice` task

**Files:**
- Create: `src/lib/voice-change/types.ts`, `src/lib/voice-change/meta.ts`, `src/lib/voice-change/http.ts`, `src/lib/voice-change/revoice.ts`, `trigger/video-revoice.ts`
- Test: `src/lib/voice-change/__tests__/meta.test.ts`, `src/lib/voice-change/__tests__/revoice.test.ts`

**Interfaces:**
- Consumes: `speechToSpeech` (Task 1), `extractAudio` / `replaceAudio` (Task 5)
- Produces:
  - `type VoicePayload = { voiceId: string; voiceName: string; originalPutUrl: string; originalUrl: string; revoicedPutUrl: string; revoicedUrl: string }`
  - `type VoiceMeta = { voiceId: string; voiceName: string; status: "applied" | "failed"; error?: string; originalUrl: string }`
  - `type RevoicePayload = { sourceUrl: string; voiceId: string; revoicedPutUrl: string }`
  - `type RevoiceResult = { ok: true } | { ok: false; error: string }`
  - `readVoiceMeta(value: unknown): VoiceMeta | null`
  - `fetchBytes(url: string, headers?: Record<string, string>): Promise<Buffer>`, `putBytes(url: string, body: Buffer, contentType: string): Promise<void>`
  - `type RevoiceDeps = { fetchBytes: (url: string) => Promise<Buffer>; extractAudio: (video: Buffer) => Promise<Buffer>; speechToSpeech: (args: { audio: Buffer; voiceId: string }) => Promise<Buffer>; replaceAudio: (video: Buffer, audio: Buffer) => Promise<Buffer>; putBytes: (url: string, body: Buffer, contentType: string) => Promise<void> }`
  - `revoiceVideo(payload: RevoicePayload, deps: RevoiceDeps): Promise<void>` (throws on any failure)
  - Trigger task `videoRevoiceTask` (id `"video-revoice"`), payload `RevoicePayload`, output `{ ok: true }`

- [ ] **Step 1: Write the failing tests**

`src/lib/voice-change/__tests__/meta.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readVoiceMeta } from "../meta";

const OK = { voiceId: "v", voiceName: "Priya", status: "applied", originalUrl: "https://s/o.mp4" };

describe("readVoiceMeta", () => {
  it("accepts a well-formed record", () => {
    expect(readVoiceMeta(OK)).toEqual(OK);
    expect(readVoiceMeta({ ...OK, status: "failed", error: "429" })).toEqual({ ...OK, status: "failed", error: "429" });
  });

  it("rejects anything else", () => {
    expect(readVoiceMeta(undefined)).toBeNull();
    expect(readVoiceMeta("x")).toBeNull();
    expect(readVoiceMeta({ ...OK, status: "maybe" })).toBeNull();
    expect(readVoiceMeta({ ...OK, voiceId: 3 })).toBeNull();
  });
});
```

`src/lib/voice-change/__tests__/revoice.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { revoiceVideo, type RevoiceDeps } from "../revoice";

function deps(overrides: Partial<RevoiceDeps> = {}): RevoiceDeps {
  return {
    fetchBytes: vi.fn(async () => Buffer.from("video")),
    extractAudio: vi.fn(async () => Buffer.from("audio")),
    speechToSpeech: vi.fn(async () => Buffer.from("voice")),
    replaceAudio: vi.fn(async () => Buffer.from("final")),
    putBytes: vi.fn(async () => undefined),
    ...overrides,
  };
}

const PAYLOAD = { sourceUrl: "https://s/o.mp4", voiceId: "v1", revoicedPutUrl: "https://put/r" };

describe("revoiceVideo", () => {
  it("runs download → extract → speech-to-speech → replace → upload in order", async () => {
    const d = deps();
    await revoiceVideo(PAYLOAD, d);
    expect(d.fetchBytes).toHaveBeenCalledWith("https://s/o.mp4");
    expect(d.extractAudio).toHaveBeenCalledWith(Buffer.from("video"));
    expect(d.speechToSpeech).toHaveBeenCalledWith({ audio: Buffer.from("audio"), voiceId: "v1" });
    expect(d.replaceAudio).toHaveBeenCalledWith(Buffer.from("video"), Buffer.from("voice"));
    expect(d.putBytes).toHaveBeenCalledWith("https://put/r", Buffer.from("final"), "video/mp4");
  });

  it("throws (so Trigger retries) when ElevenLabs fails, and uploads nothing", async () => {
    const d = deps({ speechToSpeech: vi.fn(async () => { throw new Error("429 quota"); }) });
    await expect(revoiceVideo(PAYLOAD, d)).rejects.toThrow("429 quota");
    expect(d.putBytes).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/voice-change`
Expected: FAIL — cannot resolve `../meta` / `../revoice`.

- [ ] **Step 3: Implement**

`src/lib/voice-change/types.ts`:
```ts
// D282 — shapes passed between the route, the video-generate task, the video-revoice task and
// completeGeneration.

/** What the route hands video-generate when a voice is selected. */
export type VoicePayload = {
  voiceId: string;
  voiceName: string;
  originalPutUrl: string;
  originalUrl: string;
  revoicedPutUrl: string;
  revoicedUrl: string;
};

/** Recorded on the webhook `meta` and on the version's `params_used.voice`. */
export type VoiceMeta = {
  voiceId: string;
  voiceName: string;
  status: "applied" | "failed";
  error?: string;
  originalUrl: string;
};

export type RevoicePayload = { sourceUrl: string; voiceId: string; revoicedPutUrl: string };

export type RevoiceResult = { ok: true } | { ok: false; error: string };
```

`src/lib/voice-change/meta.ts`:
```ts
import type { VoiceMeta } from "./types";

/** A VoiceMeta when `value` is one, else null — used on webhook input and stored params. */
export function readVoiceMeta(value: unknown): VoiceMeta | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  if (typeof v.voiceId !== "string" || typeof v.voiceName !== "string") return null;
  if (typeof v.originalUrl !== "string") return null;
  if (v.status !== "applied" && v.status !== "failed") return null;
  return {
    voiceId: v.voiceId,
    voiceName: v.voiceName,
    status: v.status,
    ...(typeof v.error === "string" ? { error: v.error } : {}),
    originalUrl: v.originalUrl,
  };
}
```

`src/lib/voice-change/http.ts`:
```ts
export async function fetchBytes(url: string, headers?: Record<string, string>): Promise<Buffer> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url.split("?")[0]}`);
  return Buffer.from(await res.arrayBuffer());
}

/** PUT to a V4 signed URL. The Content-Type must match the one the URL was signed with. */
export async function putBytes(url: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
```

`src/lib/voice-change/revoice.ts`:
```ts
import type { RevoicePayload } from "./types";

export type RevoiceDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  extractAudio: (video: Buffer) => Promise<Buffer>;
  speechToSpeech: (args: { audio: Buffer; voiceId: string }) => Promise<Buffer>;
  replaceAudio: (video: Buffer, audio: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
};

/**
 * D282 — the video-revoice task's steps. Throws on any failure: the task's own retry policy
 * re-runs just this, never the paid video generation.
 */
export async function revoiceVideo(payload: RevoicePayload, deps: RevoiceDeps): Promise<void> {
  const video = await deps.fetchBytes(payload.sourceUrl);
  const audio = await deps.extractAudio(video);
  const voiced = await deps.speechToSpeech({ audio, voiceId: payload.voiceId });
  const final = await deps.replaceAudio(video, voiced);
  await deps.putBytes(payload.revoicedPutUrl, final, "video/mp4");
}
```

`trigger/video-revoice.ts`:
```ts
import { task, logger } from "@trigger.dev/sdk/v3";
import { revoiceVideo } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import type { RevoicePayload } from "@/lib/voice-change/types";

// D282 — called by video-generate with triggerAndWait. Its own retries re-run only the voice
// change; once they're exhausted, video-generate falls back to the original video.
export const videoRevoiceTask = task({
  id: "video-revoice",
  maxDuration: 300,
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  run: async (payload: RevoicePayload) => {
    logger.info("Re-voicing video", { voiceId: payload.voiceId });
    await revoiceVideo(payload, {
      fetchBytes: (url) => fetchBytes(url),
      extractAudio,
      speechToSpeech: (args) => speechToSpeech(args),
      replaceAudio,
      putBytes,
    });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Run the tests and type-check**

Run: `npx vitest run src/lib/voice-change && npx tsc --noEmit -p .`
Expected: PASS; no type errors. Then run `npm run dev:trigger` once and confirm `video-revoice` is listed with no build errors (the Trigger CLI builds `trigger/`, which `tsconfig` may not include). Stop it afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-change trigger/video-revoice.ts
git commit -m "feat(voice): video-revoice child task (D282)"
```

---

### Task 7: The voice branch in `video-generate`

**Files:**
- Create: `src/lib/voice-change/deliver.ts`
- Modify: `trigger/video-generate.ts`
- Test: `src/lib/voice-change/__tests__/deliver.test.ts`

**Interfaces:**
- Consumes: `VoicePayload`, `VoiceMeta`, `RevoiceResult` (Task 6); `videoRevoiceTask` (Task 6); `videoDownloadHeaders` (Task 4); `fetchBytes`, `putBytes` (Task 6)
- Produces:
  - `type DeliverDeps = { fetchProviderVideo: (url: string) => Promise<Buffer>; putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>; revoice: (args: { sourceUrl: string; voiceId: string; revoicedPutUrl: string }) => Promise<RevoiceResult> }`
  - `class OriginalStoreError extends Error`
  - `deliverWithVoice(args: { providerVideoUrl: string; voice: VoicePayload }, deps: DeliverDeps): Promise<{ videoUrl: string; meta: { voice: VoiceMeta } }>` — throws `OriginalStoreError` only when the original couldn't be downloaded/stored
  - `video-generate` payload gains `voice?: VoicePayload`; success webhook body gains `stored: true` and `meta: { voice: VoiceMeta }` on the voice path

- [ ] **Step 1: Write the failing test**

`src/lib/voice-change/__tests__/deliver.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { deliverWithVoice, OriginalStoreError, type DeliverDeps } from "../deliver";

const VOICE = {
  voiceId: "v1",
  voiceName: "Priya",
  originalPutUrl: "https://put/o",
  originalUrl: "https://storage.googleapis.com/b/o.mp4",
  revoicedPutUrl: "https://put/r",
  revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
};

function deps(overrides: Partial<DeliverDeps> = {}): DeliverDeps {
  return {
    fetchProviderVideo: vi.fn(async () => Buffer.from("video")),
    putBytes: vi.fn(async () => undefined),
    revoice: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("deliverWithVoice", () => {
  it("stores the original first, then returns the re-voiced URL when the voice change worked", async () => {
    const d = deps();
    const out = await deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d);
    expect(d.putBytes).toHaveBeenCalledWith("https://put/o", Buffer.from("video"), "video/mp4");
    expect(d.revoice).toHaveBeenCalledWith({
      sourceUrl: VOICE.originalUrl,
      voiceId: "v1",
      revoicedPutUrl: "https://put/r",
    });
    expect(out).toEqual({
      videoUrl: VOICE.revoicedUrl,
      meta: { voice: { voiceId: "v1", voiceName: "Priya", status: "applied", originalUrl: VOICE.originalUrl } },
    });
  });

  it("falls back to the original when the voice change failed", async () => {
    const d = deps({ revoice: vi.fn(async () => ({ ok: false as const, error: "429 quota" })) });
    const out = await deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d);
    expect(out.videoUrl).toBe(VOICE.originalUrl);
    expect(out.meta.voice).toMatchObject({ status: "failed", error: "429 quota" });
  });

  it("throws OriginalStoreError and never re-voices when the original can't be stored", async () => {
    const d = deps({ putBytes: vi.fn(async () => { throw new Error("Upload failed (403)"); }) });
    await expect(
      deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d),
    ).rejects.toBeInstanceOf(OriginalStoreError);
    expect(d.revoice).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/voice-change/__tests__/deliver.test.ts`
Expected: FAIL — cannot resolve `../deliver`.

- [ ] **Step 3: Implement `deliver.ts`**

`src/lib/voice-change/deliver.ts`:
```ts
import type { RevoiceResult, VoiceMeta, VoicePayload } from "./types";

export type DeliverDeps = {
  fetchProviderVideo: (url: string) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  revoice: (args: { sourceUrl: string; voiceId: string; revoicedPutUrl: string }) => Promise<RevoiceResult>;
};

/** The original couldn't be downloaded or stored — there is nothing to fall back to. */
export class OriginalStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginalStoreError";
  }
}

/**
 * D282 — video-generate's voice branch. Stores the original BEFORE re-voicing, so a failed voice
 * change still delivers the paid-for video. Only an unstorable original throws.
 */
export async function deliverWithVoice(
  args: { providerVideoUrl: string; voice: VoicePayload },
  deps: DeliverDeps,
): Promise<{ videoUrl: string; meta: { voice: VoiceMeta } }> {
  const { voice } = args;
  try {
    const original = await deps.fetchProviderVideo(args.providerVideoUrl);
    await deps.putBytes(voice.originalPutUrl, original, "video/mp4");
  } catch (e) {
    throw new OriginalStoreError(
      `Video generated but could not be stored for voice change: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const result = await deps.revoice({
    sourceUrl: voice.originalUrl,
    voiceId: voice.voiceId,
    revoicedPutUrl: voice.revoicedPutUrl,
  });

  const base = { voiceId: voice.voiceId, voiceName: voice.voiceName, originalUrl: voice.originalUrl };
  return result.ok
    ? { videoUrl: voice.revoicedUrl, meta: { voice: { ...base, status: "applied" } } }
    : { videoUrl: voice.originalUrl, meta: { voice: { ...base, status: "failed", error: result.error } } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/voice-change/__tests__/deliver.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `trigger/video-generate.ts`**

Replace the import line with:
```ts
import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { deliverWithVoice, OriginalStoreError } from "@/lib/voice-change/deliver";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import type { VoicePayload } from "@/lib/voice-change/types";
import { videoRevoiceTask } from "./video-revoice";
```

Add to the payload type:
```ts
    mockMode?: boolean;
    /** D282 — present only when the node has a voice selected. */
    voice?: VoicePayload;
```

Directly after the `logger.info("Video generation call succeeded", …)` block and before the existing `try { await postWebhook({ … status: "succeeded" …`, insert:
```ts
      // D282 — voice selected: store the original, re-voice it in the child task, and report the
      // already-stored URL. Without a voice this block is skipped and the path below is unchanged.
      if (payload.voice) {
        let delivered: Awaited<ReturnType<typeof deliverWithVoice>>;
        try {
          delivered = await deliverWithVoice(
            { providerVideoUrl: result.videoUrl, voice: payload.voice },
            {
              fetchProviderVideo: (url) => fetchBytes(url, videoDownloadHeaders(modelId)),
              putBytes,
              revoice: async (args) => {
                const run = await videoRevoiceTask.triggerAndWait(args);
                if (run.ok) return { ok: true };
                const message = (run.error as { message?: unknown } | undefined)?.message;
                return { ok: false, error: typeof message === "string" ? message : "Voice change failed" };
              },
            },
          );
        } catch (e) {
          // No stored original means nothing to deliver. Abort (no retry): a retry would generate
          // — and pay for — the video again. The catch below reports the failure to the webhook.
          if (e instanceof OriginalStoreError) throw new AbortTaskRunError(e.message);
          throw e;
        }

        logger.info("Voice change finished", { generationId, voice: delivered.meta.voice.status });
        try {
          await postWebhook({
            generationId,
            status: "succeeded",
            stored: true,
            videoUrl: delivered.videoUrl,
            durationSeconds: result.durationSeconds,
            meta: delivered.meta,
          });
        } catch (e) {
          throw new Error(
            `Video generated but the webhook at ${webhookUrl} was unreachable — ` +
              `videoUrl=${delivered.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        return;
      }
```

The existing outer `catch` already posts `{ status: "failed", error }` and rethrows the same error object, so an `AbortTaskRunError` stays an `AbortTaskRunError` and the run is not retried.

- [ ] **Step 6: Verify in the Trigger dev server**

Run: `npm run dev:trigger`
Expected: both `video-generate` and `video-revoice` are listed with no build errors. Stop it afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/lib/voice-change/deliver.ts src/lib/voice-change/__tests__/deliver.test.ts trigger/video-generate.ts
git commit -m "feat(voice): voice branch in video-generate with original fallback (D282)"
```

---

### Task 8: `completeGeneration` — stored URLs, voice on the version, voice cost

**Files:**
- Modify: `src/lib/generations/complete.ts`, `src/lib/generations/version-params.ts`
- Test: `src/lib/generations/complete.test.ts` (new), `src/lib/generations/version-params.test.ts` (add cases)

**Interfaces:**
- Consumes: `isOwnStoredUrl` (Task 3), `computeVoiceChangeCost` (Task 1), `readVoiceMeta` (Task 6), `videoDownloadHeaders` (Task 4)
- Produces:
  - `CompleteGenerationInput` succeeded variant gains `stored?: boolean`
  - Version `params_used.voice: VoiceMeta` when the webhook carried `meta.voice`
  - `describeVersionParams` / `describeAllVersionParams` show `{ name: "voice", label: "Voice", value: "Priya" }` (or `"Priya — failed, original audio kept"`) instead of the raw object

- [ ] **Step 1: Write the failing tests**

`src/lib/generations/complete.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generation: {} as Record<string, unknown>,
  insertVersion: vi.fn(async () => ({ id: "ver-1" })),
  setActiveVersion: vi.fn(async () => undefined),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: vi.fn(async () => undefined),
  settleGeneration: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
  uploadVideoGen: vi.fn(async () => ({ url: "https://storage.googleapis.com/b/uploaded.mp4" })),
}));

vi.mock("@/lib/db/versions", () => ({
  insertVersion: mocks.insertVersion,
  setActiveVersion: mocks.setActiveVersion,
}));
vi.mock("@/lib/db/generations", () => ({
  getGeneration: vi.fn(async () => mocks.generation),
  succeedGeneration: mocks.succeedGeneration,
  failGeneration: mocks.failGeneration,
}));
vi.mock("@/lib/db/credit-transactions", () => ({
  settleGeneration: mocks.settleGeneration,
  refundReservation: mocks.refundReservation,
}));
vi.mock("@/lib/storage", () => ({
  uploadVideoGen: mocks.uploadVideoGen,
  isOwnStoredUrl: (url: string) => url.startsWith("https://storage.googleapis.com/b/"),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { canvases: { clients: { org_id: "org-1" } } },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { completeGeneration } from "./complete";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const ORIGINAL = "https://storage.googleapis.com/b/g1-original.mp4";
const REVOICED = "https://storage.googleapis.com/b/g1-revoiced.mp4";
const voice = (status: "applied" | "failed") => ({
  voiceId: "v1",
  voiceName: "Priya",
  status,
  originalUrl: ORIGINAL,
  ...(status === "failed" ? { error: "429" } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = {
    id: "g1",
    status: "running",
    node_id: "n1",
    org_id: "org-1",
    user_id: "u1",
    model_used: GEMINI_OMNI_MODEL_ID,
    params_snapshot: {},
    inputs_snapshot: {},
  };
});

const videoUsd = () => computeVideoCost(GEMINI_OMNI_MODEL_ID, 8, false, undefined)!.usd;

describe("completeGeneration — stored video with voice (D282)", () => {
  it("uses the stored URL as-is, records the voice and settles video + voice cost", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: REVOICED,
      durationSeconds: 8,
      meta: { voice: voice("applied") },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.uploadVideoGen).not.toHaveBeenCalled();
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        output: REVOICED,
        paramsUsed: expect.objectContaining({ durationSeconds: 8, voice: voice("applied") }),
      }),
    );
    expect(mocks.settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "g1",
      actualAmount: usdToFinalCredits(videoUsd() + computeVoiceChangeCost(8).usd),
    });
    fetchSpy.mockRestore();
  });

  it("does not charge the voice when it failed", async () => {
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: ORIGINAL,
      durationSeconds: 8,
      meta: { voice: voice("failed") },
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }),
    );
  });

  it("fails and refunds a stored URL outside our bucket", async () => {
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: "https://evil.example/x.mp4",
      durationSeconds: 8,
    });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});
```

If `computeVideoCost(GEMINI_OMNI_MODEL_ID, 8, false, undefined)` returns null in your checkout (e.g. Omni needs a resolution), pass the resolution Omni's params default to in both the test's `params_snapshot` and the `videoUsd()` helper — read it from `src/lib/video-gen/params/gemini-omni.ts`.

Add to `src/lib/generations/version-params.test.ts` (inside a new `describe`):
```ts
describe("voice on a version (D282)", () => {
  const voice = { voiceId: "v1", voiceName: "Priya", status: "applied", originalUrl: "https://s/o.mp4" };

  it("shows the voice name, not the raw object", () => {
    const all = describeAllVersionParams(undefined, { voice, durationSeconds: 8 });
    expect(all).toContainEqual({ name: "voice", label: "Voice", value: "Priya" });
    expect(all.some((e) => e.value.includes("[object"))).toBe(false);
    expect(describeVersionParams([], { voice })).toContainEqual({ name: "voice", label: "Voice", value: "Priya" });
  });

  it("says when the voice change failed", () => {
    expect(describeVersionParams([], { voice: { ...voice, status: "failed" } })).toContainEqual({
      name: "voice",
      label: "Voice",
      value: "Priya — failed, original audio kept",
    });
  });
});
```
(Make sure `describeVersionParams` and `describeAllVersionParams` are imported at the top of that test file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/generations`
Expected: FAIL — `stored` is ignored (fetch called / upload called), `voice` missing from paramsUsed, raw voice object shown.

- [ ] **Step 3: Implement `complete.ts`**

Imports (add):
```ts
import { uploadVideoGen, isOwnStoredUrl } from "@/lib/storage";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { readVoiceMeta } from "@/lib/voice-change/meta";
```
(replace the existing `import { uploadVideoGen } from "@/lib/storage";`)

Type:
```ts
  | {
      generationId: string;
      status: "succeeded";
      videoUrl: string;
      durationSeconds: number;
      /** D282 — `videoUrl` is already in our bucket (the task uploaded it); skip download/upload. */
      stored?: boolean;
      meta?: Record<string, unknown>;
    }
```

Replace step 1 (from `// 1. Download video from provider URL and upload to GCS` through the end of the upload `try/catch`) with:
```ts
  // 1. Get the video into our bucket. D282: a voice-changed generation arrives already stored.
  let storedVideoUrl: string;
  if (input.stored) {
    if (!isOwnStoredUrl(input.videoUrl)) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        "Stored video URL is outside this app's bucket",
      );
      return;
    }
    storedVideoUrl = input.videoUrl;
  } else {
    const videoResponse = await fetch(input.videoUrl, {
      headers: videoDownloadHeaders(generation.model_used),
    });
    if (!videoResponse.ok) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        `Failed to download video from provider: ${videoResponse.status}`,
      );
      return;
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    try {
      const result = await uploadVideoGen({
        nodeId: generation.node_id,
        body: videoBuffer,
        contentType: "video/mp4",
      });
      storedVideoUrl = result.url;
    } catch (e) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
      return;
    }
  }

  const voice = readVoiceMeta(input.meta?.voice);
```
(Drop the `console.log("[complete] GCP_PROJECT_ID present…")` line — it only made sense beside the upload and is debug noise.)

In `insertVersion`, change `paramsUsed` to:
```ts
    paramsUsed: {
      ...(generation.params_snapshot ?? {}),
      durationSeconds: input.durationSeconds,
      ...(voice ? { voice } : {}),
    },
```

Replace the cost block (`const cost = …` through `const actualCredits = …`) with:
```ts
  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
    : null;
  // D282 — the voice change is charged only when it was applied; a fallback to the original is free.
  const voiceUsd = voice?.status === "applied" ? computeVoiceChangeCost(input.durationSeconds).usd : 0;
  const totalUsd = (cost?.usd ?? 0) + voiceUsd;
  // cost is only ever null when model_used is unset (shouldn't happen — every video
  // generation records a model at insertGeneration) — an actual cost of 0 credits in that
  // case, not a reason to skip settlement.
  const actualCredits = cost || voiceUsd > 0 ? usdToFinalCredits(totalUsd) : 0;
```
and in `succeedGeneration` use `costUsd: cost || voiceUsd > 0 ? totalUsd : undefined,`.

- [ ] **Step 4: Implement `version-params.ts`**

Add `"voice"` to `INTERNAL_PARAM_KEYS`, import `readVoiceMeta`, and add:
```ts
import { readVoiceMeta } from "@/lib/voice-change/meta";

/** D282 — the voice a version was re-voiced with, as one readable entry. */
function voiceEntries(paramsUsed: Record<string, unknown>): VersionParamEntry[] {
  const voice = readVoiceMeta(paramsUsed.voice);
  if (!voice) return [];
  const value =
    voice.status === "applied" ? voice.voiceName : `${voice.voiceName} — failed, original audio kept`;
  return [{ name: "voice", label: "Voice", value }];
}
```
Then append `...voiceEntries(paramsUsed)` to every return of both `describeVersionParams` and `describeAllVersionParams`:
```ts
  if (!specs) return [...keyEntries(paramsUsed, (key) => INTERNAL_PARAM_KEYS.has(key)), ...voiceEntries(paramsUsed)];
  return [
    ...inPanelOrder(specs)
      .filter((p) => p.visible && p.component !== "textarea")
      .filter((p) => paramsUsed[p.name] !== undefined && paramsUsed[p.name] !== null)
      .map((p) => ({ name: p.name, label: p.label, value: formatValue(paramsUsed[p.name]) })),
    ...voiceEntries(paramsUsed),
  ];
```
(and `return [...fromSpecs, ...undeclared, ...voiceEntries(paramsUsed)];` in `describeAllVersionParams`, with the same change to its `!specs` branch).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/generations`
Expected: PASS (new `complete.test.ts` + all `version-params.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/generations
git commit -m "feat(voice): complete stored generations, record voice, charge only when applied (D282)"
```

---

### Task 9: `video-generate` route — accept, validate and dispatch the voice

**Files:**
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`
- Test: `src/app/api/nodes/[id]/video-generate/route.test.ts` (add a `describe`)

**Interfaces:**
- Consumes: `voiceChangeBlockedReason`, `getVoicesCached`, `ElevenLabsKeyMissingError`, `VOICE_NOT_SET_UP_MESSAGE`, `computeVoiceChangeCost` (Task 1); `signVideoGenVoiceUrls` (Task 3); `VoicePayload` (Task 6)
- Produces: request body accepts `voiceId?: string`; the `video-generate` trigger payload carries `voice: VoicePayload` when a voice is used

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`, extend `mocks` in the existing `vi.hoisted` block with:
```ts
  getVoicesCached: vi.fn(async () => [
    { voiceId: "v1", name: "Priya", category: "cloned", previewUrl: null },
  ]),
  signVideoGenVoiceUrls: vi.fn(async () => ({
    originalPutUrl: "https://put/o",
    originalUrl: "https://storage.googleapis.com/b/o.mp4",
    revoicedPutUrl: "https://put/r",
    revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
  })),
```
and add, beside the other `vi.mock` calls (before `import { POST } from "./route";`):
```ts
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoicesCached: mocks.getVoicesCached }));
vi.mock("@/lib/storage", () => ({ signVideoGenVoiceUrls: mocks.signVideoGenVoiceUrls }));
```
Then append:
```ts
import { videoGenRegistry } from "@/lib/video-gen/registry";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";

// A single-take video-prompt lane: vg <- vp (string prompt). No images.
function simpleGraph(): Record<string, Row[]> {
  return {
    vg: [{ nodeId: "vp", type: "video-prompt", data: {}, activeOutput: "A hand lifts keys.", versionId: "v9" }],
    vp: [],
  };
}

const AUDIO_MODEL_ID = Object.values(videoGenRegistry).find((m) =>
  m.params.some((p) => p.name === "audio"),
)!.id;

describe("POST video-generate — voice change (D282)", () => {
  it("rejects a voice when the model's audio is off, before recording anything", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: AUDIO_MODEL_ID, params: { audio: "off" }, voiceId: "v1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Audio/);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("rejects a voice that isn't on the ElevenLabs account", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "gone" });
    expect(res.status).toBe(400);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("rejects a voice when the ElevenLabs key is missing", async () => {
    mocks.graph = simpleGraph();
    mocks.getVoicesCached.mockRejectedValueOnce(new ElevenLabsKeyMissingError());
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ELEVEN_LABS_API_KEY/);
  });

  it("reserves video + voice and sends the voice payload to the task", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1" });
    expect(res.status).toBe(202);

    const payload = mocks.triggerTask.mock.calls[0][1] as unknown as {
      params: Record<string, unknown>;
      voice: Record<string, string>;
    };
    expect(payload.voice).toEqual({
      voiceId: "v1",
      voiceName: "Priya",
      originalPutUrl: "https://put/o",
      originalUrl: "https://storage.googleapis.com/b/o.mp4",
      revoicedPutUrl: "https://put/r",
      revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
    });
    expect(mocks.signVideoGenVoiceUrls).toHaveBeenCalledWith({ nodeId: "vg", generationId: "gen-1" });

    const p = payload.params;
    const duration = Number(p.seconds ?? p.duration ?? 0);
    const video = computeVideoCost(
      GEMINI_OMNI_MODEL_ID,
      duration,
      isVideoAudioEnabled(p.audio),
      asResolutionString(p.resolution),
    )!;
    expect(mocks.reserveCredits).toHaveBeenCalledWith(
      "org-1",
      "gen-1",
      usdToFinalCredits(video.usd + computeVoiceChangeCost(duration).usd),
    );
  });

  it("ignores the voice in mock mode and leaves the payload unchanged", async () => {
    mocks.graph = simpleGraph();
    const res = await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {}, voiceId: "v1", mock: true });
    expect(res.status).toBe(202);
    expect(mocks.getVoicesCached).not.toHaveBeenCalled();
    expect(mocks.triggerTask.mock.calls[0][1]).not.toHaveProperty("voice");
  });

  it("sends no voice key at all when none is selected", async () => {
    mocks.graph = simpleGraph();
    await post({ modelId: GEMINI_OMNI_MODEL_ID, params: {} });
    expect(mocks.triggerTask.mock.calls[0][1]).not.toHaveProperty("voice");
    expect(mocks.signVideoGenVoiceUrls).not.toHaveBeenCalled();
  });
});
```

If the Gemini Omni happy path returns 400 because a rule needs an image (check the error text), give `simpleGraph()` a reference image the way `buildGraph` does and pass `imageRoles: { ig: "reference" }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate"`
Expected: the new D282 tests FAIL (voice ignored, 202 where 400 is expected, no `voice` in payload); existing tests still PASS.

- [ ] **Step 3: Implement**

Imports (add):
```ts
import { voiceChangeBlockedReason } from "@/lib/elevenlabs/voice-eligibility";
import { getVoicesCached } from "@/lib/elevenlabs/voices-cache";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { signVideoGenVoiceUrls } from "@/lib/storage";
import type { VoicePayload } from "@/lib/voice-change/types";
```

Schema:
```ts
const GenerateBodySchema = z.object({
  modelId: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  imageRoles: z.record(z.string(), ImageRoleSchema).optional(),
  mock: z.boolean().optional(),
  // D282 — ElevenLabs voice to re-voice the clip with. Absent = keep the model's own audio.
  voiceId: z.string().min(1).optional(),
});
```

Directly after `resolvedParams` is built (after the `const resolvedParams = Object.fromEntries(…)` statement), insert:
```ts
    const mockMode = body.mock === true;

    // D282 — voice guards. Before insertGeneration and reserveCredits, like the D97 checks, so a
    // rejected request neither records a generation nor touches the credit balance. Mock runs
    // never re-voice: the voice is dropped rather than rejected, matching the disabled picker.
    const voiceId = mockMode ? undefined : body.voiceId;
    let voiceName: string | undefined;
    if (voiceId) {
      const blocked = voiceChangeBlockedReason(
        config.params.map((spec) => spec.name),
        resolvedParams,
      );
      if (blocked) return apiError(blocked, 400);
      let voices;
      try {
        voices = await getVoicesCached();
      } catch (e) {
        return apiError(
          e instanceof ElevenLabsKeyMissingError
            ? VOICE_NOT_SET_UP_MESSAGE
            : "Could not reach ElevenLabs to check the voice. Try again, or generate without a voice.",
          400,
        );
      }
      const voice = voices.find((v) => v.voiceId === voiceId);
      if (!voice) {
        return apiError("That voice is no longer on the ElevenLabs account. Pick another voice.", 400);
      }
      voiceName = voice.name;
    }
```
and delete the later `const mockMode = body.mock === true;` line (just above `insertGeneration`).

Inside the `try`, replace the estimate lines with:
```ts
      const estimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
      if (estimate === null) {
        throw new Error(`No cost estimate available for ${modelId} at these params.`);
      }
      const voiceUsd = voiceId ? computeVoiceChangeCost(durationSeconds).usd : 0;
      const estimatedCredits = usdToFinalCredits(estimate.usd + voiceUsd);
```

and replace the `tasks.trigger` call with:
```ts
      let voice: VoicePayload | undefined;
      if (voiceId && voiceName) {
        const urls = await signVideoGenVoiceUrls({ nodeId, generationId: generation.id });
        voice = { voiceId, voiceName, ...urls };
      }

      // Fire Trigger.dev task (no await — the task runs in the background)
      await tasks.trigger("video-generate", {
        generationId: generation.id,
        modelId,
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls,
        params: resolvedParams,
        mockMode,
        // D282 — omitted entirely without a voice, so that payload is unchanged.
        ...(voice ? { voice } : {}),
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/nodes/[id]/video-generate"`
Expected: PASS (existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/video-generate"
git commit -m "feat(voice): video-generate route validates, prices and dispatches the voice (D282)"
```

---

### Task 10: The Voice control on the Video Gen node

**Files:**
- Create: `src/hooks/use-elevenlabs-voices.ts`, `src/components/nodes/video-gen-voice-select.tsx`
- Modify: `src/lib/video-gen/api.ts:26-31`, `src/lib/canvas-nodes.ts:109-115`, `src/components/nodes/video-gen-node.tsx:152-162`, `src/components/nodes/video-gen-focus-view.tsx` (Props ~268, destructure ~479, estimate ~1204-1207, `doGenerate` ~984-989, after `</VideoGenModelPicker>` ~1572, player ~1922), `src/components/nodes/video-gen-usage-popover.tsx`
- Test: `src/components/nodes/__tests__/video-gen-voice-select.test.tsx`

**Interfaces:**
- Consumes: `elevenLabsApi.fetchVoices` (Task 2), `ElevenLabsVoice` / `CUSTOM_VOICE_CATEGORIES` (Task 1), `voiceChangeBlockedReason` / `computeVoiceChangeCost` (Task 1), `readVoiceMeta` (Task 6)
- Produces:
  - `useElevenLabsVoices(enabled: boolean): { voices: ElevenLabsVoice[]; loading: boolean; error: string | null }`
  - `<VideoGenVoiceSelect value: string | null; onChange: (voiceId: string | null) => void; voices; loading; error; blockedReason: string | null />`
  - `VideoGenNodeData.voiceId?: string | null`; `StartGenerationPayload.voiceId?: string`

- [ ] **Step 1: Check the test setup for components**

Run: `npx vitest run src/components/nodes/mention-instruction-editor.test.tsx`
Look at that file's header for how component tests render (it sets a `// @vitest-environment` pragma and uses `@testing-library/react` if installed). Mirror its setup exactly in the new test. If the repo has no DOM test setup, test the pure grouping helper below instead of rendering.

- [ ] **Step 2: Write the failing test**

`src/components/nodes/__tests__/video-gen-voice-select.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { groupVoices } from "../video-gen-voice-select";

describe("groupVoices", () => {
  it("splits custom voices from the ElevenLabs library, keeping order", () => {
    const groups = groupVoices([
      { voiceId: "c1", name: "Priya", category: "cloned", previewUrl: null },
      { voiceId: "p1", name: "Adam", category: "premade", previewUrl: "https://p/a.mp3" },
    ]);
    expect(groups.custom.map((v) => v.voiceId)).toEqual(["c1"]);
    expect(groups.library.map((v) => v.voiceId)).toEqual(["p1"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/video-gen-voice-select.test.tsx`
Expected: FAIL — cannot resolve `../video-gen-voice-select`.

- [ ] **Step 4: Implement the hook and component**

`src/hooks/use-elevenlabs-voices.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { ElevenLabsVoice } from "@/lib/elevenlabs/client";

/** D282 — the account's voices for the Video Gen voice picker. Loads once `enabled` is true. */
export function useElevenLabsVoices(enabled: boolean) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    elevenLabsApi
      .fetchVoices()
      .then((v) => {
        if (!cancelled) {
          setVoices(v);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load voices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { voices, loading, error };
}
```

`src/components/nodes/video-gen-voice-select.tsx`:
```tsx
"use client";

import { Play } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CUSTOM_VOICE_CATEGORIES } from "@/lib/elevenlabs/constants";
import type { ElevenLabsVoice } from "@/lib/elevenlabs/client";

const ORIGINAL = "original";

export function groupVoices(voices: ElevenLabsVoice[]) {
  return {
    custom: voices.filter((v) => CUSTOM_VOICE_CATEGORIES.has(v.category)),
    library: voices.filter((v) => !CUSTOM_VOICE_CATEGORIES.has(v.category)),
  };
}

type Props = {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  voices: ElevenLabsVoice[];
  loading: boolean;
  error: string | null;
  /** Why no voice can be applied right now (audio off, mock) — disables the control. */
  blockedReason: string | null;
};

// D282 — optional ElevenLabs voice for the Video Gen node. "Original" keeps the model's audio.
export function VideoGenVoiceSelect({ value, onChange, voices, loading, error, blockedReason }: Props) {
  const { custom, library } = groupVoices(voices);
  const selected = voices.find((v) => v.voiceId === value) ?? null;
  const disabled = Boolean(blockedReason) || Boolean(error) || loading;

  function playPreview() {
    if (!selected?.previewUrl) return;
    void new Audio(selected.previewUrl).play().catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select
          value={blockedReason ? ORIGINAL : (value ?? ORIGINAL)}
          onValueChange={(v) => onChange(v === ORIGINAL || v === null ? null : String(v))}
          disabled={disabled}
        >
          <SelectTrigger className="nodrag flex-1 text-sm" aria-label="Voice">
            <SelectValue>
              {loading ? "Loading voices…" : (selected?.name ?? "Original (no change)")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ORIGINAL}>Original (no change)</SelectItem>
            {custom.length > 0 && (
              <SelectGroup>
                <SelectLabel>Your voices</SelectLabel>
                {custom.map((v) => (
                  <SelectItem key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {library.length > 0 && (
              <SelectGroup>
                <SelectLabel>ElevenLabs library</SelectLabel>
                {library.map((v) => (
                  <SelectItem key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="nodrag shrink-0"
          aria-label="Play voice preview"
          onClick={playPreview}
          disabled={!selected?.previewUrl || disabled}
        >
          <Play className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
      {(blockedReason || error) && (
        <p className="text-xs text-muted-foreground">{blockedReason ?? error}</p>
      )}
      {!blockedReason && !error && selected && (
        <p className="text-xs text-muted-foreground">
          The clip&apos;s voice is changed after it generates. Timing stays the same.
        </p>
      )}
    </div>
  );
}
```
Before finishing, open `src/components/ui/select.tsx` and `src/components/ui/button.tsx` and confirm: `SelectLabel` is exported (it is, line 98), `Select`'s `onValueChange` signature (Base UI passes `(value, event)`; `value` may be `null`), and that `Button` has `size="icon"` — if its icon size is named differently (e.g. `icon-sm`), use that name.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/nodes/__tests__/video-gen-voice-select.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire it into the node**

`src/lib/canvas-nodes.ts` — `VideoGenNodeData` gains:
```ts
  /** D282 — ElevenLabs voice applied after generation. null/undefined = keep the model's audio. */
  voiceId?: string | null;
```

`src/lib/video-gen/api.ts` — `StartGenerationPayload` gains `voiceId?: string;`.

`src/components/nodes/video-gen-node.tsx` — pass the prop:
```tsx
      imageRoles={d.imageRoles ?? {}}
      voiceId={d.voiceId ?? null}
      onPatch={handlePatch}
```

`src/components/nodes/video-gen-focus-view.tsx`:

1. Imports:
```ts
import { Mic } from "lucide-react"; // add Mic to the existing lucide-react import list instead of a new line
import { VideoGenVoiceSelect } from "./video-gen-voice-select";
import { useElevenLabsVoices } from "@/hooks/use-elevenlabs-voices";
import { voiceChangeBlockedReason } from "@/lib/elevenlabs/voice-eligibility";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { readVoiceMeta } from "@/lib/voice-change/meta";
```
2. `Props` gains `voiceId: string | null;` and the destructure gains `voiceId: voiceIdProp,`.
3. Near the top of the component body (after the `useState` block):
```ts
  const voiceList = useElevenLabsVoices(open);
```
4. Replace the estimate lines (currently `const videoCostEstimate = …` and `const estimatedCredits = …`) with:
```ts
  // D282 — a voice that can't apply (audio off) is treated as none everywhere: estimate and request.
  const voiceBlockedReason = voiceChangeBlockedReason(
    videoGenClientModelMap[modelId]?.params.map((p) => p.name) ?? [],
    effectiveParams,
  );
  const effectiveVoiceId = voiceBlockedReason ? null : voiceIdProp;
  const videoCostEstimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  const voiceCostUsd = effectiveVoiceId ? computeVoiceChangeCost(durationSeconds).usd : 0;
  const estimatedCredits = videoCostEstimate
    ? usdToFinalCredits(videoCostEstimate.usd + voiceCostUsd)
    : null;
```
5. In `doGenerate`, add to the payload:
```ts
        imageRoles: effectiveImageRoles,
        ...(effectiveVoiceId ? { voiceId: effectiveVoiceId } : {}),
```
6. Directly after `</VideoGenModelPicker>`:
```tsx
                  <LeftSection icon={Mic} label="Voice">
                    <VideoGenVoiceSelect
                      value={voiceIdProp}
                      onChange={(v) => onPatch({ voiceId: v })}
                      voices={voiceList.voices}
                      loading={voiceList.loading}
                      error={voiceList.error}
                      blockedReason={voiceBlockedReason}
                    />
                  </LeftSection>
```
7. Failed-voice note: after `const activeVersion = versions.find(…)`, add
```ts
  const activeVoice = readVoiceMeta(activeVersion?.paramsUsed?.voice);
```
and inside the player column, directly after `<div className="flex h-full min-h-0 flex-col">`:
```tsx
                    {activeVoice?.status === "failed" && (
                      <p className="mb-1 text-xs text-muted-foreground">
                        Voice change failed — showing the original audio.
                      </p>
                    )}
```

`src/components/nodes/video-gen-usage-popover.tsx` — show when a version was re-voiced. Add `voiced: boolean` to `GenStat`, set it with
```ts
        voiced: readVoiceMeta(v.paramsUsed?.voice)?.status === "applied",
```
(import `readVoiceMeta` from `@/lib/voice-change/meta`), and change the row meta to
```ts
    meta: `${g.durationSeconds}s · ${g.modelLabel}${g.voiced ? " · voice" : ""}`,
```

- [ ] **Step 7: Type-check, lint and run the related tests**

Run: `npx tsc --noEmit -p . && npm run lint -- src/components/nodes src/hooks src/lib/elevenlabs src/lib/voice-change && npx vitest run src/components/nodes src/lib/video-gen`
Expected: no type errors, no lint errors, tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-elevenlabs-voices.ts src/components/nodes src/lib/video-gen/api.ts src/lib/canvas-nodes.ts
git commit -m "feat(voice): Voice picker on the Video Gen node (D282)"
```

---

### Task 11: End-to-end check on staging and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-elevenlabs-voice-change-design.md` (only if reality differs)

- [ ] **Step 1: Set the key everywhere**

Add `ELEVEN_LABS_API_KEY` to local `.env` / `.env.local`, the Vercel project (staging + production), and both Trigger.dev projects (staging + production env vars). Ask the user to do the Vercel and Trigger.dev dashboards — they are outward-facing settings.

- [ ] **Step 2: Run the app and the Trigger dev worker**

Run (two terminals): `npm run dev` and `npm run dev:trigger`
Expected: the Trigger CLI lists `video-generate` and `video-revoice`.

- [ ] **Step 3: Manual run — voice applied**

On a canvas with a Gemini Omni Video Gen node: open the focus view, pick a voice (the list shows "Your voices" / "ElevenLabs library"), check that the credit estimate rises slightly, Generate.
Expected: the node gets one new version; playing it, the voice is the chosen one and lip sync holds; History shows "Voice: <name>"; the usage popover row ends with "· voice"; in GCS both `…-original.mp4` and `…-revoiced.mp4` exist.

- [ ] **Step 4: Manual run — fallback**

Temporarily set `ELEVEN_LABS_API_KEY` in the Trigger dev env to an invalid value (leave the app's key valid so the route passes), Generate with a voice.
Expected: `video-revoice` retries 3 times and fails; the node gets the ORIGINAL video with the note "Voice change failed — showing the original audio."; the charge equals the video cost only. Restore the key.

- [ ] **Step 5: Manual run — no voice**

Set the picker back to "Original (no change)" and Generate.
Expected: exactly today's behavior; no `video-revoice` run; no `-original.mp4` object.

- [ ] **Step 6: Verify and commit any doc corrections**

Run: `npx vitest run src/lib/elevenlabs src/lib/voice-change src/lib/generations src/lib/storage src/lib/media "src/app/api/nodes/[id]/video-generate" src/app/api/elevenlabs`
Expected: all PASS.

If anything in the spec turned out different in practice (e.g. model id, ffmpeg flags), update the spec and commit:
```bash
git add docs/superpowers/specs/2026-09-24-elevenlabs-voice-change-design.md
git commit -m "docs: align voice change spec with implementation (D282)"
```
