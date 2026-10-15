# Dubbing Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Dubbing node that dubs its one connected Video Gen node's current take into an Indian language (Sarvam, presenter's cloned voice) and lip-syncs it (sync `lipsync-2-pro` via fal), keeping original / dubbed / lip-synced on each version.

**Architecture:** Same shape as Change voice (D284): a route resolves the source on the server, prices it, reserves credits, signs our upload URLs and triggers a Trigger.dev task; the task runs the vendor job (paid call once, polls with `wait.for`), stores results in our bucket and posts the generation webhook; `completeGeneration` inserts (dub) or updates (lip sync) the node's version and settles credits. The browser reads versions through TanStack Query and running state from the canvas's one generations feed.

**Tech Stack:** Next.js route handlers, Supabase, Trigger.dev v4 (`@trigger.dev/sdk/v3` imports, as the existing tasks use), zod, TanStack Query v5, React Flow, shadcn (Base UI), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-dubbing-node-design.md` · ADRs D374–D377.

## Global Constraints

- Read `AGENTS.md` before writing code. Next.js here has breaking changes; check `node_modules/next/dist/docs/` before touching route conventions.
- Controls are shadcn primitives from `src/components/ui/*` only — never raw `<button>`, `<select>`, `<input>`. `<video>` is fine (not a control).
- Lucide icons only, `strokeWidth={1.5}`. Purple used sparingly. Motion easing `cubic-bezier(0.22,1,0.36,1)` only.
- User-facing copy is plain: **no vendor names** (Sarvam, fal, sync), no raw errors, no em-dash phrasing.
- Performance rules: nothing per node on mount (no query, no channel); selectors O(1); never pay a vendor twice.
- Routes use `withNode`, `apiOk` / `apiError`. Never `NextResponse.json`.
- One engine each: dub `sarvam` / `sarvam-dub` (`model_used: "sarvam:dub"`), lip sync `fal` / `lipsync-2-pro` (`model_used: "fal:lipsync-2-pro"`). No picker.
- Source spoken language is `en-IN`. Max clip length `DUB_MAX_SECONDS = 60`. Polls give up at 12 minutes.
- Env: `SARVAM_API_KEY`, `FAL_KEY` (Vercel **and** both Trigger.dev projects).
- Run tests per file/directory (`npx vitest run <path>`), not the full suite (known timeout flakes).
- Commit after each task. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

**Create**
| File | Responsibility |
| --- | --- |
| `src/lib/dubbing/types.ts` | Languages, `DubbingOutput`, `DubRecord`, `LipSyncRecord`, readers, stage helpers. Client-safe. |
| `src/lib/dubbing/providers.ts` | The one engine per step (`DUB_ENGINE`, `LIP_SYNC_ENGINE`). |
| `src/lib/dubbing/constants.ts` | `DUB_MAX_SECONDS`, poll interval/timeout, upload expiry. |
| `src/lib/dubbing/copy.ts` | Plain user-facing error strings. |
| `src/lib/dubbing/cost.ts` | `computeDubCost`, `computeLipSyncCost`, `dubCredits`, `lipSyncCredits`. |
| `src/lib/sarvam/client.ts` | Sarvam Dubbing REST client (no `server-only`; tasks import it). |
| `src/lib/fal/client.ts` | fal queue REST client for sync lipsync v2. |
| `src/lib/dubbing/poll.ts` | `retryInPlace` + `pollUntil` shared by both runners. |
| `src/lib/dubbing/run-dub.ts` | Dub task steps, deps injected. |
| `src/lib/dubbing/run-lip-sync.ts` | Lip-sync task steps, deps injected. |
| `src/lib/dubbing/source.ts` | Resolve the connected Video Gen take (server). |
| `src/lib/dubbing/complete.ts` | `completeDubGeneration`, `completeLipSyncGeneration` (server). |
| `trigger/video-dub.ts`, `trigger/video-lip-sync.ts` | The two tasks. |
| `src/app/api/nodes/[id]/dub/route.ts` (+ test) | Start a dub. |
| `src/app/api/nodes/[id]/lip-sync/route.ts` (+ test) | Start a lip sync. |
| `src/components/nodes/dubbing-node.tsx` | Canvas card. |
| `src/components/nodes/dubbing-focus-view.tsx` | Focus view shell. |
| `src/components/nodes/dubbing-focus-rail.tsx` | Rail: Dubbing · Connected · History. |
| `src/components/nodes/dubbing-controls.tsx` | Dub into + Dub + Lip sync. |
| `src/components/nodes/dubbing-player.tsx` | Video + Original/Dubbed/Lip-synced switch. |
| `src/components/nodes/dubbing-version-history.tsx` | History rows. |
| `src/components/nodes/dubbing-usage-popover.tsx` | Credits per version. |
| `src/hooks/use-dubbing-versions.ts` | Versions + mirror active output to the card. |

**Modify**
`src/lib/db/types.ts` (generation type), `src/lib/db/versions.ts` (update helper), `src/lib/db/generations.ts` (sum credits), `src/lib/generations/complete.ts` (dispatch), `src/lib/generations/node-status.ts` (kinds + toasts), `src/lib/generation-tray.ts` (Dub kind), `src/lib/storage/paths.ts` + `index.ts` (dubbing paths/signers), `src/lib/canvas-nodes.ts` (type, connections, incoming limit), `src/lib/canvas-node-options.ts`, `src/lib/canvas-store.ts` (default data), `src/lib/nodes/describe-node.ts`, `src/components/canvas/canvas.tsx`, `src/components/canvas/quick-add-menu.tsx`, `src/components/nodes/connected-inputs-card.tsx` (NodeIcon), `src/components/nodes/add-connection.tsx`, `src/lib/copilot/actions.ts`, `src/app/api/nodes/[id]/versions/route.ts` (`dubbing` field), `src/services/node-generation.service.ts`, `src/hooks/queries/node-generation.ts`, `.env.example`, `docs/auth-production-migration.md`.

---

### Task 1: Dubbing domain core (types, engines, constants, copy, cost)

**Files:**
- Create: `src/lib/dubbing/types.ts`, `src/lib/dubbing/providers.ts`, `src/lib/dubbing/constants.ts`, `src/lib/dubbing/copy.ts`, `src/lib/dubbing/cost.ts`
- Test: `src/lib/dubbing/__tests__/types.test.ts`, `src/lib/dubbing/__tests__/cost.test.ts`

**Interfaces — Produces:**
- `DUB_SOURCE_LANGUAGE = "en-IN"`, `DUB_LANGUAGES: readonly { code: DubLanguage; label: string }[]`, `type DubLanguage`, `DEFAULT_DUB_LANGUAGE: DubLanguage`, `isDubLanguage(v: unknown): v is DubLanguage`, `dubLanguageLabel(code: string): string`
- `type DubbingOutput = { language: DubLanguage; original: string; dubbed: string; dubbedAudio: string; lipSynced: string | null }`, `readDubbingOutput(v: unknown): DubbingOutput | null`
- `type DubStage = "original" | "dubbed" | "lipSynced"`, `furthestStage(o: DubbingOutput): DubStage`, `stageUrl(o: DubbingOutput, s: DubStage): string | null`
- `type DubRecord = { sourceNodeId: string; sourceVersionId: string; sourceUrl: string; srcLang: string; targetLang: DubLanguage; durationSeconds: number; provider: string; model: string; vendorJobId?: string }`, `readDubRecord(v: unknown): DubRecord | null`
- `type LipSyncRecord = { versionId: string; provider: string; model: string; runs: number; lastRanAt?: string; vendorRequestId?: string }`, `readLipSyncRecord(v: unknown): LipSyncRecord | null`
- `DUB_ENGINE`, `LIP_SYNC_ENGINE` (`{ provider, model, modelUsed }`)
- `DUB_MAX_SECONDS = 60`, `DUB_POLL_INTERVAL_SECONDS = 10`, `DUB_POLL_TIMEOUT_MS = 12 * 60 * 1000`, `DUBBING_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000`
- Copy: `DUBBING_NOT_SET_UP_MESSAGE`, `DUB_FAILED_MESSAGE`, `DUB_NO_SPEECH_MESSAGE`, `DUB_TIMEOUT_MESSAGE`, `LIP_SYNC_FAILED_MESSAGE`
- `computeDubCost(seconds: number): { usd: number }`, `computeLipSyncCost(seconds: number): { usd: number }`, `dubCredits(seconds: number): number`, `lipSyncCredits(seconds: number): number`

- [ ] **Step 1: Write the failing tests**

`src/lib/dubbing/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DUB_LANGUAGES, DEFAULT_DUB_LANGUAGE, isDubLanguage, dubLanguageLabel,
  readDubbingOutput, furthestStage, stageUrl, readDubRecord, readLipSyncRecord,
} from "../types";

const OUT = { language: "hi-IN", original: "https://o.mp4", dubbed: "https://d.mp4", dubbedAudio: "https://d.mp3", lipSynced: null };

describe("dubbing types", () => {
  it("lists the eleven target languages, never the English source", () => {
    expect(DUB_LANGUAGES.map((l) => l.code)).toEqual(["hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "or-IN", "pa-IN", "ta-IN", "te-IN", "as-IN"]);
    expect(isDubLanguage("en-IN")).toBe(false);
    expect(isDubLanguage("ta-IN")).toBe(true);
    expect(DEFAULT_DUB_LANGUAGE).toBe("hi-IN");
    expect(dubLanguageLabel("ta-IN")).toBe("Tamil");
    expect(dubLanguageLabel("xx")).toBe("xx");
  });

  it("reads a dubbing output and rejects anything else", () => {
    expect(readDubbingOutput(OUT)).toEqual(OUT);
    expect(readDubbingOutput({ ...OUT, lipSynced: "https://l.mp4" })?.lipSynced).toBe("https://l.mp4");
    expect(readDubbingOutput("https://video.mp4")).toBeNull();
    expect(readDubbingOutput({ ...OUT, language: "en-IN" })).toBeNull();
    expect(readDubbingOutput({ ...OUT, dubbed: 3 })).toBeNull();
  });

  it("picks the furthest stage and its url", () => {
    expect(furthestStage(OUT as never)).toBe("dubbed");
    const synced = { ...OUT, lipSynced: "https://l.mp4" } as never;
    expect(furthestStage(synced)).toBe("lipSynced");
    expect(stageUrl(synced, "original")).toBe("https://o.mp4");
    expect(stageUrl(OUT as never, "lipSynced")).toBeNull();
  });

  it("reads the dub and lip-sync records", () => {
    const dub = { sourceNodeId: "v", sourceVersionId: "s", sourceUrl: "https://o.mp4", srcLang: "en-IN", targetLang: "hi-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" };
    expect(readDubRecord(dub)).toEqual(dub);
    expect(readDubRecord({ ...dub, durationSeconds: 0 })).toBeNull();
    expect(readLipSyncRecord({ versionId: "v1", provider: "fal", model: "lipsync-2-pro", runs: 2 })).toEqual({ versionId: "v1", provider: "fal", model: "lipsync-2-pro", runs: 2 });
    expect(readLipSyncRecord({ versionId: "v1" })).toBeNull();
  });
});
```

`src/lib/dubbing/__tests__/cost.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeDubCost, computeLipSyncCost, dubCredits, lipSyncCredits, SARVAM_DUB_INR_PER_MIN, LIP_SYNC_PRO_USD_PER_MIN } from "../cost";
import { USD_TO_INR } from "@/lib/pricing";
import { usdToFinalCredits } from "@/lib/credits/units";

describe("dubbing cost", () => {
  it("bills the dub per whole second of source, in rupees converted to dollars", () => {
    expect(computeDubCost(8.2).usd).toBeCloseTo((9 / 60) * SARVAM_DUB_INR_PER_MIN / USD_TO_INR, 10);
  });
  it("bills lip sync per second of video", () => {
    expect(computeLipSyncCost(12).usd).toBeCloseTo((12 / 60) * LIP_SYNC_PRO_USD_PER_MIN, 10);
  });
  it("turns both into final credits the same way the reservation does", () => {
    expect(dubCredits(8)).toBe(usdToFinalCredits(computeDubCost(8).usd));
    expect(lipSyncCredits(8)).toBe(usdToFinalCredits(computeLipSyncCost(8).usd));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/dubbing/__tests__`
Expected: FAIL — `Cannot find module '../types'` / `'../cost'`.

- [ ] **Step 3: Implement**

`src/lib/dubbing/types.ts`:
```ts
// D374/D375 — the Dubbing node's shapes. Client-safe: the card, focus view, usage popover and
// the server all read these.

/** The source's spoken language. The vendor needs it; the view has one select by design (D374). */
export const DUB_SOURCE_LANGUAGE = "en-IN";

export const DUB_LANGUAGES = [
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "or-IN", label: "Odia" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "as-IN", label: "Assamese" },
] as const;

export type DubLanguage = (typeof DUB_LANGUAGES)[number]["code"];
export const DEFAULT_DUB_LANGUAGE: DubLanguage = "hi-IN";

const CODES = new Set<string>(DUB_LANGUAGES.map((l) => l.code));

export function isDubLanguage(v: unknown): v is DubLanguage {
  return typeof v === "string" && CODES.has(v);
}

export function dubLanguageLabel(code: string): string {
  return DUB_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** D375 — a Dubbing version's output: the three stages of one dub. */
export type DubbingOutput = {
  language: DubLanguage;
  original: string;
  dubbed: string;
  dubbedAudio: string;
  lipSynced: string | null;
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function readDubbingOutput(v: unknown): DubbingOutput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (!isDubLanguage(o.language) || !isStr(o.original) || !isStr(o.dubbed) || !isStr(o.dubbedAudio)) return null;
  if (o.lipSynced !== null && o.lipSynced !== undefined && !isStr(o.lipSynced)) return null;
  return {
    language: o.language,
    original: o.original,
    dubbed: o.dubbed,
    dubbedAudio: o.dubbedAudio,
    lipSynced: isStr(o.lipSynced) ? o.lipSynced : null,
  };
}

export type DubStage = "original" | "dubbed" | "lipSynced";

export function furthestStage(o: DubbingOutput): DubStage {
  return o.lipSynced ? "lipSynced" : "dubbed";
}

export function stageUrl(o: DubbingOutput, stage: DubStage): string | null {
  return stage === "original" ? o.original : stage === "dubbed" ? o.dubbed : o.lipSynced;
}

/** Stored on `generations.inputs_snapshot.dub` and the version's `inputs_used.dub`. */
export type DubRecord = {
  sourceNodeId: string;
  sourceVersionId: string;
  sourceUrl: string;
  srcLang: string;
  targetLang: DubLanguage;
  durationSeconds: number;
  provider: string;
  model: string;
  vendorJobId?: string;
};

export function readDubRecord(v: unknown): DubRecord | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const d = o.durationSeconds;
  if (
    !isStr(o.sourceNodeId) || !isStr(o.sourceVersionId) || !isStr(o.sourceUrl) || !isStr(o.srcLang) ||
    !isDubLanguage(o.targetLang) || typeof d !== "number" || !(d > 0) || !isStr(o.provider) || !isStr(o.model)
  ) return null;
  return {
    sourceNodeId: o.sourceNodeId, sourceVersionId: o.sourceVersionId, sourceUrl: o.sourceUrl,
    srcLang: o.srcLang, targetLang: o.targetLang, durationSeconds: d, provider: o.provider, model: o.model,
    ...(isStr(o.vendorJobId) ? { vendorJobId: o.vendorJobId } : {}),
  };
}

/** Stored on `generations.inputs_snapshot.lipSync` (which version) and merged into that
 *  version's `inputs_used.lipSync` (how many runs, the last vendor request). */
export type LipSyncRecord = {
  versionId: string;
  provider: string;
  model: string;
  runs: number;
  lastRanAt?: string;
  vendorRequestId?: string;
};

export function readLipSyncRecord(v: unknown): LipSyncRecord | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (!isStr(o.versionId) || !isStr(o.provider) || !isStr(o.model) || typeof o.runs !== "number") return null;
  return {
    versionId: o.versionId, provider: o.provider, model: o.model, runs: o.runs,
    ...(isStr(o.lastRanAt) ? { lastRanAt: o.lastRanAt } : {}),
    ...(isStr(o.vendorRequestId) ? { vendorRequestId: o.vendorRequestId } : {}),
  };
}
```

`src/lib/dubbing/providers.ts`:
```ts
// D376 — one engine per step for now. A second model or vendor is a new entry plus a picker;
// the node, routes and versions read these and don't change.
export const DUB_ENGINE = { provider: "sarvam", model: "sarvam-dub", modelUsed: "sarvam:dub" } as const;
export const LIP_SYNC_ENGINE = { provider: "fal", model: "lipsync-2-pro", modelUsed: "fal:lipsync-2-pro" } as const;
```

`src/lib/dubbing/constants.ts`:
```ts
/** D374 — the longest clip the node dubs. Generated takes are well under it. */
export const DUB_MAX_SECONDS = 60;
/** D377 — checkpointed wait between status polls. */
export const DUB_POLL_INTERVAL_SECONDS = 10;
/** D377 — a run gives up here, well inside the 50-minute stuck-reservation sweep (0055). */
export const DUB_POLL_TIMEOUT_MS = 12 * 60 * 1000;
/** Signed PUT URLs must outlive the poll timeout plus queueing. */
export const DUBBING_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;
```

`src/lib/dubbing/copy.ts`:
```ts
// Plain words only: no vendor names, no raw errors (user rule).
export const DUBBING_NOT_SET_UP_MESSAGE = "Dubbing isn't set up yet.";
export const DUB_FAILED_MESSAGE = "The dub couldn't be made. Your credits were returned.";
export const DUB_NO_SPEECH_MESSAGE = "This take has no speech we could dub.";
export const DUB_TIMEOUT_MESSAGE = "The dub took too long. Your credits were returned.";
export const LIP_SYNC_FAILED_MESSAGE = "Lip sync couldn't be finished. Your credits were returned.";
```

`src/lib/dubbing/cost.ts`:
```ts
import { USD_TO_INR } from "@/lib/pricing";
import { usdToFinalCredits } from "@/lib/credits/units";

/** Sarvam Dubbing, Starter API rate, per minute of source per target language. */
export const SARVAM_DUB_INR_PER_MIN = 40;
/** sync lipsync-2-pro on fal, listed rate per minute of video. Check fal's model page before launch. */
export const LIP_SYNC_PRO_USD_PER_MIN = 5;

/** Billed per whole second of source, one target language. */
export function computeDubCost(seconds: number): { usd: number } {
  return { usd: ((Math.ceil(seconds) / 60) * SARVAM_DUB_INR_PER_MIN) / USD_TO_INR };
}

export function computeLipSyncCost(seconds: number): { usd: number } {
  return { usd: (seconds / 60) * LIP_SYNC_PRO_USD_PER_MIN };
}

/** The figure on the button IS the reservation (D377): both read these. */
export const dubCredits = (seconds: number) => usdToFinalCredits(computeDubCost(seconds).usd);
export const lipSyncCredits = (seconds: number) => usdToFinalCredits(computeLipSyncCost(seconds).usd);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dubbing/__tests__`
Expected: PASS (2 files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dubbing
git commit -m "feat(dubbing): languages, version shape, engines, cost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sarvam dubbing client

**Files:**
- Create: `src/lib/sarvam/client.ts`
- Test: `src/lib/sarvam/__tests__/client.test.ts`

**Interfaces — Produces:**
- `SARVAM_API_BASE = "https://api.sarvam.ai"`, `class SarvamHttpError extends Error { status: number }`, `class SarvamKeyMissingError`
- `createDubJob(args: { srcLang: string; targetLang: string; jobName?: string }, fetchImpl?): Promise<{ jobId: string; uploadUrl: string }>`
- `uploadDubMedia(uploadUrl: string, body: Buffer, contentType: string, fetchImpl?): Promise<void>`
- `startDubJob(jobId: string, fetchImpl?): Promise<void>`
- `getDubLiveStatus(jobId: string, fetchImpl?): Promise<{ status: SarvamJobStatus; progress: number; stepLabel: string | null; errorMessage: string | null }>`
- `getDubExports(jobId: string, fetchImpl?): Promise<SarvamExport[]>` where `SarvamExport = { exportType: string; targetLanguage: string; status: string; downloadUrl: string | null }`
- `type SarvamJobStatus = "queued" | "in_progress" | "completed" | "failed" | "partial_failure" | "deleted" | "not_started"`

Schemas (from the API reference, 2026-10-15): create → `data.job_id`, `data.upload_url`; start (no body); live-status → `data.{status, progress, current_step_label, error_message}`; export-status → `data.exports[].{export_type, target_language, status, download_url}`. Auth header `api-subscription-key`. Upload needs `x-ms-blob-type: BlockBlob`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createDubJob, uploadDubMedia, startDubJob, getDubLiveStatus, getDubExports, SarvamHttpError } from "../client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => { delete process.env.SARVAM_API_KEY; });

describe("sarvam client", () => {
  it("creates a cloned-voice job for one language and returns its id + upload url", async () => {
    process.env.SARVAM_API_KEY = "k";
    const fetchImpl = vi.fn(async () => json({ status: "success", message: "ok", data: { job_id: "dub_1", upload_url: "https://blob/up" } }));
    const out = await createDubJob({ srcLang: "en-IN", targetLang: "hi-IN", jobName: "gen-1" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ jobId: "dub_1", uploadUrl: "https://blob/up" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/dubbing/jobs");
    expect((init.headers as Record<string, string>)["api-subscription-key"]).toBe("k");
    expect(JSON.parse(String(init.body))).toEqual({
      src_lang: "en-IN", target_langs: ["hi-IN"], voice_cloning: true, num_speakers: 1,
      disable_watermark: true, editor_flow: false, job_name: "gen-1",
    });
  });

  it("uploads raw bytes as a block blob without the api key", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    await uploadDubMedia("https://blob/up", Buffer.from([1]), "video/mp4", fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "video/mp4", "x-ms-blob-type": "BlockBlob" });
  });

  it("starts the job", async () => {
    process.env.SARVAM_API_KEY = "k";
    const fetchImpl = vi.fn(async () => json({ status: "success", message: "ok", data: { job_id: "dub_1", status: "processing" } }));
    await startDubJob("dub_1", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.sarvam.ai/dubbing/jobs/dub_1/start");
  });

  it("reads live status and export entries", async () => {
    process.env.SARVAM_API_KEY = "k";
    const live = vi.fn(async () => json({ status: "success", message: "", data: { job_id: "dub_1", status: "in_progress", progress: 40, current_step_label: "Translating", error_message: null } }));
    expect(await getDubLiveStatus("dub_1", live as unknown as typeof fetch)).toEqual({ status: "in_progress", progress: 40, stepLabel: "Translating", errorMessage: null });
    const exp = vi.fn(async () => json({ status: "success", message: "", data: { exports: [{ id: "e1", export_type: "video", target_language: "hi-IN", status: "completed", is_stale: false, download_url: "https://dl/v" }] } }));
    expect(await getDubExports("dub_1", exp as unknown as typeof fetch)).toEqual([{ exportType: "video", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/v" }]);
    expect(exp.mock.calls[0][0]).toBe("https://api.sarvam.ai/dubbing/jobs/dub_1/export-status?limit=20");
  });

  it("throws SarvamHttpError with the status on a non-2xx, and on an unexpected body", async () => {
    process.env.SARVAM_API_KEY = "k";
    const bad = vi.fn(async () => json({ error: { message: "nope" } }, 422));
    await expect(startDubJob("dub_1", bad as unknown as typeof fetch)).rejects.toMatchObject({ name: "SarvamHttpError", status: 422 });
    const weird = vi.fn(async () => json({ data: { nothing: true } }));
    await expect(getDubLiveStatus("dub_1", weird as unknown as typeof fetch)).rejects.toThrow(/unexpected/i);
  });

  it("refuses to run without a key", async () => {
    await expect(startDubJob("x", vi.fn() as unknown as typeof fetch)).rejects.toThrow("SARVAM_API_KEY is not set");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/sarvam/__tests__/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// D376 — Sarvam Dubbing REST client. No `server-only`: the Trigger task imports it.
// Shapes per the API reference (docs.sarvam.ai/api-reference/creative-agents-dubbing, 2026-10-15),
// parsed through zod so a changed field fails loudly instead of reading as "not done yet".
import { z } from "zod";

export const SARVAM_API_BASE = "https://api.sarvam.ai";

export class SarvamKeyMissingError extends Error {
  constructor() {
    super("SARVAM_API_KEY is not set");
    this.name = "SarvamKeyMissingError";
  }
}

export class SarvamHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what: string) {
    super(`Sarvam ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "SarvamHttpError";
    this.status = status;
  }
}

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new SarvamKeyMissingError();
  return k;
}

async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T>, what: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${SARVAM_API_BASE}${path}`, {
    ...init,
    headers: { "api-subscription-key": key(), ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) throw new SarvamHttpError(res.status, await res.text().catch(() => ""), what);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Sarvam ${what} returned an unexpected body: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const CreateSchema = z.object({ data: z.object({ job_id: z.string(), upload_url: z.string().nullable() }) });
const StartSchema = z.object({ data: z.object({ job_id: z.string() }) });
const JOB_STATUSES = ["not_started", "queued", "in_progress", "completed", "failed", "partial_failure", "deleted"] as const;
export type SarvamJobStatus = (typeof JOB_STATUSES)[number];
const LiveSchema = z.object({
  data: z.object({
    status: z.enum(JOB_STATUSES),
    progress: z.number().default(0),
    current_step_label: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
  }),
});
const ExportsSchema = z.object({
  data: z.object({
    exports: z.array(z.object({
      export_type: z.string(),
      target_language: z.string(),
      status: z.string(),
      download_url: z.string().nullable().optional(),
    })),
  }),
});

export type SarvamExport = { exportType: string; targetLanguage: string; status: string; downloadUrl: string | null };

export async function createDubJob(
  args: { srcLang: string; targetLang: string; jobName?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ jobId: string; uploadUrl: string }> {
  const body = {
    src_lang: args.srcLang,
    target_langs: [args.targetLang],
    voice_cloning: true,
    num_speakers: 1,
    disable_watermark: true,
    // false: exports run automatically after TTS (true is the dashboard editor, at double rate).
    editor_flow: false,
    ...(args.jobName ? { job_name: args.jobName } : {}),
  };
  const out = await call("/dubbing/jobs", { method: "POST", body: JSON.stringify(body) }, CreateSchema, "create job", fetchImpl);
  if (!out.data.upload_url) throw new Error("Sarvam create job returned no upload URL");
  return { jobId: out.data.job_id, uploadUrl: out.data.upload_url };
}

/** The signed upload URL is a blob store's; it takes no api key. */
export async function uploadDubMedia(uploadUrl: string, body: Buffer, contentType: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "x-ms-blob-type": "BlockBlob" },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new SarvamHttpError(res.status, await res.text().catch(() => ""), "upload");
}

export async function startDubJob(jobId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/start`, { method: "POST" }, StartSchema, "start job", fetchImpl);
}

export async function getDubLiveStatus(jobId: string, fetchImpl: typeof fetch = fetch) {
  const out = await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/live-status`, { method: "GET" }, LiveSchema, "live status", fetchImpl);
  return {
    status: out.data.status,
    progress: out.data.progress,
    stepLabel: out.data.current_step_label ?? null,
    errorMessage: out.data.error_message ?? null,
  };
}

export async function getDubExports(jobId: string, fetchImpl: typeof fetch = fetch): Promise<SarvamExport[]> {
  const out = await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/export-status?limit=20`, { method: "GET" }, ExportsSchema, "export status", fetchImpl);
  return out.data.exports.map((e) => ({
    exportType: e.export_type,
    targetLanguage: e.target_language,
    status: e.status,
    downloadUrl: e.download_url ?? null,
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/sarvam/__tests__/client.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sarvam
git commit -m "feat(dubbing): Sarvam dubbing client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: fal lip-sync client

**Files:**
- Create: `src/lib/fal/client.ts`
- Test: `src/lib/fal/__tests__/client.test.ts`

**Interfaces — Produces:**
- `FAL_QUEUE_BASE = "https://queue.fal.run"`, `FAL_LIPSYNC_ENDPOINT = "fal-ai/sync-lipsync/v2"`, `class FalHttpError extends Error { status: number }`
- `submitLipSync(args: { videoUrl: string; audioUrl: string; model: string }, fetchImpl?): Promise<{ requestId: string; statusUrl: string; responseUrl: string }>`
- `getFalStatus(statusUrl: string, fetchImpl?): Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED">`
- `getLipSyncResult(responseUrl: string, fetchImpl?): Promise<{ videoUrl: string }>`

fal queue REST: `POST https://queue.fal.run/{endpoint}` with `Authorization: Key <FAL_KEY>` → `{ request_id, status_url, response_url }`; `GET status_url` → `{ status }`; `GET response_url` → the model output `{ video: { url } }` (a failed request answers non-2xx here).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { submitLipSync, getFalStatus, getLipSyncResult } from "../client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { delete process.env.FAL_KEY; });

describe("fal lip-sync client", () => {
  it("submits video + audio with the model and cut_off sync", async () => {
    process.env.FAL_KEY = "fk";
    const fetchImpl = vi.fn(async () => json({ request_id: "r1", status_url: "https://q/s", response_url: "https://q/r" }));
    const out = await submitLipSync({ videoUrl: "https://v.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ requestId: "r1", statusUrl: "https://q/s", responseUrl: "https://q/r" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://queue.fal.run/fal-ai/sync-lipsync/v2");
    expect(init.headers).toEqual({ Authorization: "Key fk", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ model: "lipsync-2-pro", video_url: "https://v.mp4", audio_url: "https://a.mp3", sync_mode: "cut_off" });
  });

  it("reads status and the result video url", async () => {
    process.env.FAL_KEY = "fk";
    const s = vi.fn(async () => json({ status: "IN_PROGRESS" }));
    expect(await getFalStatus("https://q/s", s as unknown as typeof fetch)).toBe("IN_PROGRESS");
    const r = vi.fn(async () => json({ video: { url: "https://out.mp4" } }));
    expect(await getLipSyncResult("https://q/r", r as unknown as typeof fetch)).toEqual({ videoUrl: "https://out.mp4" });
  });

  it("throws FalHttpError on a failed result", async () => {
    process.env.FAL_KEY = "fk";
    const r = vi.fn(async () => json({ detail: "face not found" }, 422));
    await expect(getLipSyncResult("https://q/r", r as unknown as typeof fetch)).rejects.toMatchObject({ name: "FalHttpError", status: 422 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/fal/__tests__/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// D376 — fal queue REST client for sync lipsync v2. No `server-only`: the Trigger task imports it.
import { z } from "zod";

export const FAL_QUEUE_BASE = "https://queue.fal.run";
export const FAL_LIPSYNC_ENDPOINT = "fal-ai/sync-lipsync/v2";

export class FalHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what: string) {
    super(`fal ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "FalHttpError";
    this.status = status;
  }
}

function key(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY is not set");
  return k;
}

async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>, what: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { ...init, headers: { Authorization: `Key ${key()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  if (!res.ok) throw new FalHttpError(res.status, await res.text().catch(() => ""), what);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`fal ${what} returned an unexpected body: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const SubmitSchema = z.object({ request_id: z.string(), status_url: z.string(), response_url: z.string() });
const StatusSchema = z.object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]) });
const ResultSchema = z.object({ video: z.object({ url: z.string() }) });

export async function submitLipSync(
  args: { videoUrl: string; audioUrl: string; model: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const body = { model: args.model, video_url: args.videoUrl, audio_url: args.audioUrl, sync_mode: "cut_off" };
  const out = await call(`${FAL_QUEUE_BASE}/${FAL_LIPSYNC_ENDPOINT}`, { method: "POST", body: JSON.stringify(body) }, SubmitSchema, "lip sync submit", fetchImpl);
  return { requestId: out.request_id, statusUrl: out.status_url, responseUrl: out.response_url };
}

export async function getFalStatus(statusUrl: string, fetchImpl: typeof fetch = fetch) {
  return (await call(statusUrl, { method: "GET" }, StatusSchema, "status", fetchImpl)).status;
}

export async function getLipSyncResult(responseUrl: string, fetchImpl: typeof fetch = fetch): Promise<{ videoUrl: string }> {
  return { videoUrl: (await call(responseUrl, { method: "GET" }, ResultSchema, "lip sync result", fetchImpl)).video.url };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/fal/__tests__/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fal
git commit -m "feat(dubbing): fal lip-sync client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dub and lip-sync runners (pay once, poll in place)

**Files:**
- Create: `src/lib/dubbing/poll.ts`, `src/lib/dubbing/run-dub.ts`, `src/lib/dubbing/run-lip-sync.ts`
- Test: `src/lib/dubbing/__tests__/run-dub.test.ts`, `src/lib/dubbing/__tests__/run-lip-sync.test.ts`

**Interfaces:**
- Consumes: Task 1 constants/copy; Task 2/3 client signatures (injected, not imported, so tests need no fetch).
- Produces:
  - `class DubbingFinalError extends Error { userMessage: string }` (in `poll.ts`)
  - `retryInPlace<T>(fn: () => Promise<T>, sleep: (s: number) => Promise<void>, attempts?: number): Promise<T>`
  - `type DubRunPayload = { generationId: string; sourceUrl: string; targetLang: string; dubbedPutUrl: string; dubbedAudioPutUrl: string }`
  - `type DubRunDeps = { fetchBytes; createJob; upload; start; liveStatus; exports; putBytes; sleep; now }` (shapes below)
  - `runDub(p: DubRunPayload, d: DubRunDeps): Promise<{ vendorJobId: string }>`
  - `type LipSyncRunPayload = { videoUrl: string; audioUrl: string; model: string; lipSyncedPutUrl: string }`
  - `type LipSyncRunDeps = { submit; status; result; fetchBytes; putBytes; sleep; now }`
  - `runLipSync(p: LipSyncRunPayload, d: LipSyncRunDeps): Promise<{ vendorRequestId: string }>`

- [ ] **Step 1: Write the failing tests**

`src/lib/dubbing/__tests__/run-dub.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runDub, type DubRunDeps } from "../run-dub";
import { DubbingFinalError } from "../poll";
import { DUB_FAILED_MESSAGE, DUB_NO_SPEECH_MESSAGE, DUB_TIMEOUT_MESSAGE } from "../copy";

const P = { generationId: "g1", sourceUrl: "https://src.mp4", targetLang: "hi-IN", dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a" };
const DONE = [
  { exportType: "video", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/v" },
  { exportType: "mp3", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/a" },
];

function deps(over: Partial<DubRunDeps> = {}): DubRunDeps {
  let t = 0;
  return {
    fetchBytes: vi.fn(async (url: string) => Buffer.from(url)),
    createJob: vi.fn(async () => ({ jobId: "dub_1", uploadUrl: "https://blob/up" })),
    upload: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    liveStatus: vi.fn(async () => ({ status: "completed" as const, progress: 100, stepLabel: null, errorMessage: null })),
    exports: vi.fn(async () => DONE),
    putBytes: vi.fn(async () => undefined),
    sleep: vi.fn(async (s: number) => { t += s * 1000; }),
    now: () => t,
    ...over,
  };
}

describe("runDub", () => {
  it("creates, uploads and starts once, then stores the dubbed video and mp3", async () => {
    const d = deps();
    expect(await runDub(P, d)).toEqual({ vendorJobId: "dub_1" });
    expect(d.createJob).toHaveBeenCalledWith({ srcLang: "en-IN", targetLang: "hi-IN", jobName: "g1" });
    expect(d.upload).toHaveBeenCalledWith("https://blob/up", Buffer.from("https://src.mp4"), "video/mp4");
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.putBytes).toHaveBeenCalledWith("https://put/v", Buffer.from("https://dl/v"), "video/mp4");
    expect(d.putBytes).toHaveBeenCalledWith("https://put/a", Buffer.from("https://dl/a"), "audio/mpeg");
  });

  it("retries a flaky status poll in place and never starts a second job", async () => {
    const liveStatus = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "in_progress", progress: 50, stepLabel: null, errorMessage: null })
      .mockResolvedValue({ status: "completed", progress: 100, stepLabel: null, errorMessage: null });
    const d = deps({ liveStatus });
    await runDub(P, d);
    expect(d.createJob).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenCalledTimes(1);
  });

  it("waits for both exports to finish", async () => {
    const exports = vi.fn()
      .mockResolvedValueOnce([{ ...DONE[0] }, { ...DONE[1], status: "in_progress", downloadUrl: null }])
      .mockResolvedValue(DONE);
    const d = deps({ exports });
    await runDub(P, d);
    expect(exports).toHaveBeenCalledTimes(2);
  });

  it("fails for good with plain copy when the job fails", async () => {
    const d = deps({ liveStatus: vi.fn(async () => ({ status: "failed" as const, progress: 10, stepLabel: null, errorMessage: "No speech detected in audio" })) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_NO_SPEECH_MESSAGE }));
    const d2 = deps({ liveStatus: vi.fn(async () => ({ status: "failed" as const, progress: 10, stepLabel: null, errorMessage: "boom" })) });
    await expect(runDub(P, d2)).rejects.toBeInstanceOf(DubbingFinalError);
    await expect(runDub(P, deps({ liveStatus: d2.liveStatus }))).rejects.toEqual(expect.objectContaining({ userMessage: DUB_FAILED_MESSAGE }));
  });

  it("gives up after the poll timeout", async () => {
    const d = deps({ liveStatus: vi.fn(async () => ({ status: "in_progress" as const, progress: 1, stepLabel: null, errorMessage: null })) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_TIMEOUT_MESSAGE }));
    expect(d.start).toHaveBeenCalledTimes(1);
  });
});
```

`src/lib/dubbing/__tests__/run-lip-sync.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runLipSync, type LipSyncRunDeps } from "../run-lip-sync";
import { LIP_SYNC_FAILED_MESSAGE, DUB_TIMEOUT_MESSAGE } from "../copy";
import { FalHttpError } from "@/lib/fal/client";

const P = { videoUrl: "https://o.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro", lipSyncedPutUrl: "https://put/l" };

function deps(over: Partial<LipSyncRunDeps> = {}): LipSyncRunDeps {
  let t = 0;
  return {
    submit: vi.fn(async () => ({ requestId: "r1", statusUrl: "https://q/s", responseUrl: "https://q/r" })),
    status: vi.fn(async () => "COMPLETED" as const),
    result: vi.fn(async () => ({ videoUrl: "https://out.mp4" })),
    fetchBytes: vi.fn(async (u: string) => Buffer.from(u)),
    putBytes: vi.fn(async () => undefined),
    sleep: vi.fn(async (s: number) => { t += s * 1000; }),
    now: () => t,
    ...over,
  };
}

describe("runLipSync", () => {
  it("submits once and stores the result", async () => {
    const d = deps({ status: vi.fn().mockResolvedValueOnce("IN_QUEUE").mockRejectedValueOnce(new Error("net")).mockResolvedValue("COMPLETED") });
    expect(await runLipSync(P, d)).toEqual({ vendorRequestId: "r1" });
    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(d.submit).toHaveBeenCalledWith({ videoUrl: "https://o.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro" });
    expect(d.putBytes).toHaveBeenCalledWith("https://put/l", Buffer.from("https://out.mp4"), "video/mp4");
  });

  it("a rejected result is final, with plain copy", async () => {
    const d = deps({ result: vi.fn(async () => { throw new FalHttpError(422, "face", "result"); }) });
    await expect(runLipSync(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: LIP_SYNC_FAILED_MESSAGE }));
    expect(d.submit).toHaveBeenCalledTimes(1);
  });

  it("times out", async () => {
    const d = deps({ status: vi.fn(async () => "IN_PROGRESS" as const) });
    await expect(runLipSync(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_TIMEOUT_MESSAGE }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/dubbing/__tests__/run-dub.test.ts src/lib/dubbing/__tests__/run-lip-sync.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/dubbing/poll.ts`:
```ts
// D377 — polling helpers shared by the dub and lip-sync runners. Everything after the paid call
// retries HERE, in place, never by re-running the task (that would create a second vendor job).

/** A failure that is final: the task reports `failed` with `userMessage`, credits are refunded. */
export class DubbingFinalError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, detail?: string) {
    super(detail ? `${userMessage} (${detail})` : userMessage);
    this.name = "DubbingFinalError";
    this.userMessage = userMessage;
  }
}

const RETRY_WAIT_SECONDS = 5;

/** Run `fn`, retrying a thrown error up to `attempts` times with a short wait between. A
 *  DubbingFinalError is never retried. */
export async function retryInPlace<T>(fn: () => Promise<T>, sleep: (s: number) => Promise<void>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DubbingFinalError) throw e;
      last = e;
      if (i < attempts - 1) await sleep(RETRY_WAIT_SECONDS);
    }
  }
  throw last;
}
```

`src/lib/dubbing/run-dub.ts`:
```ts
// D377 — the video-dub task's steps, dependencies injected so tests need no network.
// create → upload → start happen once; status, exports and downloads retry in place.
import { DUB_SOURCE_LANGUAGE } from "./types";
import { DUB_POLL_INTERVAL_SECONDS, DUB_POLL_TIMEOUT_MS } from "./constants";
import { DUB_FAILED_MESSAGE, DUB_NO_SPEECH_MESSAGE, DUB_TIMEOUT_MESSAGE } from "./copy";
import { DubbingFinalError, retryInPlace } from "./poll";
import type { SarvamExport, SarvamJobStatus } from "@/lib/sarvam/client";

export type DubRunPayload = {
  generationId: string;
  sourceUrl: string;
  targetLang: string;
  dubbedPutUrl: string;
  dubbedAudioPutUrl: string;
};

export type DubRunDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  createJob: (a: { srcLang: string; targetLang: string; jobName?: string }) => Promise<{ jobId: string; uploadUrl: string }>;
  upload: (uploadUrl: string, body: Buffer, contentType: string) => Promise<void>;
  start: (jobId: string) => Promise<void>;
  liveStatus: (jobId: string) => Promise<{ status: SarvamJobStatus; progress: number; stepLabel: string | null; errorMessage: string | null }>;
  exports: (jobId: string) => Promise<SarvamExport[]>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
};

const FAILED: SarvamJobStatus[] = ["failed", "partial_failure", "deleted"];

function failureCopy(vendorMessage: string | null): string {
  return vendorMessage && /speech|audio|silent/i.test(vendorMessage) ? DUB_NO_SPEECH_MESSAGE : DUB_FAILED_MESSAGE;
}

export async function runDub(p: DubRunPayload, d: DubRunDeps): Promise<{ vendorJobId: string }> {
  const deadline = d.now() + DUB_POLL_TIMEOUT_MS;
  const source = await d.fetchBytes(p.sourceUrl);

  // The paid part. Each runs once: a failure here fails the run (nothing has been charged yet
  // that a retry would recover, and a retry after `start` would pay twice).
  const { jobId, uploadUrl } = await d.createJob({ srcLang: DUB_SOURCE_LANGUAGE, targetLang: p.targetLang, jobName: p.generationId });
  await d.upload(uploadUrl, source, "video/mp4");
  await d.start(jobId);

  // 1. The job.
  for (;;) {
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `job ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
    const live = await retryInPlace(() => d.liveStatus(jobId), d.sleep);
    if (FAILED.includes(live.status)) throw new DubbingFinalError(failureCopy(live.errorMessage), live.errorMessage ?? live.status);
    if (live.status === "completed") break;
  }

  // 2. Its exports finish one by one, after the job: wait for the video and the mp3.
  let video: SarvamExport | undefined;
  let audio: SarvamExport | undefined;
  for (;;) {
    const all = (await retryInPlace(() => d.exports(jobId), d.sleep)).filter((e) => e.targetLanguage === p.targetLang);
    video = all.find((e) => e.exportType === "video");
    audio = all.find((e) => e.exportType === "mp3");
    if ([video, audio].some((e) => e?.status === "failed")) throw new DubbingFinalError(DUB_FAILED_MESSAGE, "export failed");
    if (video?.status === "completed" && video.downloadUrl && audio?.status === "completed" && audio.downloadUrl) break;
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `exports of ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
  }

  const [videoBytes, audioBytes] = await Promise.all([
    retryInPlace(() => d.fetchBytes(video!.downloadUrl!), d.sleep),
    retryInPlace(() => d.fetchBytes(audio!.downloadUrl!), d.sleep),
  ]);
  await retryInPlace(() => d.putBytes(p.dubbedPutUrl, videoBytes, "video/mp4"), d.sleep);
  await retryInPlace(() => d.putBytes(p.dubbedAudioPutUrl, audioBytes, "audio/mpeg"), d.sleep);
  return { vendorJobId: jobId };
}
```

`src/lib/dubbing/run-lip-sync.ts`:
```ts
// D377 — the video-lip-sync task's steps. Submit happens once; status, result and downloads
// retry in place. A non-2xx result from the vendor is final (the request already ran and was paid).
import { DUB_POLL_INTERVAL_SECONDS, DUB_POLL_TIMEOUT_MS } from "./constants";
import { DUB_TIMEOUT_MESSAGE, LIP_SYNC_FAILED_MESSAGE } from "./copy";
import { DubbingFinalError, retryInPlace } from "./poll";
import { FalHttpError } from "@/lib/fal/client";

export type LipSyncRunPayload = { videoUrl: string; audioUrl: string; model: string; lipSyncedPutUrl: string };

export type LipSyncRunDeps = {
  submit: (a: { videoUrl: string; audioUrl: string; model: string }) => Promise<{ requestId: string; statusUrl: string; responseUrl: string }>;
  status: (statusUrl: string) => Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED">;
  result: (responseUrl: string) => Promise<{ videoUrl: string }>;
  fetchBytes: (url: string) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
};

export async function runLipSync(p: LipSyncRunPayload, d: LipSyncRunDeps): Promise<{ vendorRequestId: string }> {
  const deadline = d.now() + DUB_POLL_TIMEOUT_MS;
  const req = await d.submit({ videoUrl: p.videoUrl, audioUrl: p.audioUrl, model: p.model });

  for (;;) {
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `request ${req.requestId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
    if ((await retryInPlace(() => d.status(req.statusUrl), d.sleep)) === "COMPLETED") break;
  }

  const out = await retryInPlace(async () => {
    try {
      return await d.result(req.responseUrl);
    } catch (e) {
      // 4xx on the result = the request ran and failed (no face, bad media). Final.
      if (e instanceof FalHttpError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw new DubbingFinalError(LIP_SYNC_FAILED_MESSAGE, e.message);
      }
      throw e;
    }
  }, d.sleep);

  const bytes = await retryInPlace(() => d.fetchBytes(out.videoUrl), d.sleep);
  await retryInPlace(() => d.putBytes(p.lipSyncedPutUrl, bytes, "video/mp4"), d.sleep);
  return { vendorRequestId: req.requestId };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/dubbing/__tests__`
Expected: PASS (all dubbing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dubbing
git commit -m "feat(dubbing): dub and lip-sync runners that pay once and poll in place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Storage paths and signed uploads

**Files:**
- Modify: `src/lib/storage/paths.ts` (after `pathForVideoGenVoice`, ~line 117), `src/lib/storage/index.ts` (import list + after `signRevoicedVideoUrl`, ~line 201)
- Test: `src/lib/storage/paths.test.ts` (append)

**Interfaces — Produces:**
- `pathForDubbing(args: { clientId; canvasId; nodeId; generationId; variant: "dubbed" | "dubbed-audio" | "lip-synced" }): string`
- `signDubbingUploads(args: { nodeId; generationId }): Promise<{ dubbed: { putUrl: string; url: string }; dubbedAudio: { putUrl: string; url: string } }>`
- `signLipSyncedUpload(args: { nodeId; generationId }): Promise<{ putUrl: string; url: string }>`

- [ ] **Step 1: Write the failing test** (append to `src/lib/storage/paths.test.ts`, adding `pathForDubbing` to its import from `./paths`)

```ts
describe("pathForDubbing", () => {
  it("keeps a dub's files under the node, mp3 for the audio track", () => {
    const base = { clientId: "c", canvasId: "cv", nodeId: "n", generationId: "g" };
    expect(pathForDubbing({ ...base, variant: "dubbed" })).toBe("clients/c/canvases/cv/nodes/n/dubbing/g-dubbed.mp4");
    expect(pathForDubbing({ ...base, variant: "dubbed-audio" })).toBe("clients/c/canvases/cv/nodes/n/dubbing/g-dubbed-audio.mp3");
    expect(pathForDubbing({ ...base, variant: "lip-synced" })).toBe("clients/c/canvases/cv/nodes/n/dubbing/g-lip-synced.mp4");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `pathForDubbing` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/storage/paths.ts` after `pathForVideoGenVoice`:
```ts
// D377 — a Dubbing node's stored files: the dubbed video, its audio track (lip sync's input) and
// the lip-synced video. Named by the generation that made them.
export function pathForDubbing(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  generationId: string;
  variant: "dubbed" | "dubbed-audio" | "lip-synced";
}): string {
  const ext = args.variant === "dubbed-audio" ? "mp3" : "mp4";
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/dubbing/${args.generationId}-${args.variant}.${ext}`;
}
```

In `src/lib/storage/index.ts`: add `pathForDubbing` to the `./paths` import, add `import { DUBBING_UPLOAD_EXPIRY_MS } from "@/lib/dubbing/constants";`, and after `signRevoicedVideoUrl`:
```ts
// D377 — the dubbing tasks have no GCS credentials; the routes sign their uploads up front.
async function signDubbingPut(nodeId: string, generationId: string, variant: "dubbed" | "dubbed-audio" | "lip-synced") {
  const { clientId, canvasId } = await resolveOwnership(nodeId);
  const path = pathForDubbing({ clientId, canvasId, nodeId, generationId, variant });
  const contentType = variant === "dubbed-audio" ? "audio/mpeg" : "video/mp4";
  return { putUrl: await _signPutUrl(path, contentType, DUBBING_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}

export async function signDubbingUploads(args: { nodeId: string; generationId: string }) {
  const [dubbed, dubbedAudio] = await Promise.all([
    signDubbingPut(args.nodeId, args.generationId, "dubbed"),
    signDubbingPut(args.nodeId, args.generationId, "dubbed-audio"),
  ]);
  return { dubbed, dubbedAudio };
}

export async function signLipSyncedUpload(args: { nodeId: string; generationId: string }) {
  return signDubbingPut(args.nodeId, args.generationId, "lip-synced");
}
```
(Two parallel `resolveOwnership` reads are acceptable here, but if `resolveOwnership` is cached per request it collapses to one; do not add a third.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/storage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage
git commit -m "feat(dubbing): storage paths and signed uploads for dubs and lip syncs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Trigger tasks `video-dub` and `video-lip-sync`

**Files:**
- Create: `trigger/video-dub.ts`, `trigger/video-lip-sync.ts`
- Read first: `.claude/skills/` Trigger skill note in AGENTS.md (only `trigger-authoring-chat-agent` is installed; it does not cover plain tasks — follow `trigger/video-voice-change.ts`).

**Interfaces:**
- Consumes: `runDub`, `runLipSync`, `DubbingFinalError` (Task 4); clients (Tasks 2–3); `fetchBytes`, `putBytes` from `@/lib/voice-change/http`; `postGenerationWebhook`, `postGenerationWebhookSafely`, `assertWebhookConfig`.
- Produces (task ids and payloads the routes trigger; webhook bodies `completeGeneration` reads in Task 7):
  - `"video-dub"` payload `VideoDubTaskPayload = DubRunPayload & { dubbedUrl: string; dubbedAudioUrl: string; durationSeconds: number }`
    → webhook `{ generationId, status: "succeeded", kind: "dub", stored: true, dubbedUrl, dubbedAudioUrl, durationSeconds, vendorJobId }`
  - `"video-lip-sync"` payload `VideoLipSyncTaskPayload = LipSyncRunPayload & { generationId: string; lipSyncedUrl: string; durationSeconds: number }`
    → webhook `{ generationId, status: "succeeded", kind: "lipsync", stored: true, videoUrl: lipSyncedUrl, durationSeconds, vendorRequestId }`
  - failure → `{ generationId, status: "failed", error: <user copy> }`

No unit tests (thin wiring over tested runners, same as `video-voice-change.ts`); verified by typecheck here and end to end in Task 13.

- [ ] **Step 1: Implement `trigger/video-dub.ts`**

```ts
import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runDub, type DubRunPayload } from "@/lib/dubbing/run-dub";
import { DubbingFinalError } from "@/lib/dubbing/poll";
import { DUB_FAILED_MESSAGE } from "@/lib/dubbing/copy";
import { createDubJob, uploadDubMedia, startDubJob, getDubLiveStatus, getDubExports } from "@/lib/sarvam/client";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

export type VideoDubTaskPayload = DubRunPayload & { dubbedUrl: string; dubbedAudioUrl: string; durationSeconds: number };

// The dub is stored but its success report could not be delivered: not `failed` (that would
// refund a stored, paid result); the stuck sweep settles it. Same as video-voice-change.
class DeliveryFailedError extends AbortTaskRunError {}

// D377 — dubs one take. The route resolved the source, reserved credits and signed both uploads.
// maxAttempts 1: the vendor job is paid once; polls retry in place inside runDub. wait.for
// checkpoints, so the polling isn't billed compute and doesn't count against maxDuration.
export const videoDubTask = task({
  id: "video-dub",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  onFailure: async ({ payload, error }) => {
    if (error instanceof DeliveryFailedError) return;
    const message = error instanceof DubbingFinalError ? error.userMessage : DUB_FAILED_MESSAGE;
    await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: message }, "dub failure");
  },
  run: async (payload: VideoDubTaskPayload) => {
    assertWebhookConfig();
    logger.info("Dubbing", { generationId: payload.generationId, targetLang: payload.targetLang });
    const { vendorJobId } = await runDub(payload, {
      fetchBytes: (url) => fetchBytes(url),
      createJob: (a) => createDubJob(a),
      upload: (url, body, type) => uploadDubMedia(url, body, type),
      start: (id) => startDubJob(id),
      liveStatus: (id) => getDubLiveStatus(id),
      exports: (id) => getDubExports(id),
      putBytes,
      sleep: (seconds) => wait.for({ seconds }),
      now: () => Date.now(),
    });
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        kind: "dub",
        stored: true,
        dubbedUrl: payload.dubbedUrl,
        dubbedAudioUrl: payload.dubbedAudioUrl,
        durationSeconds: payload.durationSeconds,
        vendorJobId,
      });
    } catch (e) {
      throw new DeliveryFailedError(`Dub stored but the webhook was unreachable — dubbedUrl=${payload.dubbedUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
```

- [ ] **Step 2: Implement `trigger/video-lip-sync.ts`**

```ts
import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runLipSync, type LipSyncRunPayload } from "@/lib/dubbing/run-lip-sync";
import { DubbingFinalError } from "@/lib/dubbing/poll";
import { LIP_SYNC_FAILED_MESSAGE } from "@/lib/dubbing/copy";
import { submitLipSync, getFalStatus, getLipSyncResult } from "@/lib/fal/client";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

export type VideoLipSyncTaskPayload = LipSyncRunPayload & { generationId: string; lipSyncedUrl: string; durationSeconds: number };

class DeliveryFailedError extends AbortTaskRunError {}

// D377 — lip-syncs a dub's original video to its dubbed audio. Paid once; see video-dub.ts.
export const videoLipSyncTask = task({
  id: "video-lip-sync",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  onFailure: async ({ payload, error }) => {
    if (error instanceof DeliveryFailedError) return;
    const message = error instanceof DubbingFinalError ? error.userMessage : LIP_SYNC_FAILED_MESSAGE;
    await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: message }, "lip sync failure");
  },
  run: async (payload: VideoLipSyncTaskPayload) => {
    assertWebhookConfig();
    logger.info("Lip syncing", { generationId: payload.generationId });
    const { vendorRequestId } = await runLipSync(payload, {
      submit: (a) => submitLipSync(a),
      status: (url) => getFalStatus(url),
      result: (url) => getLipSyncResult(url),
      fetchBytes: (url) => fetchBytes(url),
      putBytes,
      sleep: (seconds) => wait.for({ seconds }),
      now: () => Date.now(),
    });
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        kind: "lipsync",
        stored: true,
        videoUrl: payload.lipSyncedUrl,
        durationSeconds: payload.durationSeconds,
        vendorRequestId,
      });
    } catch (e) {
      throw new DeliveryFailedError(`Lip sync stored but the webhook was unreachable — videoUrl=${payload.lipSyncedUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
```

Note: `onFailure` sees the error the run threw. If Trigger wraps it so `instanceof DubbingFinalError` is false, fall back to checking `(error as { name?: string }).name === "DubbingFinalError"` and reading `userMessage`; verify in Task 13's end-to-end run.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors in `trigger/video-dub.ts` / `trigger/video-lip-sync.ts`.

- [ ] **Step 4: Commit**

```bash
git add trigger/video-dub.ts trigger/video-lip-sync.ts
git commit -m "feat(dubbing): video-dub and video-lip-sync background tasks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Completion, version update and per-version credit sums

**Files:**
- Create: `src/lib/dubbing/complete.ts`
- Modify: `src/lib/db/types.ts:133` (generation type), `src/lib/db/versions.ts` (new helper after `updateVersionOutput`), `src/lib/db/generations.ts:15-34` (sum), `src/lib/generations/complete.ts` (input union + dispatch, before `if (input.kind === "image")`)
- Test: `src/lib/dubbing/__tests__/complete.test.ts`, `src/lib/db/__tests__/credits-by-version.test.ts`

**Interfaces:**
- Consumes: `readDubRecord`, `readLipSyncRecord`, `readDubbingOutput`, `DubbingOutput`, `computeDubCost`, `computeLipSyncCost` (Task 1); webhook bodies (Task 6).
- Produces:
  - `GenerationRow["type"]`: `"image" | "video" | "prompt" | "voice" | "dub" | "lipsync"`
  - `updateVersionOutputAndInputs(versionId: string, output: unknown, inputsUsed: Record<string, unknown>): Promise<void>`
  - `type DubSucceeded = { generationId; status: "succeeded"; kind: "dub"; stored: true; dubbedUrl; dubbedAudioUrl; durationSeconds; vendorJobId }`
  - `type LipSyncSucceeded = { generationId; status: "succeeded"; kind: "lipsync"; stored: true; videoUrl; durationSeconds; vendorRequestId }`
  - `completeDubGeneration(nodeId: string, generation: GenerationRow, input: DubSucceeded, deps?): Promise<void>`
  - `completeLipSyncGeneration(nodeId: string, generation: GenerationRow, input: LipSyncSucceeded, deps?): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/lib/dubbing/__tests__/complete.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { completeDubGeneration, completeLipSyncGeneration, type CompleteDeps } from "../complete";
import { dubCredits, lipSyncCredits, computeDubCost, computeLipSyncCost } from "../cost";

const OWN = (p: string) => `https://storage.googleapis.com/bucket/${p}`;
const DUB = { sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: OWN("src.mp4"), srcLang: "en-IN", targetLang: "hi-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" };
const gen = (over: Record<string, unknown> = {}) => ({ id: "g1", org_id: "org", user_id: "u", node_id: "n1", type: "dub", model_used: "sarvam:dub", inputs_snapshot: { dub: DUB }, params_snapshot: {}, status: "running", ...over }) as never;

let deps: CompleteDeps;
beforeEach(() => {
  deps = {
    insertVersion: vi.fn(async () => ({ id: "ver-1" })),
    setActiveVersion: vi.fn(async () => undefined),
    getVersionById: vi.fn(),
    updateVersionOutputAndInputs: vi.fn(async () => undefined),
    settleGeneration: vi.fn(async () => undefined),
    succeedGeneration: vi.fn(async () => undefined),
    failAndRefund: vi.fn(async () => undefined),
    isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/bucket/"),
    now: () => "2026-10-15T00:00:00.000Z",
  };
});

describe("completeDubGeneration", () => {
  it("inserts an active version holding original + dubbed, and settles the dub cost", async () => {
    await completeDubGeneration("n1", gen(), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: OWN("d.mp4"), dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "dub_1" }, deps);
    expect(deps.insertVersion).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", operatorUserId: "u", modelUsed: "sarvam:dub",
      output: { language: "hi-IN", original: OWN("src.mp4"), dubbed: OWN("d.mp4"), dubbedAudio: OWN("d.mp3"), lipSynced: null },
      inputsUsed: { dub: { ...DUB, vendorJobId: "dub_1" } },
      paramsUsed: { durationSeconds: 8 },
    }));
    expect(deps.settleGeneration).toHaveBeenCalledWith({ orgId: "org", generationId: "g1", actualAmount: dubCredits(8) });
    expect(deps.setActiveVersion).toHaveBeenCalledWith("n1", "ver-1");
    expect(deps.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ versionId: "ver-1", creditsCharged: dubCredits(8), costUsd: computeDubCost(8).usd }));
  });

  it("fails and refunds a result stored outside our bucket or a missing record", async () => {
    await completeDubGeneration("n1", gen(), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: "https://evil/d.mp4", dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "x" }, deps);
    await completeDubGeneration("n1", gen({ inputs_snapshot: {} }), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: OWN("d.mp4"), dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "x" }, deps);
    expect(deps.failAndRefund).toHaveBeenCalledTimes(2);
    expect(deps.insertVersion).not.toHaveBeenCalled();
  });
});

describe("completeLipSyncGeneration", () => {
  const VERSION = { id: "ver-1", node_id: "n1", output: { language: "hi-IN", original: OWN("o.mp4"), dubbed: OWN("d.mp4"), dubbedAudio: OWN("d.mp3"), lipSynced: OWN("old.mp4") }, inputs_used: { dub: DUB, lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 1 } } };
  const lgen = gen({ type: "lipsync", model_used: "fal:lipsync-2-pro", inputs_snapshot: { lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 0 } } });

  it("overrides the version's lipSynced, counts the run and settles against that version", async () => {
    (deps.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(VERSION);
    await completeLipSyncGeneration("n1", lgen, { generationId: "g1", status: "succeeded", kind: "lipsync", stored: true, videoUrl: OWN("new.mp4"), durationSeconds: 8, vendorRequestId: "r9" }, deps);
    expect(deps.updateVersionOutputAndInputs).toHaveBeenCalledWith(
      "ver-1",
      { ...VERSION.output, lipSynced: OWN("new.mp4") },
      { dub: DUB, lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 2, lastRanAt: "2026-10-15T00:00:00.000Z", vendorRequestId: "r9" } },
    );
    expect(deps.insertVersion).not.toHaveBeenCalled();
    expect(deps.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ versionId: "ver-1", creditsCharged: lipSyncCredits(8), costUsd: computeLipSyncCost(8).usd }));
  });

  it("fails and refunds when the target version is gone or not a dub", async () => {
    (deps.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await completeLipSyncGeneration("n1", lgen, { generationId: "g1", status: "succeeded", kind: "lipsync", stored: true, videoUrl: OWN("new.mp4"), durationSeconds: 8, vendorRequestId: "r" }, deps);
    expect(deps.failAndRefund).toHaveBeenCalled();
    expect(deps.updateVersionOutputAndInputs).not.toHaveBeenCalled();
  });
});
```

`src/lib/db/__tests__/credits-by-version.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rows = [
  { version_id: "v1", credits_charged: 30 },
  { version_id: "v1", credits_charged: 45 },
  { version_id: "v1", credits_charged: 45 },
  { version_id: "v2", credits_charged: 10 },
];
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ select: () => ({ in: () => ({ not: async () => ({ data: rows, error: null }) }) }) }) }),
}));
import { getCreditsChargedByVersionIds } from "../generations";

describe("getCreditsChargedByVersionIds", () => {
  it("sums every generation charged to a version (a dub plus its lip syncs)", async () => {
    const m = await getCreditsChargedByVersionIds(["v1", "v2"]);
    expect(m.get("v1")).toBe(120);
    expect(m.get("v2")).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/dubbing/__tests__/complete.test.ts src/lib/db/__tests__/credits-by-version.test.ts`
Expected: FAIL — `../complete` missing; `v1` is 45, not 120.

- [ ] **Step 3: Implement**

`src/lib/db/types.ts:133`:
```ts
  type: "image" | "video" | "prompt" | "voice" | "dub" | "lipsync";
```

`src/lib/db/generations.ts` — replace the `return new Map(...)` body of `getCreditsChargedByVersionIds` with a sum:
```ts
  // A version can be charged by several generations (a dub, then each lip sync on it, D375):
  // sum them, never keep the last.
  const sums = new Map<string, number>();
  for (const r of data as { version_id: string | null; credits_charged: number | null }[]) {
    if (r.version_id === null || r.credits_charged === null) continue;
    sums.set(r.version_id, (sums.get(r.version_id) ?? 0) + r.credits_charged);
  }
  return sums;
```

`src/lib/db/versions.ts` after `updateVersionOutput`:
```ts
// D375 — lip sync fills a stage of an existing Dubbing version: its output and its record
// change together. `generated_output` stays frozen (D22).
export async function updateVersionOutputAndInputs(
  versionId: string,
  output: unknown,
  inputsUsed: Record<string, unknown>,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("node_versions")
    .update({ output, inputs_used: inputsUsed })
    .eq("id", versionId);
  if (error) throw error;
}
```

`src/lib/dubbing/complete.ts`:
```ts
import "server-only";
import { insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs } from "@/lib/db/versions";
import { succeedGeneration } from "@/lib/db/generations";
import { settleGeneration } from "@/lib/db/credit-transactions";
import { isOwnStoredUrl } from "@/lib/storage";
import { usdToFinalCredits } from "@/lib/credits/units";
import type { GenerationRow } from "@/lib/db/types";
import { readDubRecord, readDubbingOutput, readLipSyncRecord, type DubbingOutput } from "./types";
import { computeDubCost, computeLipSyncCost } from "./cost";

export type DubSucceeded = {
  generationId: string; status: "succeeded"; kind: "dub"; stored: true;
  dubbedUrl: string; dubbedAudioUrl: string; durationSeconds: number; vendorJobId: string;
};
export type LipSyncSucceeded = {
  generationId: string; status: "succeeded"; kind: "lipsync"; stored: true;
  videoUrl: string; durationSeconds: number; vendorRequestId: string;
};

export type CompleteDeps = {
  insertVersion: typeof insertVersion;
  setActiveVersion: typeof setActiveVersion;
  getVersionById: typeof getVersionById;
  updateVersionOutputAndInputs: typeof updateVersionOutputAndInputs;
  settleGeneration: typeof settleGeneration;
  succeedGeneration: typeof succeedGeneration;
  failAndRefund: (generationId: string, orgId: string, error: string) => Promise<void>;
  isOwnStoredUrl: (url: string) => boolean;
  now: () => string;
};

const DEFAULT_DEPS = (failAndRefund: CompleteDeps["failAndRefund"]): CompleteDeps => ({
  insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs,
  settleGeneration, succeedGeneration, failAndRefund, isOwnStoredUrl,
  now: () => new Date().toISOString(),
});

/** D375 — a dub becomes a new active version holding the original and the dubbed stages. */
export async function completeDubGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: DubSucceeded,
  deps: CompleteDeps,
): Promise<void> {
  const record = readDubRecord(generation.inputs_snapshot?.dub);
  if (!record) return deps.failAndRefund(input.generationId, generation.org_id, "Dub record is missing");
  if (!deps.isOwnStoredUrl(input.dubbedUrl) || !deps.isOwnStoredUrl(input.dubbedAudioUrl)) {
    return deps.failAndRefund(input.generationId, generation.org_id, "Dubbed files are outside this app's bucket");
  }
  const output: DubbingOutput = {
    language: record.targetLang,
    original: record.sourceUrl,
    dubbed: input.dubbedUrl,
    dubbedAudio: input.dubbedAudioUrl,
    lipSynced: null,
  };
  const version = await deps.insertVersion({
    nodeId,
    operatorUserId: generation.user_id,
    inputsUsed: { ...(generation.inputs_snapshot ?? {}), dub: { ...record, vendorJobId: input.vendorJobId } },
    paramsUsed: { durationSeconds: input.durationSeconds },
    modelUsed: generation.model_used,
    output,
  });
  const cost = computeDubCost(input.durationSeconds);
  const credits = usdToFinalCredits(cost.usd);
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.setActiveVersion(nodeId, version.id);
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: cost.usd,
    creditsCharged: credits, outputSnapshot: input.dubbedUrl,
  });
}

/** D375 — lip sync overrides the target version's lipSynced stage. No new version. */
export async function completeLipSyncGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: LipSyncSucceeded,
  deps: CompleteDeps,
): Promise<void> {
  const asked = readLipSyncRecord(generation.inputs_snapshot?.lipSync);
  if (!asked) return deps.failAndRefund(input.generationId, generation.org_id, "Lip sync record is missing");
  if (!deps.isOwnStoredUrl(input.videoUrl)) {
    return deps.failAndRefund(input.generationId, generation.org_id, "Lip-synced video is outside this app's bucket");
  }
  const version = await deps.getVersionById(asked.versionId);
  const current = version && version.node_id === nodeId ? readDubbingOutput(version.output) : null;
  if (!version || !current) return deps.failAndRefund(input.generationId, generation.org_id, "The dub this lip sync was for is gone");

  const previous = readLipSyncRecord(version.inputs_used?.lipSync);
  const lipSync = {
    versionId: version.id, provider: asked.provider, model: asked.model,
    runs: (previous?.runs ?? 0) + 1, lastRanAt: deps.now(), vendorRequestId: input.vendorRequestId,
  };
  await deps.updateVersionOutputAndInputs(
    version.id,
    { ...current, lipSynced: input.videoUrl },
    { ...(version.inputs_used ?? {}), lipSync },
  );
  const cost = computeLipSyncCost(input.durationSeconds);
  const credits = usdToFinalCredits(cost.usd);
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: cost.usd,
    creditsCharged: credits, outputSnapshot: input.videoUrl,
  });
}

export { DEFAULT_DEPS as dubbingCompleteDeps };
```

In `src/lib/generations/complete.ts`:
- import: `import { completeDubGeneration, completeLipSyncGeneration, dubbingCompleteDeps, type DubSucceeded, type LipSyncSucceeded } from "@/lib/dubbing/complete";`
- widen the union: add `| DubSucceeded | LipSyncSucceeded` to `CompleteGenerationInput`.
- In the duplicate-delivery guard at the top, the `input.kind === "image"` check stays as is (the new kinds are quiet duplicates).
- Immediately before `if (input.kind === "image") {` add:
```ts
  // D375 — the Dubbing node's two jobs. Fail closed on a kind that doesn't match its row.
  if (input.kind === "dub" || input.kind === "lipsync") {
    const expected = input.kind === "dub" ? "dub" : "lipsync";
    if (generation.type !== expected) {
      await failAndRefund(input.generationId, generation.org_id, `${input.kind} result for a ${generation.type} generation`);
      return;
    }
    const deps = dubbingCompleteDeps(failAndRefund);
    if (input.kind === "dub") await completeDubGeneration(nodeId, generation, input, deps);
    else await completeLipSyncGeneration(nodeId, generation, input, deps);
    return;
  }
```
- The later `input.stored` / `input.videoUrl` code narrows on the remaining video member; if TypeScript complains, narrow with `if (input.kind !== undefined && input.kind !== "video") return;` right after this block.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/dubbing/__tests__/complete.test.ts src/lib/db/__tests__/credits-by-version.test.ts src/lib/generations`
Expected: PASS, including the existing `complete.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dubbing/complete.ts src/lib/dubbing/__tests__/complete.test.ts src/lib/db src/lib/generations/complete.ts
git commit -m "feat(dubbing): complete dubs and lip syncs; sum a version's credits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Source resolution and the two start routes

**Files:**
- Create: `src/lib/dubbing/source.ts`, `src/app/api/nodes/[id]/dub/route.ts`, `src/app/api/nodes/[id]/lip-sync/route.ts`
- Test: `src/lib/dubbing/__tests__/source.test.ts`, `src/app/api/nodes/[id]/dub/route.test.ts`, `src/app/api/nodes/[id]/lip-sync/route.test.ts`

**Interfaces:**
- Consumes: `getUpstreamOutputs` (`@/lib/db/nodes`), `getVersionById`, `isOwnStoredUrl`, `durationOfParams` (`@/lib/voice-change/record`), `hasRunningGeneration`, `insertGeneration`, `failGeneration`, `reserveCredits`, `refundReservation`, `CreditLimitError`, signers (Task 5), Task 1 types/cost/engines/copy.
- Produces:
  - `resolveDubSource(nodeId, deps: { getUpstreamOutputs; getVersionById }): Promise<{ ok: true; sourceNodeId: string; sourceVersionId: string; sourceUrl: string; durationSeconds: number } | { ok: false; reason: string }>`
  - `POST /api/nodes/[id]/dub` body `{ language: DubLanguage }` → 202 `{ generationId }`
  - `POST /api/nodes/[id]/lip-sync` body `{ versionId: string }` → 202 `{ generationId }`

- [ ] **Step 1: Write the failing tests**

`src/lib/dubbing/__tests__/source.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://own/") }));
import { resolveDubSource } from "../source";

const VG = { nodeId: "vg", type: "video-gen", data: {}, activeOutput: "https://own/v.mp4", versionId: "sv" };
const ver = (over = {}) => ({ id: "sv", node_id: "vg", output: "https://own/v.mp4", error: null, params_used: { durationSeconds: 8 }, ...over });

describe("resolveDubSource", () => {
  it("takes the connected video's active version as-is", async () => {
    const r = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver() as never });
    expect(r).toEqual({ ok: true, sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/v.mp4", durationSeconds: 8 });
  });

  it("explains each case it can't dub", async () => {
    const none = await resolveDubSource("n1", { getUpstreamOutputs: async () => [], getVersionById: async () => null });
    expect(none).toEqual({ ok: false, reason: "Connect a video to dub." });
    const noTake = await resolveDubSource("n1", { getUpstreamOutputs: async () => [{ ...VG, versionId: null }], getVersionById: async () => null });
    expect(noTake).toEqual({ ok: false, reason: "The connected video has no finished take yet." });
    const failed = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ error: "x" }) as never });
    expect(failed.ok).toBe(false);
    const noLen = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ params_used: {} }) as never });
    expect(noLen).toEqual({ ok: false, reason: "This take has no recorded length, so it can't be priced." });
    const long = await resolveDubSource("n1", { getUpstreamOutputs: async () => [VG], getVersionById: async () => ver({ params_used: { durationSeconds: 61 } }) as never });
    expect(long).toEqual({ ok: false, reason: "Dubbing works on clips up to a minute." });
  });
});
```

`src/app/api/nodes/[id]/dub/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dubCredits } from "@/lib/dubbing/cost";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  running: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "gen-1" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ dubbed: { putUrl: "https://put/v", url: "https://own/v.mp4" }, dubbedAudio: { putUrl: "https://put/a", url: "https://own/a.mp3" } })),
  trigger: vi.fn(async () => ({ id: "run" })),
  nodeType: { value: "dubbing" },
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: mocks.nodeType.value }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/dubbing/source", () => ({ resolveDubSource: mocks.resolve }));
vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn() }));
vi.mock("@/lib/db/versions", () => ({ getVersionById: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.running }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/storage", () => ({ signDubbingUploads: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/dub", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nodeType.value = "dubbing";
  process.env.SARVAM_API_KEY = "k";
  mocks.resolve.mockResolvedValue({ ok: true, sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/src.mp4", durationSeconds: 8 });
});

describe("POST /api/nodes/[id]/dub", () => {
  it("records the source, reserves the dub's credits and triggers video-dub", async () => {
    const res = await post({ language: "ta-IN" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-1" });
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", orgId: "org-1", clientId: "client-1", userId: "u1", type: "dub", modelUsed: "sarvam:dub",
      paramsSnapshot: { durationSeconds: 8 },
      inputsSnapshot: { dub: { sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/src.mp4", srcLang: "en-IN", targetLang: "ta-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" } },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-1", dubCredits(8));
    expect(mocks.trigger).toHaveBeenCalledWith("video-dub", {
      generationId: "gen-1", sourceUrl: "https://own/src.mp4", targetLang: "ta-IN",
      dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a",
      dubbedUrl: "https://own/v.mp4", dubbedAudioUrl: "https://own/a.mp3", durationSeconds: 8,
    });
  });

  it("refuses before recording anything", async () => {
    expect((await post({ language: "en-IN" })).status).toBe(400);
    mocks.resolve.mockResolvedValueOnce({ ok: false, reason: "Connect a video to dub." });
    const r = await post({ language: "hi-IN" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "Connect a video to dub." });
    mocks.running.mockResolvedValueOnce(true);
    expect((await post({ language: "hi-IN" })).status).toBe(409);
    delete process.env.SARVAM_API_KEY;
    expect((await post({ language: "hi-IN" })).status).toBe(400);
    mocks.nodeType.value = "video-gen";
    process.env.SARVAM_API_KEY = "k";
    expect((await post({ language: "hi-IN" })).status).toBe(404);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("fails and refunds when the trigger throws", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("down"));
    expect((await post({ language: "hi-IN" })).status).toBe(500);
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-1" });
  });
});
```

`src/app/api/nodes/[id]/lip-sync/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { lipSyncCredits } from "@/lib/dubbing/cost";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  running: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "gen-2" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ putUrl: "https://put/l", url: "https://own/l.mp4" })),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: "dubbing", active_version_id: "ver-1" }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/db/versions", () => ({ getVersionById: mocks.getVersion }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.running }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/storage", () => ({ signLipSyncedUpload: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const OUT = { language: "hi-IN", original: "https://own/o.mp4", dubbed: "https://own/d.mp4", dubbedAudio: "https://own/d.mp3", lipSynced: null };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/lip-sync", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FAL_KEY = "k";
  mocks.getVersion.mockResolvedValue({ id: "ver-1", node_id: "n1", output: OUT, params_used: { durationSeconds: 8 } });
});

describe("POST /api/nodes/[id]/lip-sync", () => {
  it("lip-syncs the active dub's original to its dubbed audio", async () => {
    const res = await post({ versionId: "ver-1" });
    expect(res.status).toBe(202);
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      type: "lipsync", modelUsed: "fal:lipsync-2-pro", paramsSnapshot: { durationSeconds: 8 },
      inputsSnapshot: { lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 0 } },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-2", lipSyncCredits(8));
    expect(mocks.trigger).toHaveBeenCalledWith("video-lip-sync", {
      generationId: "gen-2", videoUrl: "https://own/o.mp4", audioUrl: "https://own/d.mp3", model: "lipsync-2-pro",
      lipSyncedPutUrl: "https://put/l", lipSyncedUrl: "https://own/l.mp4", durationSeconds: 8,
    });
  });

  it("only runs on this node's active dub, one job at a time", async () => {
    expect((await post({ versionId: "ver-2" })).status).toBe(400);
    mocks.getVersion.mockResolvedValueOnce({ id: "ver-1", node_id: "other", output: OUT, params_used: { durationSeconds: 8 } });
    expect((await post({ versionId: "ver-1" })).status).toBe(400);
    mocks.getVersion.mockResolvedValueOnce({ id: "ver-1", node_id: "n1", output: "https://x.mp4", params_used: {} });
    expect((await post({ versionId: "ver-1" })).status).toBe(400);
    mocks.running.mockResolvedValueOnce(true);
    expect((await post({ versionId: "ver-1" })).status).toBe(409);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/dubbing/__tests__/source.test.ts "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/dubbing/source.ts`:
```ts
import "server-only";
import { isOwnStoredUrl } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { NodeVersionRow } from "@/lib/db/types";
import { DUB_MAX_SECONDS } from "./constants";

/** D374 — the one connected Video Gen node's active version, read on the server, used as-is. */
export async function resolveDubSource(
  nodeId: string,
  deps: {
    getUpstreamOutputs: (nodeId: string) => Promise<UpstreamOutput[]>;
    getVersionById: (id: string) => Promise<NodeVersionRow | null>;
  },
): Promise<
  | { ok: true; sourceNodeId: string; sourceVersionId: string; sourceUrl: string; durationSeconds: number }
  | { ok: false; reason: string }
> {
  const video = (await deps.getUpstreamOutputs(nodeId)).find((u) => u.type === "video-gen");
  if (!video) return { ok: false, reason: "Connect a video to dub." };
  const noTake = { ok: false as const, reason: "The connected video has no finished take yet." };
  if (!video.versionId) return noTake;
  const version = await deps.getVersionById(video.versionId);
  if (!version || version.node_id !== video.nodeId || version.error || typeof version.output !== "string" || !isOwnStoredUrl(version.output)) {
    return noTake;
  }
  const durationSeconds = durationOfParams(version.params_used ?? {});
  if (!durationSeconds) return { ok: false, reason: "This take has no recorded length, so it can't be priced." };
  if (durationSeconds > DUB_MAX_SECONDS) return { ok: false, reason: "Dubbing works on clips up to a minute." };
  return { ok: true, sourceNodeId: video.nodeId, sourceVersionId: version.id, sourceUrl: version.output, durationSeconds };
}
```

`src/app/api/nodes/[id]/dub/route.ts`:
```ts
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { signDubbingUploads } from "@/lib/storage";
import { resolveDubSource } from "@/lib/dubbing/source";
import { dubCredits } from "@/lib/dubbing/cost";
import { DUB_ENGINE } from "@/lib/dubbing/providers";
import { DUBBING_NOT_SET_UP_MESSAGE } from "@/lib/dubbing/copy";
import { DUB_SOURCE_LANGUAGE, isDubLanguage, type DubRecord } from "@/lib/dubbing/types";

const BodySchema = z.object({ language: z.string().refine(isDubLanguage) });

// D374 — dub the one connected video's current take. A new `dub` generation; its version is
// written when the task reports back (D375).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    if (node.type !== "dubbing") return apiError("Node not found.", 404);
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !isDubLanguage(parsed.data.language)) return apiError("Pick a language to dub into.", 400);
    const targetLang = parsed.data.language;
    if (!process.env.SARVAM_API_KEY) return apiError(DUBBING_NOT_SET_UP_MESSAGE, 400);

    // Independent reads run side by side (performance rule 5).
    const [source, running] = await Promise.all([
      resolveDubSource(nodeId, { getUpstreamOutputs, getVersionById }),
      hasRunningGeneration(nodeId),
    ]);
    if (running) return apiError("This node is already working. Try again when it finishes.", 409);
    if (!source.ok) return apiError(source.reason, 400);

    const dub: DubRecord = {
      sourceNodeId: source.sourceNodeId,
      sourceVersionId: source.sourceVersionId,
      sourceUrl: source.sourceUrl,
      srcLang: DUB_SOURCE_LANGUAGE,
      targetLang,
      durationSeconds: source.durationSeconds,
      provider: DUB_ENGINE.provider,
      model: DUB_ENGINE.model,
    };
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "dub",
      modelUsed: DUB_ENGINE.modelUsed,
      paramsSnapshot: { durationSeconds: source.durationSeconds },
      inputsSnapshot: { dub },
    });

    try {
      const reservation = await reserveCredits(effectiveOrgId, generation.id, dubCredits(source.durationSeconds));
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
      const uploads = await signDubbingUploads({ nodeId, generationId: generation.id });
      await tasks.trigger("video-dub", {
        generationId: generation.id,
        sourceUrl: source.sourceUrl,
        targetLang,
        dubbedPutUrl: uploads.dubbed.putUrl,
        dubbedAudioPutUrl: uploads.dubbedAudio.putUrl,
        dubbedUrl: uploads.dubbed.url,
        dubbedAudioUrl: uploads.dubbedAudio.url,
        durationSeconds: source.durationSeconds,
      });
      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const limit = e instanceof CreditLimitError;
      const message = limit ? (e as Error).message : "Couldn't start the dub. Try again.";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, limit ? 402 : 500);
    }
  });
}
```

`src/app/api/nodes/[id]/lip-sync/route.ts`:
```ts
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { signLipSyncedUpload } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import { lipSyncCredits } from "@/lib/dubbing/cost";
import { LIP_SYNC_ENGINE } from "@/lib/dubbing/providers";
import { DUBBING_NOT_SET_UP_MESSAGE } from "@/lib/dubbing/copy";
import { readDubbingOutput, type LipSyncRecord } from "@/lib/dubbing/types";

const BodySchema = z.object({ versionId: z.string().min(1) });

// D375 — lip-sync the active dub. Its result overrides that version's lipSynced stage.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    if (node.type !== "dubbing") return apiError("Node not found.", 404);
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Pick a dub to lip-sync.", 400);
    const { versionId } = parsed.data;
    if (!process.env.FAL_KEY) return apiError(DUBBING_NOT_SET_UP_MESSAGE, 400);
    if (node.active_version_id !== versionId) return apiError("Lip sync runs on the dub you're viewing. Reopen the node and try again.", 400);

    const [version, running] = await Promise.all([getVersionById(versionId), hasRunningGeneration(nodeId)]);
    if (running) return apiError("This node is already working. Try again when it finishes.", 409);
    const output = version && version.node_id === nodeId ? readDubbingOutput(version.output) : null;
    const durationSeconds = version ? durationOfParams(version.params_used ?? {}) : 0;
    if (!output || !durationSeconds) return apiError("Make a dub first, then lip-sync it.", 400);

    const lipSync: LipSyncRecord = { versionId, provider: LIP_SYNC_ENGINE.provider, model: LIP_SYNC_ENGINE.model, runs: 0 };
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "lipsync",
      modelUsed: LIP_SYNC_ENGINE.modelUsed,
      paramsSnapshot: { durationSeconds },
      inputsSnapshot: { lipSync },
    });

    try {
      const reservation = await reserveCredits(effectiveOrgId, generation.id, lipSyncCredits(durationSeconds));
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
      const upload = await signLipSyncedUpload({ nodeId, generationId: generation.id });
      await tasks.trigger("video-lip-sync", {
        generationId: generation.id,
        videoUrl: output.original,
        audioUrl: output.dubbedAudio,
        model: LIP_SYNC_ENGINE.model,
        lipSyncedPutUrl: upload.putUrl,
        lipSyncedUrl: upload.url,
        durationSeconds,
      });
      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const limit = e instanceof CreditLimitError;
      const message = limit ? (e as Error).message : "Couldn't start lip sync. Try again.";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, limit ? 402 : 500);
    }
  });
}
```
Check that `NodeRow` exposes `type` and `active_version_id`; if `insertGeneration`'s `type` parameter is a narrower union than `GenerationRow["type"]`, widen it to `GenerationRow["type"]`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/dubbing "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dubbing/source.ts src/lib/dubbing/__tests__/source.test.ts "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync" src/lib/db/generations.ts
git commit -m "feat(dubbing): dub and lip-sync start routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Job kinds, completion toasts and the generation tray

**Files:**
- Modify: `src/lib/generations/node-status.ts`, `src/lib/generation-tray.ts`, `src/hooks/use-generation-status.ts`
- Test: existing `src/lib/generations/__tests__/` node-status test file (append) and `src/lib/generation-tray.test.ts` (append)

**Interfaces — Produces:**
- `GenerationJobKind = "image" | "video" | "voice" | "dub" | "lipsync"`; `jobKindOf("dub") === "dub"`, `jobKindOf("lipsync") === "lipsync"`
- Toasts: dub success "Dub ready", lip sync success "Lip sync ready"; failures show the row's `error` (already plain), fallbacks "Dubbing failed" / "Lip sync failed".
- `TrayKind` gains `"dub"` with meta `{ label: "Dub", track: "video", stage: "output" }`; `resolveTrayKind("dub" | "lipsync", …) === "dub"`.
- `GenerationStatus.runningKind: GenerationJobKind | null` (so the Dubbing view can tell Dubbing… from Lip-syncing…).

- [ ] **Step 1: Write the failing tests** (append; find the node-status test with `rg -l "jobKindOf" src/lib/generations`)

```ts
describe("dubbing kinds", () => {
  it("names dub and lipsync jobs", () => {
    expect(jobKindOf("dub")).toBe("dub");
    expect(jobKindOf("lipsync")).toBe("lipsync");
  });
  it("announces a finished dub and lip sync", () => {
    const row = (type: string, status: string, error: string | null = null) => ({ id: "g", node_id: "n", type, status, error, output_snapshot: null, created_at: "2026-10-15T00:00:00Z", version_id: null }) as never;
    expect(completionEffect(row("dub", "running"), row("dub", "succeeded"))?.toast.message).toBe("Dub ready");
    expect(completionEffect(row("lipsync", "running"), row("lipsync", "succeeded"))?.toast.message).toBe("Lip sync ready");
    expect(completionEffect(row("dub", "running"), row("dub", "failed", null))?.toast.message).toBe("Dubbing failed");
  });
});
```
In `src/lib/generation-tray.test.ts`:
```ts
describe("resolveTrayKind dubbing", () => {
  it("shows dub and lip sync jobs as Dub", () => {
    expect(resolveTrayKind("dub" as never, "dubbing")).toBe("dub");
    expect(resolveTrayKind("lipsync" as never, "dubbing")).toBe("dub");
    expect(TRAY_KIND_META.dub.label).toBe("Dub");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/generations src/lib/generation-tray.test.ts`
Expected: FAIL — `jobKindOf("dub")` returns `"video"`; `resolveTrayKind` returns `"image-prompt"`.

- [ ] **Step 3: Implement**

`src/lib/generations/node-status.ts`:
```ts
export type GenerationJobKind = "image" | "video" | "voice" | "dub" | "lipsync";

export function jobKindOf(type: GenerationFeedRow["type"]): GenerationJobKind {
  if (type === "voice" || type === "image" || type === "dub" || type === "lipsync") return type;
  return "video";
}
```
In `completionEffect`, replace the `voice`-only messages with a lookup:
```ts
const SUCCESS: Partial<Record<GenerationFeedRow["type"], string>> = {
  voice: "Voice changed and added as a new version",
  image: "Image ready",
  dub: "Dub ready",
  lipsync: "Lip sync ready",
};
const FAILURE: Partial<Record<GenerationFeedRow["type"], string>> = {
  voice: "Voice change failed",
  dub: "Dubbing failed",
  lipsync: "Lip sync failed",
};
```
(declared at module scope), and inside:
```ts
  if (next.status === "succeeded") {
    return {
      toast: { tone: "success", message: SUCCESS[next.type] ?? "Video ready" },
      cardImage: next.type === "image" ? next.output_snapshot : null,
    };
  }
  return {
    toast: { tone: "error", message: next.error ?? FAILURE[next.type] ?? "Generation failed" },
    cardImage: null,
  };
```
(remove the now-unused `const voice = …` line).

`src/lib/generation-tray.ts`:
```ts
export type TrayKind = "image-prompt" | "image" | "motion-prompt" | "video" | "dub";
// in TRAY_KIND_META:
  dub: { label: "Dub", track: "video", stage: "output" },
// in resolveTrayKind, first line:
  if (jobType === "dub" || jobType === "lipsync") return "dub";
```
Then fix any `Record<TrayKind, …>` the compiler flags in the tray component (`rg -n "TrayKind" src/components`), mapping `dub` to the same glyph as `video`.

`src/hooks/use-generation-status.ts`: add `runningKind: status.isGenerating ? status.kind : null` to the returned object and `runningKind: GenerationJobKind | null;` to `GenerationStatus`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/generations src/lib/generation-tray.test.ts src/hooks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generations src/lib/generation-tray.ts src/lib/generation-tray.test.ts src/hooks/use-generation-status.ts src/components
git commit -m "feat(dubbing): dub and lip-sync job kinds, toasts and tray entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Register the node type and the one-input rule

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (data type, `AppNode`, `VALID_CONNECTIONS`, new `MAX_INCOMING` + `canAcceptIncoming`), `src/lib/canvas-node-options.ts`, `src/lib/canvas-store.ts` (`defaultData`), `src/lib/nodes/describe-node.ts`, `src/components/canvas/quick-add-menu.tsx` (`ICONS`), `src/components/canvas/canvas.tsx` (`nodeTypes`, `isValidConnection`), `src/components/nodes/add-connection.tsx`, `src/lib/copilot/actions.ts`, `src/components/nodes/connected-inputs-card.tsx` (`NodeIcon` for `video-gen` and `dubbing`)
- Test: `src/lib/canvas-nodes.test.ts`, `src/lib/canvas-node-options.test.ts` (append)

**Interfaces — Produces:**
- `type DubbingNodeData = { title?: string; language?: DubLanguage; parsed?: unknown }`
- `VALID_CONNECTIONS["video-gen"] = ["dubbing"]`, `VALID_CONNECTIONS.dubbing = []`
- `MAX_INCOMING: Record<string, number> = { dubbing: 1 }`
- `canAcceptIncoming(targetType: string, currentIncoming: number): boolean`
- Quick-add `{ type: "dubbing", label: "Dubbing", mnemonic: "B" }`; icon `Languages` (Lucide).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/canvas-nodes.test.ts`:
```ts
describe("dubbing connections", () => {
  it("takes a Video Gen input only, and only one", () => {
    expect(canConnect("video-gen", "dubbing")).toBe(true);
    expect(canConnect("image-gen", "dubbing")).toBe(false);
    expect(canConnect("dubbing", "video-gen")).toBe(false);
    expect(canAcceptIncoming("dubbing", 0)).toBe(true);
    expect(canAcceptIncoming("dubbing", 1)).toBe(false);
    expect(canAcceptIncoming("composite", 9)).toBe(true);
  });
  it("hydrates the active output as parsed", () => {
    const out = { language: "hi-IN", original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null };
    const n = nodeRowToFlow({ id: "n", type: "dubbing", position: { x: 0, y: 0 }, data: { language: "hi-IN" }, active: { output: out } } as never);
    expect(n.type).toBe("dubbing");
    expect((n.data as { parsed: unknown }).parsed).toEqual(out);
  });
});
```
(add `canAcceptIncoming` to the file's import.)

Append to `src/lib/canvas-node-options.test.ts`:
```ts
it("adds Dubbing on B", () => {
  expect(mnemonicToType("b")).toBe("dubbing");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/canvas-nodes.ts`:
```ts
import type { DubLanguage } from "@/lib/dubbing/types";
// …
// D374 — dubs its one connected Video Gen take. `language` is the select's last value; each
// version records its own. `parsed` is the active version's DubbingOutput (display only, D19).
export type DubbingNodeData = { title?: string; language?: DubLanguage; parsed?: unknown };
```
Add `| Node<DubbingNodeData, "dubbing">` to `AppNode`. In `VALID_CONNECTIONS` change `"video-gen": []` to `"video-gen": ["dubbing"],` and add `"dubbing": [],`. After `canConnect`:
```ts
// D374 — targets that take a fixed number of inputs. One place, checked wherever a wire is made
// (manual drag, the + picker, the copilot).
export const MAX_INCOMING: Record<string, number> = { dubbing: 1 };

export function canAcceptIncoming(targetType: string, currentIncoming: number): boolean {
  const max = MAX_INCOMING[targetType];
  return max === undefined || currentIncoming < max;
}
```

`src/lib/canvas-node-options.ts`: add `| "dubbing"` to `AddNodeType` and, after Video Gen:
```ts
  // "B" for duBbing (D374): D is Draw.
  { type: "dubbing", label: "Dubbing", mnemonic: "B" },
```

`src/lib/canvas-store.ts` `defaultData`: `case "dubbing": return { title: "" };`

`src/lib/nodes/describe-node.ts`: `case "dubbing": return "dubbing";` and `dubbing: "DUB",` in `NODE_ABBREV`.

`src/components/canvas/quick-add-menu.tsx`: import `Languages` from `lucide-react`; `dubbing: Languages,` in `ICONS`.

`src/components/canvas/canvas.tsx`: import `DubbingNode` (Task 12 creates it; until then, add the import in Task 12 — in this task only change `isValidConnection`). In `isValidConnection`, right after the `canConnect` check:
```ts
      const incoming = edges.filter((e) => e.target === connection.target).length;
      if (!canAcceptIncoming(target.type ?? "", incoming)) return false;
```
(import `canAcceptIncoming` alongside `canConnect`).

`src/components/nodes/add-connection.tsx`: read the component; where it builds candidates with `canConnect(n.type ?? "", targetType)`, also return no candidates (and render nothing) when `!canAcceptIncoming(targetType, connectedIds.length)`. The Dubbing rail doesn't render `AddConnection` at all (Task 12), this is the guard for any other caller.

`src/lib/copilot/actions.ts` (~line 89): after the `canConnect` rejection, reject when the target already has `MAX_INCOMING` inputs:
```ts
    else if (!canAcceptIncoming(target.type ?? "", edges.filter((e) => e.target === target.id).length)) plan.rejected.push({ handle });
```
(use whatever the surrounding code names the current edge list; read the function first).

`src/components/nodes/connected-inputs-card.tsx` `NodeIcon`: add
```ts
  if (type === "video-gen") return <Video className="size-3 shrink-0 text-primary" strokeWidth={1.5} />;
```
(import `Video` from `lucide-react`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/copilot`
Expected: PASS. Then `npx tsc --noEmit -p .` — the only expected error is none (the `nodeTypes` entry lands in Task 12).

- [ ] **Step 5: Commit**

```bash
git add src/lib src/components/canvas src/components/nodes/add-connection.tsx src/components/nodes/connected-inputs-card.tsx
git commit -m "feat(dubbing): Dubbing node type, quick-add B, one Video Gen input

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Client data layer (service, mutations, versions field)

**Files:**
- Modify: `src/services/node-generation.service.ts`, `src/hooks/queries/node-generation.ts`, `src/app/api/nodes/[id]/versions/route.ts`
- Create: `src/hooks/use-dubbing-versions.ts`
- Test: `src/services/node-generation.service.test.ts` (append)

**Interfaces:**
- Produces:
  - `nodeGenerationService.startDub(nodeId: string, body: { language: DubLanguage }): Promise<StartedGeneration>`
  - `nodeGenerationService.startLipSync(nodeId: string, body: { versionId: string }): Promise<StartedGeneration>`
  - `useStartDub(nodeId)`, `useStartLipSync(nodeId)` — `useMutation`; on success `markGenerationStarted(nodeId, "dub" | "lipsync", generationId)`.
  - Versions route: each version gains `dubbing: DubbingOutput | null` and `lipSyncRuns: number`.
  - `type DubbingVersionSummary = { id: string; createdAt: string; error: string | null; dubbing: DubbingOutput | null; lipSyncRuns: number; creditsCharged: number | null }`
  - `useDubbingVersions(nodeId: string, open: boolean, onPatch: (p: Record<string, unknown>) => void): { versions: DubbingVersionSummary[]; activeVersionId: string | null; active: DubbingVersionSummary | null; loading: boolean; restore: (id: string) => Promise<void>; restoring: boolean }`

- [ ] **Step 1: Write the failing test** (append to `src/services/node-generation.service.test.ts`; mirror how the file already stubs `fetch`)

```ts
describe("dubbing starts", () => {
  it("posts the language and the version to their routes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ generationId: "g" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(nodeGenerationService.startDub("n1", { language: "hi-IN" })).resolves.toEqual({ generationId: "g" });
    await expect(nodeGenerationService.startLipSync("n1", { versionId: "v1" })).resolves.toEqual({ generationId: "g" });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/nodes/n1/dub", "/api/nodes/n1/lip-sync"]);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ language: "hi-IN" });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/node-generation.service.test.ts`
Expected: FAIL — `startDub is not a function`.

- [ ] **Step 3: Implement**

`src/services/node-generation.service.ts` inside the class:
```ts
  /** Dubbing node (D374): dub the connected take. Answers once the job is started (202). */
  async startDub(nodeId: string, body: { language: DubLanguage }): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/dub`, body), "Couldn't start the dub.");
  }

  /** Dubbing node (D375): lip-sync the active dub. */
  async startLipSync(nodeId: string, body: { versionId: string }): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/lip-sync`, body), "Couldn't start lip sync.");
  }
```
(add `import type { DubLanguage } from "@/lib/dubbing/types";`).

`src/hooks/queries/node-generation.ts`:
```ts
export function useStartDub(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: { language: DubLanguage }) => nodeGenerationService.startDub(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "dub", started.generationId),
  });
}

export function useStartLipSync(nodeId: string) {
  const markGenerationStarted = useCanvasStore((s) => s.markGenerationStarted);
  return useMutation({
    mutationFn: (body: { versionId: string }) => nodeGenerationService.startLipSync(nodeId, body),
    onSuccess: (started) => markGenerationStarted(nodeId, "lipsync", started.generationId),
  });
}
```

`src/app/api/nodes/[id]/versions/route.ts`, inside the per-version object (next to `output`):
```ts
        // D375 — a Dubbing version's three stages (null for every other node), and how many lip
        // syncs it has had, for its History row and usage popover. `output` above stays a string.
        dubbing: readDubbingOutput(v.output),
        lipSyncRuns: readLipSyncRecord((v.inputs_used ?? {}).lipSync)?.runs ?? 0,
```
(import both readers from `@/lib/dubbing/types`).

`src/hooks/use-dubbing-versions.ts`:
```ts
"use client";

import { useEffect, useRef } from "react";
import { useNodeVersions } from "@/hooks/queries/node-versions";
import { useRestoreNodeVersion } from "@/hooks/queries/node-generation";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import type { DubbingOutput } from "@/lib/dubbing/types";

export type DubbingVersionSummary = {
  id: string;
  createdAt: string;
  error: string | null;
  dubbing: DubbingOutput | null;
  lipSyncRuns: number;
  creditsCharged: number | null;
};

/** The Dubbing view's versions (TanStack Query), kept live while open, with the active output
 *  mirrored onto the card (`parsed`) the same way Video Gen's view does. */
export function useDubbingVersions(nodeId: string, open: boolean, onPatch: (p: Record<string, unknown>) => void) {
  const query = useNodeVersions<DubbingVersionSummary>(nodeId, open);
  const restoreMutation = useRestoreNodeVersion(nodeId);
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  useNodeVersionUpdates(nodeId, open, () => void query.refetch());

  const versions = query.data?.versions ?? [];
  const activeVersionId = query.data?.activeVersionId ?? null;
  const active = versions.find((v) => v.id === activeVersionId) ?? null;

  // Held while a read is in flight, so a reopen never puts an older dub back on the card.
  const fetching = query.isFetching;
  useEffect(() => {
    if (!open || fetching || !active?.dubbing) return;
    onPatchRef.current({ parsed: active.dubbing });
  }, [open, fetching, active?.dubbing]);

  return {
    versions,
    activeVersionId,
    active,
    loading: query.isPending,
    restore: async (id: string) => { await restoreMutation.mutateAsync(id); },
    restoring: restoreMutation.isPending,
  };
}
```
Check `useNodeVersionUpdates`' real signature (`src/hooks/use-node-version-updates.ts`) and match it; the Video Gen view calls `useNodeVersionUpdates(nodeId, open, fetchVersions)`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/node-generation.service.test.ts "src/app/api/nodes/[id]/versions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services src/hooks "src/app/api/nodes/[id]/versions/route.ts"
git commit -m "feat(dubbing): start mutations, versions carry dubbing stages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The node card and focus view

**Files:**
- Create: `src/components/nodes/dubbing-node.tsx`, `dubbing-focus-view.tsx`, `dubbing-focus-rail.tsx`, `dubbing-controls.tsx`, `dubbing-player.tsx`, `dubbing-version-history.tsx`, `dubbing-usage-popover.tsx`
- Modify: `src/components/canvas/canvas.tsx` (`nodeTypes`: `dubbing: DubbingNode`)
- Test: `src/components/nodes/__tests__/dubbing-controls.test.tsx`

**Interfaces:**
- Consumes: `useDubbingVersions` (Task 11), `useStartDub`, `useStartLipSync`, `startErrorMessage` (`@/hooks/queries/node-generation`), `useGenerationStatus` (`runningKind`, Task 9), `useNodeCost`, Task 1 types/cost, `ConnectedDetailView`, `RailItem`, `NodeIcon`, `NodeCardHeader`, `NodeContextMenu`, `NodeCreditsFooter`, `UsagePopoverShell`, `GenerationErrorBadge`, `EstimatedCreditsLabel`, `EditableField`, shadcn `Select`, `Tabs`, `Button`, `Sheet`, `Skeleton`.
- Produces: `DubbingNode` (canvas `nodeTypes.dubbing`).

Read before writing: `composite-node.tsx`, `composite-focus-view.tsx`, `composite-focus-rail.tsx`, `video-gen-usage-popover.tsx`, `src/components/ui/select.tsx` and `tabs.tsx` (Base UI API: `render` prop, not `asChild`).

- [ ] **Step 1: Write the failing test**

`src/components/nodes/__tests__/dubbing-controls.test.tsx` (match the setup existing component tests in `src/components/nodes/__tests__/` use — testing-library + jsdom):
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DubbingControls } from "../dubbing-controls";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";

const base = {
  language: "hi-IN" as const, onLanguageChange: vi.fn(), sourceSeconds: 8, hasSource: true,
  activeDub: null, running: null, editable: true, onDub: vi.fn(), onLipSync: vi.fn(),
};

describe("DubbingControls", () => {
  it("shows Dub with its credit estimate and keeps Lip sync off until a dub exists", () => {
    render(<DubbingControls {...base} />);
    expect(screen.getByRole("button", { name: /^Dub/ })).toHaveTextContent(`Est. ${dubCredits(8)} credits`);
    expect(screen.getByRole("button", { name: /Lip sync/ })).toBeDisabled();
  });

  it("enables Lip sync on a dub and calls it", async () => {
    const onLipSync = vi.fn();
    render(<DubbingControls {...base} onLipSync={onLipSync} activeDub={{ language: "hi-IN", original: "o", dubbed: "d", dubbedAudio: "a", lipSynced: null }} />);
    const btn = screen.getByRole("button", { name: /Lip sync/ });
    expect(btn).toHaveTextContent(`Est. ${lipSyncCredits(8)} credits`);
    await userEvent.click(btn);
    expect(onLipSync).toHaveBeenCalled();
  });

  it("says what is running and blocks both buttons", () => {
    render(<DubbingControls {...base} running="dub" />);
    expect(screen.getByRole("button", { name: /Dubbing…/ })).toBeDisabled();
  });

  it("asks for a video when nothing is connected", () => {
    render(<DubbingControls {...base} hasSource={false} />);
    expect(screen.getByText("Connect a video to dub.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Dub/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/dubbing-controls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the components**

`src/components/nodes/dubbing-controls.tsx`:
```tsx
"use client";

import { Languages, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DUB_LANGUAGES, dubLanguageLabel, type DubLanguage, type DubbingOutput } from "@/lib/dubbing/types";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

type Props = {
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
  /** The connected take's length; 0 when unknown. */
  sourceSeconds: number;
  hasSource: boolean;
  activeDub: DubbingOutput | null;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  onDub: () => void;
  onLipSync: () => void;
};

// D374 — the Dubbing view's only controls: a language, Dub, then Lip sync. No voice, settings or
// model choices: the presenter's own voice and one lip-sync engine (D376).
export function DubbingControls({ language, onLanguageChange, sourceSeconds, hasSource, activeDub, running, editable, onDub, onLipSync }: Props) {
  const busy = running !== null;
  const canDub = editable && hasSource && sourceSeconds > 0 && !busy;
  const canLipSync = editable && Boolean(activeDub) && !busy;
  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Languages} label="Dub into" />
        <Select value={language} onValueChange={(v) => onLanguageChange(v as DubLanguage)} disabled={!editable || busy}>
          <SelectTrigger className="w-full"><SelectValue>{dubLanguageLabel(language)}</SelectValue></SelectTrigger>
          <SelectContent>
            {DUB_LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {hasSource ? "The presenter's own voice, speaking the new language." : "Connect a video to dub."}
        </p>
      </div>

      <Button onClick={onDub} disabled={!canDub} className="w-full">
        {running === "dub" ? "Dubbing…" : activeDub ? "Dub again" : "Dub"}
        {running !== "dub" && sourceSeconds > 0 && <EstimatedCreditsLabel credits={dubCredits(sourceSeconds)} />}
      </Button>

      <div className="flex flex-col gap-2">
        <FieldLabel icon={Mic} label="Lip sync" />
        <p className="text-xs text-muted-foreground">
          {activeDub ? "Matches the presenter's mouth to the dubbed voice." : "Make a dub first."}
        </p>
        <Button variant="outline" onClick={onLipSync} disabled={!canLipSync} className="w-full">
          {running === "lipsync" ? "Lip-syncing…" : activeDub?.lipSynced ? "Lip sync again" : "Lip sync"}
          {running !== "lipsync" && activeDub && sourceSeconds > 0 && <EstimatedCreditsLabel credits={lipSyncCredits(sourceSeconds)} />}
        </Button>
      </div>
    </div>
  );
}
```
(`FieldLabel`'s props: check `field-label.tsx`; the Composite view calls `<FieldLabel icon={Type} label="Instruction" />`.)

`src/components/nodes/dubbing-player.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { furthestStage, stageUrl, type DubStage, type DubbingOutput } from "@/lib/dubbing/types";

const STAGES: { id: DubStage; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "dubbed", label: "Dubbed" },
  { id: "lipSynced", label: "Lip-synced" },
];

// D375 — the active version's three stages behind one switch; with no dub yet, the connected take.
export function DubbingPlayer({ dub, sourceUrl }: { dub: DubbingOutput | null; sourceUrl: string | null }) {
  const [stage, setStage] = useState<DubStage>(dub ? furthestStage(dub) : "original");
  // A new dub or a finished lip sync jumps to the furthest stage.
  useEffect(() => { if (dub) setStage(furthestStage(dub)); }, [dub?.dubbed, dub?.lipSynced]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = dub ? stageUrl(dub, stage) : sourceUrl;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/30 p-6">
      {dub && (
        <Tabs value={stage} onValueChange={(v) => setStage(v as DubStage)}>
          <TabsList>
            {STAGES.map((s) => (
              <TabsTrigger key={s.id} value={s.id} disabled={!stageUrl(dub, s.id)}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {url ? (
        <video key={url} src={url} controls playsInline className="max-h-full w-full rounded-xl border border-border bg-black object-contain" />
      ) : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Connect a video to dub.
        </div>
      )}
    </div>
  );
}
```

`src/components/nodes/dubbing-version-history.tsx`:
```tsx
"use client";

import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

function Step({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? Check : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", done ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-3" strokeWidth={1.5} />{label}
    </span>
  );
}

// D375 — newest first; each row shows the three stages of one dub. Clicking makes it active.
export function DubbingVersionHistory({ versions, activeVersionId, onRestore, restoring }: {
  versions: DubbingVersionSummary[];
  activeVersionId: string | null;
  onRestore: (id: string) => void;
  restoring: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {versions.map((v, i) => {
        const d = v.dubbing;
        const active = v.id === activeVersionId;
        return (
          <Button
            key={v.id}
            variant="outline"
            disabled={restoring || active || !d}
            onClick={() => onRestore(v.id)}
            className={cn("h-auto w-full flex-col items-start gap-2 px-4 py-3 text-left", active && "border-primary")}
          >
            <span className="flex w-full items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">v{versions.length - i}</span>
              <span className="flex-1 text-sm font-medium">{d ? `${dubLanguageLabel(d.language)} dub` : "Dub"}</span>
              {active && <span className="text-xs font-medium text-primary">Showing</span>}
              <span className="text-xs text-muted-foreground">{formatRelativeTime(v.createdAt)}</span>
            </span>
            <span className="flex gap-4">
              <Step done label="Original" />
              <Step done={Boolean(d?.dubbed)} label="Dubbed" />
              <Step done={Boolean(d?.lipSynced)} label="Lip-synced" />
            </span>
          </Button>
        );
      })}
    </div>
  );
}
```

`src/components/nodes/dubbing-usage-popover.tsx`:
```tsx
"use client";

import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

// Spec §7 — one row per version: its dub plus every lip sync on it, summed by the versions route.
export function DubbingUsagePopover({ versions, nodeId, upstreamNodeIds }: { versions: DubbingVersionSummary[]; nodeId: string; upstreamNodeIds: string[] }) {
  const rows: UsageRow[] = versions.map((v, i) => ({
    label: `v${versions.length - i}`,
    meta: [
      v.dubbing ? `${dubLanguageLabel(v.dubbing.language)} dub` : "Dub",
      v.lipSyncRuns > 0 ? `lip sync ×${v.lipSyncRuns}` : null,
    ].filter(Boolean).join(" · "),
    credits: v.creditsCharged === null ? "—" : v.creditsCharged.toLocaleString(),
    time: formatRelativeTime(v.createdAt),
  }));
  const total = versions.reduce((s, v) => s + (v.creditsCharged ?? 0), 0);
  const pipeline = useNodeCost(nodeId, upstreamNodeIds);
  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${total.toLocaleString()} credits`}
      pipelineTotalCredits={pipeline === null ? undefined : `${pipeline.toLocaleString()} credits`}
      pipelineLoading={upstreamNodeIds.length > 0 && pipeline === null}
    />
  );
}
```

`src/components/nodes/dubbing-focus-rail.tsx`:
```tsx
"use client";

import { History, Languages } from "lucide-react";
import { NodeIcon } from "./connected-inputs-card";
import { RailItem } from "./focus-rail-item";

/** "dubbing", "history", or the connected video's node id. */
export type DubbingRailSelection = string;

// D374 — Dubbing · Connected (the one video, no add) · History.
export function DubbingFocusRail({ source, selected, onSelect, versionCount }: {
  source: { id: string; label: string } | null;
  selected: DubbingRailSelection;
  onSelect: (s: DubbingRailSelection) => void;
  versionCount: number;
}) {
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
      <RailItem icon={<Languages className="size-4 text-primary" strokeWidth={1.5} />} label="Dubbing" active={selected === "dubbing"} onClick={() => onSelect("dubbing")} />
      <div className="px-2.5 pb-1 pt-3"><span className="text-eyebrow">Connected</span></div>
      {source ? (
        <RailItem icon={<NodeIcon type="video-gen" />} label={source.label} active={selected === source.id} onClick={() => onSelect(source.id)} />
      ) : (
        <p className="px-2.5 text-xs text-muted-foreground">Wire a Video Gen node into this one.</p>
      )}
      <div className="mx-2.5 my-2 h-px bg-border" />
      <RailItem icon={<History className="size-4 text-primary" strokeWidth={1.5} />} label="History" active={selected === "history"} onClick={() => onSelect("history")} badge={versionCount ? <span className="text-xs text-muted-foreground">{versionCount}</span> : undefined} />
    </nav>
  );
}
```

`src/components/nodes/dubbing-focus-view.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { useStartDub, useStartLipSync, startErrorMessage } from "@/hooks/queries/node-generation";
import { useDubbingVersions } from "@/hooks/use-dubbing-versions";
import { normalizeTitle } from "@/lib/nodes/title";
import { nodeLabel } from "@/lib/nodes/describe-node";
import { durationOfParams } from "@/lib/voice-change/record";
import { DEFAULT_DUB_LANGUAGE, isDubLanguage, type DubLanguage } from "@/lib/dubbing/types";
import { ConnectedDetailView } from "./connected-inputs-card";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { DubbingFocusRail, type DubbingRailSelection } from "./dubbing-focus-rail";
import { DubbingControls } from "./dubbing-controls";
import { DubbingPlayer } from "./dubbing-player";
import { DubbingVersionHistory } from "./dubbing-version-history";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  language: DubLanguage | undefined;
  onPatch: (patch: Record<string, unknown>) => void;
};

// D374 — Composite's shell: rail | controls | video.
export function DubbingFocusView({ open, onOpenChange, nodeId, title, language, onPatch }: Props) {
  const editable = useCanvasEditable();
  const [selected, setSelected] = useState<DubbingRailSelection>("dubbing");
  // The one connected Video Gen node, read off the store while the view is open only.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const sourceNode = useMemo(() => {
    const e = edges.find((x) => x.target === nodeId);
    const n = e ? nodes.find((x) => x.id === e.source && x.type === "video-gen") : undefined;
    return n ?? null;
  }, [nodes, edges, nodeId]);
  const sourceUrl = typeof sourceNode?.data?.parsed === "string" ? sourceNode.data.parsed : null;
  const sourceParams = (sourceNode?.data as { params?: Record<string, unknown> } | undefined)?.params ?? {};
  const sourceSeconds = durationOfParams(sourceParams);

  const { versions, activeVersionId, active, loading, restore, restoring } = useDubbingVersions(nodeId, open, onPatch);
  const status = useGenerationStatus(nodeId);
  const startDub = useStartDub(nodeId);
  const startLipSync = useStartLipSync(nodeId);
  const lang = isDubLanguage(language) ? language : DEFAULT_DUB_LANGUAGE;
  const running = status.runningKind === "dub" || status.runningKind === "lipsync" ? status.runningKind : null;

  const onDub = () =>
    startDub.mutate({ language: lang }, { onError: (e) => toast.error(startErrorMessage(e, "Couldn't start the dub.")) });
  const onLipSync = () => {
    if (!activeVersionId) return;
    startLipSync.mutate({ versionId: activeVersionId }, { onError: (e) => toast.error(startErrorMessage(e, "Couldn't start lip sync.")) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]">
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <SheetTitle className="mt-4 p-0 font-display text-3xl font-semibold tracking-tight">
              <EditableField value={title} onCommit={(t) => onPatch({ title: normalizeTitle(t) })} placeholder="Dubbing" className="font-display text-3xl font-semibold tracking-tight" />
            </SheetTitle>
            {status.lastError && !running && <div className="mt-2"><GenerationErrorBadge error={status.lastError} /></div>}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          <DubbingFocusRail
            source={sourceNode ? { id: sourceNode.id, label: nodeLabel(sourceNode).name ?? "Video" } : null}
            selected={selected}
            onSelect={setSelected}
            versionCount={versions.length}
          />
          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 w-[44%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {sourceNode && selected === sourceNode.id ? (
                <ConnectedDetailView node={{ id: sourceNode.id, type: "video-gen", label: nodeLabel(sourceNode).name ?? "Video", fileUrl: sourceUrl ?? undefined } as never} />
              ) : selected === "history" ? (
                <div className="px-6 py-5">
                  {loading ? <Skeleton className="h-24 w-full rounded-xl" /> : versions.length ? (
                    <DubbingVersionHistory versions={versions} activeVersionId={activeVersionId} onRestore={(id) => void restore(id)} restoring={restoring} />
                  ) : <p className="text-sm text-muted-foreground">No dubs yet. Every dub shows up here.</p>}
                </div>
              ) : (
                <DubbingControls
                  language={lang}
                  onLanguageChange={(l) => onPatch({ language: l })}
                  sourceSeconds={sourceSeconds}
                  hasSource={Boolean(sourceNode && sourceUrl)}
                  activeDub={active?.dubbing ?? null}
                  running={running}
                  editable={editable}
                  onDub={onDub}
                  onLipSync={onLipSync}
                />
              )}
            </div>
            <DubbingPlayer dub={active?.dubbing ?? null} sourceUrl={sourceUrl} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
Before using them, confirm: `nodeLabel`'s return shape (`describe-node.ts`), `ConnectedPreview`'s fields (`connected-inputs-card.tsx`, and whether it renders a video for `video-gen` — if not, extend its `isImage`/video check so a `video-gen` preview shows the take), and where Video Gen keeps its duration in node data (`params.duration` vs `durationSeconds`; `durationOfParams` reads `durationSeconds`, `duration`, `seconds`). The server re-reads the real duration from the version; the client figure is only the estimate.

`src/components/nodes/dubbing-node.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useNodeCost } from "@/hooks/use-node-cost";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { dubLanguageLabel, furthestStage, readDubbingOutput, stageUrl, type DubbingOutput } from "@/lib/dubbing/types";
import type { DubbingNodeData } from "@/lib/canvas-nodes";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { DubbingFocusView } from "./dubbing-focus-view";

function stateWord(dub: DubbingOutput | null, running: string | null): string {
  if (running === "dub") return "Dubbing…";
  if (running === "lipsync") return "Lip-syncing…";
  if (!dub) return "Not dubbed";
  return dub.lipSynced ? "Lip-synced" : "Dubbed";
}

// D374 — the Dubbing card: the furthest stage of the active dub, its language and state.
// No query or channel of its own (performance rule 1): status comes from the canvas feed.
export function DubbingNode({ id, data, selected }: NodeProps) {
  const d = data as DubbingNodeData;
  const dub = readDubbingOutput(d.parsed);
  const url = dub ? stageUrl(dub, furthestStage(dub)) : null;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const deleteNode = useDeleteNode();
  const totalCredits = useNodeCost(id);
  const status = useGenerationStatus(id);
  const [focusOpen, setFocusOpen] = useState(false);

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
          className={cn(
            "w-[320px] rounded-lg border border-border bg-card shadow-card",
            "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader icon={Languages} nodeId={id} nodeType="dubbing" title={d.title ?? ""} placeholder="Dubbing" onCommitTitle={(t) => updateNodeData(id, { title: t })} />
          <div className="flex flex-col gap-2 px-3 py-3">
            {url && (
              <div className="overflow-hidden rounded-md border border-border bg-black">
                <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="aspect-video w-full object-contain" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {dub ? `${dubLanguageLabel(dub.language)} · ` : ""}{stateWord(dub, status.runningKind)}
              </span>
              <Button variant="ghost" onClick={() => setFocusOpen(true)} className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary">
                Open ↗
              </Button>
            </div>
          </div>
          <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(dub)} />
          <Handle type="target" position={Position.Left} className="!size-4 !border-2 !border-card !bg-muted-foreground" />
        </div>
      </NodeContextMenu>

      <DubbingFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        language={d.language}
        onPatch={(patch) => updateNodeData(id, patch)}
      />
    </>
  );
}
```
Hook the usage popover into the card the way Video Gen does: read `video-gen-node.tsx` for where `VideoGenUsagePopover` mounts (it needs the versions list, so it is mounted inside the focus view or behind a click; do **not** load versions per card on mount — rule 1). If Video Gen loads them only when the popover opens, do the same with `useNodeVersions(id, popoverOpen)` and pass the connected video's id as `upstreamNodeIds`.

`src/components/canvas/canvas.tsx`: `import { DubbingNode } from "@/components/nodes/dubbing-node";` and `dubbing: DubbingNode,` in `nodeTypes`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/components/nodes/__tests__/dubbing-controls.test.tsx` → PASS
Run: `npx tsc --noEmit -p .` → no errors
Run: `npx eslint src/components/nodes/dubbing-*.tsx src/hooks/use-dubbing-versions.ts` → clean

- [ ] **Step 5: Commit**

```bash
git add src/components src/hooks/use-dubbing-versions.ts
git commit -m "feat(dubbing): Dubbing node card and focus view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Env, deploy notes, end-to-end check

**Files:**
- Modify: `.env.example`, `docs/auth-production-migration.md` (append a section, per the "keep migration doc in sync" rule)

- [ ] **Step 1: Env example**

Append to `.env.example` next to `ELEVEN_LABS_API_KEY=`:
```
# Dubbing node (D376): Sarvam dubbing + sync lip sync via fal. Set in Vercel AND both Trigger.dev projects.
SARVAM_API_KEY=
FAL_KEY=
```

- [ ] **Step 2: Deploy notes** — append to `docs/auth-production-migration.md`:
```markdown
## Dubbing node (D374–D377) — no migration, but deploy order and env matter (2026-10-15)

New generation types `dub` and `lipsync` (`generations.type` is free text; no schema change) and
two Trigger.dev tasks, `video-dub` and `video-lip-sync`.

**Ordering:**

1. **Set the keys in both Trigger.dev projects' env** (staging and production) **and in Vercel**:
   `SARVAM_API_KEY`, `FAL_KEY`. The routes refuse with "Dubbing isn't set up yet." without them.
2. **Deploy the Trigger.dev tasks before the app** (`npm run deploy:trigger`). The app triggers
   `video-dub` / `video-lip-sync` by id; app first means every start fails and is refunded.
3. Then deploy the app.

**Verify after deploying:**

```sql
-- expect 0: no dub or lip sync running for more than 20 minutes (runs give up at 12)
select count(*) from generations
where type in ('dub', 'lipsync') and status = 'running' and created_at < now() - interval '20 minutes';
```
```

- [ ] **Step 3: End-to-end on staging data (dev servers)**

Run: `npm run dev` (Next + Trigger dev). On a canvas with a finished Video Gen take (≤ 60 s, English speech):
1. Press **B**, wire the Video Gen node into the new Dubbing node. A second Video Gen wire must be refused.
2. Open it: pick **Tamil**, click **Dub**. The card reads "Dubbing…", the tray shows a **Dub** row; on finish the toast "Dub ready" appears, the player shows **Dubbed**, History has v1 with Original ✓ Dubbed ✓.
3. Click **Lip sync**. On finish: "Lip sync ready", the player jumps to **Lip-synced**, History v1 shows all three; click **Lip sync again** — still one version, lip-synced replaced.
4. **Dub** again in Hindi → v2. Restore v1 from History → player shows the Tamil dub.
5. Usage popover: v1 = dub + lip sync ×2 credits summed; v2 = dub only.
6. Check the Trigger run logs: exactly one Sarvam `create`/`start` per dub and one fal submit per lip sync. Confirm a failed run's `onFailure` posts the plain message (Task 6 note on `instanceof`).
7. Confirm the Sarvam live/export responses parsed (no "unexpected body" errors) and the dubbed mp3 is what lip sync used.

- [ ] **Step 4: Run every touched test directory**

Run: `npx vitest run src/lib/dubbing src/lib/sarvam src/lib/fal src/lib/generations src/lib/storage src/lib/db src/services "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync" src/lib/canvas-nodes.test.ts src/lib/canvas-node-options.test.ts src/lib/generation-tray.test.ts src/components/nodes/__tests__/dubbing-controls.test.tsx`
Expected: PASS. Then `npx tsc --noEmit -p .` and `npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/auth-production-migration.md
git commit -m "docs(dubbing): env keys and deploy order for the Dubbing node

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
