# Model catalog 2b-i — the remaining charged prices and provider bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dub, lip sync, voice change, transcribe and prompt runs reserve and settle with dated price rows like video and image already do, Kling and ElevenLabs runs are charged from what the provider reports it billed, and the code price constants for these services are deleted.

**Architecture:** Five service models (`sarvam:dub`, `fal:lipsync-2-pro`, `elevenlabs:eleven_multilingual_sts_v2`, `elevenlabs:scribe_v2`, `openai:gpt-5.4-mini`) are seeded into `ai_models` (migration 0079). Their prices, plus a new dated row for each Kling model that adds a `provider_unit` line, are seeded into `ai_model_prices` (migration 0080) by a builder that calls today's code functions, proven equal by an equivalence test before any caller switches. A pure module (`service-price.ts`) prices each service's estimate and charge from a row. Every route reserves with the row and records `model_price_id`; every completion charges with the recorded row through `priceForGeneration`, using the provider's own figure when it sent one (Kling units, ElevenLabs `character-cost`, ElevenLabs speech-to-text `fiat-cost-before-overages`) and storing it in `generations.provider_bill`. Browser estimates read the same rows through `useModelPrice`. Last, the constants are deleted and 0080 is frozen behind a snapshot test.

**Tech Stack:** Next.js route handlers, Trigger.dev tasks, Supabase Postgres, Zod 4, Vitest 4, TanStack Query 5.

**Spec:** `docs/superpowers/specs/2026-11-21-model-catalog-design.md` (D552–D556), D557 (video and image prices). New decisions D558–D559 are recorded in Task 10.

**Continues in:** `docs/superpowers/plans/2026-11-22-model-catalog-2b-record-only.md` (2b-ii, the features that record their cost without charging credits).

## Global Constraints

- Migration numbers: **0079** (service models), **0080** (service prices and Kling unit rows). 0076–0078 exist; other branches top out at 0075 / 0065.
- Decision numbers: **D558** (services and provider bills from rows), **D559** (prompt runs charge real token cost; the flat amount is the estimate). D557 is the last used here; other branches top out at D527 / D513.
- One price row from reserve to settle: a route resolves `priceForNewRun(modelId)` once, uses it for the reservation and records it as `modelPriceId`; completion uses `priceForGeneration(generation)`.
- A model with no price row is refused before anything is recorded, with `NO_PRICE_MESSAGE` ("This model has no price set, so it can't run right now.") and HTTP 409.
- A delivered, provider-billed output is never charged 0 because a price is missing: settle at the reserved amount (`reservedAmountForUnpriced`) and record `costUsd` as null.
- Refund behaviour on failure is unchanged.
- Nothing per item: one catalog read per screen (`useAiCatalog`), no per-node queries.
- Browser data through the three TanStack layers; shadcn primitives only; plain user-facing copy (no vendor names, no raw errors).
- Every migration gets its entry in `docs/auth-production-migration.md` in the same commit.
- Commits carry no AI attribution lines.
- Migrations are applied by hand in the Supabase SQL editor. The implementer applies none and connects to no database.
- ElevenLabs Creator plan: **$22 for 121,000 credits**, so **$0.000182 per credit**. Kling: **$0.1508 per unit**.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/ai-models/service-models.ts` | the five service model ids and their `ai_models` seed rows |
| `src/lib/ai-models/service-price.ts` | estimate and charge for dub, lip sync, voice change, transcribe, prompt, from a row |
| `src/lib/ai-models/seeds/service-price-rows.ts` | builds 0080's rows from today's code constants (deleted in Task 10) |
| `src/lib/ai-models/price-sql.ts` | turns price rows into a seed migration's SQL |
| `src/lib/ai-models/seed.ts` | `seedSql` gains an optional header (0077's output unchanged) |
| `src/lib/ai-models/types.ts` | `ProviderBill` type |
| `src/lib/ai-models/test-prices.ts` | reads 0078 and 0080 |
| `src/lib/video-gen/provider-usage.ts` | `KlingUsage` and its reader |
| `src/lib/ai-models/video-price.ts` | Kling usage priced on `provider_unit` |
| `src/lib/video-gen/providers/kling.ts` | returns the task's billed units |
| `src/lib/elevenlabs/client.ts` | `speechToSpeech` returns the audio and `character-cost` |
| `src/lib/transcribe/elevenlabs.ts`, `src/lib/transcribe/run.ts` | speech-to-text returns and sums `fiat-cost-before-overages` |
| `src/lib/db/generations.ts` | `succeedGeneration` writes `provider_bill` |
| routes and completions | switch to rows (Tasks 5–9) |
| `supabase/migrations/0079_ai_service_models.sql`, `0080_ai_service_prices.sql` | generated |

Tests live beside each module in `__tests__/`.

---

### Task 1: The service models (migration 0079)

**Files:**
- Create: `src/lib/ai-models/service-models.ts`
- Modify: `src/lib/ai-models/seed.ts` (optional header on `seedSql`)
- Create: `src/lib/ai-models/__tests__/service-models.test.ts`
- Create (generated): `supabase/migrations/0079_ai_service_models.sql`
- Modify: `docs/auth-production-migration.md`

**Interfaces:**
- Consumes: `AiModelSeedRow`, `seedSql`, `SEED_JSON_TAG` from `./seed`; `parseAiModelRow` from `./schema`; `DUB_ENGINE`, `LIP_SYNC_ENGINE` from `@/lib/dubbing/providers`; `TRANSCRIBE_ENGINE` from `@/lib/transcribe/providers`; `VOICE_CHANGE_MODEL_ID` from `@/lib/elevenlabs/constants`.
- Produces:
  - `DUB_MODEL_ID = "sarvam:dub"`, `LIP_SYNC_MODEL_ID = "fal:lipsync-2-pro"`, `VOICE_CHANGE_PRICE_MODEL_ID = "elevenlabs:eleven_multilingual_sts_v2"`, `TRANSCRIBE_MODEL_ID = "elevenlabs:scribe_v2"`, `PROMPT_MODEL_ID = "openai:gpt-5.4-mini"`
  - `serviceModelRows(): AiModelSeedRow[]`
  - `AiModelSeedRow.kind` widened to `AiModelKind`; `seedSql(rows, header?)`

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/service-models.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  serviceModelRows, SERVICE_SEED_HEADER, DUB_MODEL_ID, LIP_SYNC_MODEL_ID,
  VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID,
} from "../service-models";
import { seedSql, SEED_JSON_TAG } from "../seed";
import { parseAiModelRow } from "../schema";
import { DUB_ENGINE, LIP_SYNC_ENGINE } from "@/lib/dubbing/providers";
import { TRANSCRIBE_ENGINE } from "@/lib/transcribe/providers";
import { VOICE_CHANGE_MODEL_ID } from "@/lib/elevenlabs/constants";

const FILE = resolve(process.cwd(), "supabase/migrations/0079_ai_service_models.sql");

describe("service models", () => {
  it("are the ids the routes record", () => {
    expect(DUB_MODEL_ID).toBe(DUB_ENGINE.modelUsed);
    expect(LIP_SYNC_MODEL_ID).toBe(LIP_SYNC_ENGINE.modelUsed);
    expect(TRANSCRIBE_MODEL_ID).toBe(TRANSCRIBE_ENGINE.modelUsed);
    expect(VOICE_CHANGE_PRICE_MODEL_ID).toBe(`elevenlabs:${VOICE_CHANGE_MODEL_ID}`);
    expect(PROMPT_MODEL_ID).toBe("openai:gpt-5.4-mini");
  });

  it("pass the catalog's row check, one per id, all live", () => {
    const rows = serviceModelRows();
    expect(rows.map((r) => r.id).sort()).toEqual(
      [DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID].sort(),
    );
    for (const row of rows) {
      const parsed = parseAiModelRow({ ...row, description: null, provider_model_id: null, updated_at: "2026-11-23T00:00:00Z" });
      expect(parsed, row.id).not.toBeNull();
      expect(parsed!.status).toBe("live");
    }
  });
});

describe("migration 0079 (service models)", () => {
  it("matches serviceModelRows", () => {
    const rows = serviceModelRows();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, seedSql(rows, SERVICE_SEED_HEADER));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
    expect(sql).toBe(seedSql(rows, SERVICE_SEED_HEADER));
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run (Git Bash, uppercase C): `cd "C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-asset-pipeline" && npx vitest run src/lib/ai-models/__tests__/service-models.test.ts`
Expected: FAIL — cannot find `../service-models`.

- [ ] **Step 3: Give `seedSql` an optional header**

In `src/lib/ai-models/seed.ts`, change the `AiModelSeedRow` kind and `seedSql`:

```ts
import type { AiModelKind } from "./types";
```

```ts
export type AiModelSeedRow = {
  id: string;
  provider: string;
  kind: AiModelKind;
```

```ts
const DEFAULT_SEED_HEADER = [
  "-- D552: today's image and video models, from the TypeScript registries.",
  "-- Generated by src/lib/ai-models/seed.ts. Regenerate with:",
  "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/seed-migration.test.ts",
];

export function seedSql(rows: AiModelSeedRow[], header: string[] = DEFAULT_SEED_HEADER): string {
```

and replace the three hard-coded header lines inside `seedSql`'s returned array with `...header,`. 0077's drift test must still pass unchanged (the default header is the same three lines).

- [ ] **Step 4: Write `service-models.ts`**

```ts
// D558 — the services that bill per run but aren't image or video models: their ids, as the
// routes record them, and their ai_models rows (migration 0079). Client-safe.
import { DUB_ENGINE, LIP_SYNC_ENGINE } from "@/lib/dubbing/providers";
import { TRANSCRIBE_ENGINE } from "@/lib/transcribe/providers";
import { VOICE_CHANGE_MODEL_ID } from "@/lib/elevenlabs/constants";
import type { AiModelSeedRow } from "./seed";

export const DUB_MODEL_ID = DUB_ENGINE.modelUsed;
export const LIP_SYNC_MODEL_ID = LIP_SYNC_ENGINE.modelUsed;
export const TRANSCRIBE_MODEL_ID = TRANSCRIBE_ENGINE.modelUsed;
/** A voice change's generation records the video's model; its price row is this one. */
export const VOICE_CHANGE_PRICE_MODEL_ID = `elevenlabs:${VOICE_CHANGE_MODEL_ID}`;
/** The text model every prompt node writes with. */
export const PROMPT_MODEL_ID = "openai:gpt-5.4-mini";

export const SERVICE_SEED_HEADER = [
  "-- D558: the services that bill per run (dub, lip sync, voice change, transcribe, prompt writing).",
  "-- Generated by src/lib/ai-models/service-models.ts. Regenerate with:",
  "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/service-models.test.ts",
];

const row = (
  id: string, provider: string, kind: AiModelSeedRow["kind"], label: string, providerLabel: string,
  sortOrder: number,
): AiModelSeedRow => ({
  id, provider, kind, label, picker_label: null, provider_label: providerLabel, status: "live",
  replaced_by: null, sort_order: sortOrder, adapter_key: `${kind}:${provider}`,
  params: [], rules: [], capabilities: {},
});

export function serviceModelRows(): AiModelSeedRow[] {
  return [
    row(DUB_MODEL_ID, "sarvam", "dub", "Dub", "Sarvam", 0),
    row(LIP_SYNC_MODEL_ID, "fal", "lipsync", "Lip sync", "fal", 0),
    row(VOICE_CHANGE_PRICE_MODEL_ID, "elevenlabs", "voice", "Voice change", "ElevenLabs", 0),
    row(TRANSCRIBE_MODEL_ID, "elevenlabs", "transcribe", "Auto captions", "ElevenLabs", 0),
    row(PROMPT_MODEL_ID, "openai", "text", "Prompt writing", "OpenAI", 0),
  ];
}
```

- [ ] **Step 5: Generate 0079 and check**

Run: `UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/service-models.test.ts` (PowerShell: `$env:UPDATE_SEED="1"; npx vitest run …; Remove-Item Env:UPDATE_SEED`)
Then without the variable: `npx vitest run src/lib/ai-models`
Expected: PASS, including the unchanged 0077 drift test.

- [ ] **Step 6: Migration doc entry**

Append to `docs/auth-production-migration.md` (keep its CRLF endings, one blank line before the heading):

````markdown
## Migrations 0079 + 0080 — service prices and provider bills (D558–D559, 2026-11-23)

`supabase/migrations/0079_ai_service_models.sql` (five service models in `ai_models`) and
`supabase/migrations/0080_ai_service_prices.sql` (their prices, plus a dated row per Kling model
that adds the price per Kling unit). Paste each into the Supabase SQL editor → Run, in order,
after 0076–0078.

**Ordering:** apply both **before** the 2b code deploys to an environment. Without them every dub,
lip sync, voice change, auto-captions run and prompt run is refused with "This model has no price
set, so it can't run right now."

**Safe to re-run:** both insert with `on conflict … do nothing`.

**Verify after running:**

```sql
-- expect 5
select count(*) from ai_models where kind in ('dub','lipsync','voice','transcribe','text');
-- expect 8 (5 services + 3 Kling unit rows)
select count(*) from ai_model_prices where effective_from > '2026-01-01';
```
````

(Task 3 corrects the second count if the builder makes a different number.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai-models/service-models.ts src/lib/ai-models/seed.ts src/lib/ai-models/__tests__/service-models.test.ts supabase/migrations/0079_ai_service_models.sql docs/auth-production-migration.md
git commit -m "feat(credits): the per-run services join the model catalog (migration 0079, D558)"
```

---

### Task 2: Service estimate and charge from a price row

**Files:**
- Create: `src/lib/ai-models/service-price.ts`
- Create: `src/lib/ai-models/__tests__/service-price.test.ts`
- Modify: `src/lib/ai-models/types.ts` (`ProviderBill`)

**Interfaces:**
- Consumes: `priceMeters`, `lineFor` from `./pricing`; `AiModelPrice`, `Meter` from `./types`.
- Produces (all return `null` when the row can't price the run):
  - `type ProviderBill = { source: "provider_charge" | "provider_usage" | "request"; meters: Partial<Record<Meter, number>>; raw?: unknown }`
  - `dubUsd(price, seconds): number | null` — whole seconds, `audio_second`
  - `lipSyncUsd(price, seconds): number | null` — `video_second`
  - `voiceChangeEstimateUsd(price, seconds, priceMultiplier): number | null` — `audio_second × multiplier`
  - `voiceChangeCharge(price, { characterCost, seconds, priceMultiplier }): { usd: number; bill: ProviderBill } | null`
  - `transcribeEstimateUsd(price, seconds): number | null`
  - `transcribeCharge(price, { providerUsd, seconds }): { usd: number; bill: ProviderBill } | null`
  - `promptEstimateCredits(price, attachmentCount): number | null` — from `estimate.estimate_credits_base` + `estimate_credits_per_attachment × n`
  - `promptCharge(price, usage): { usd: number; bill: ProviderBill } | null` — `input_token` (uncached prompt), `cached_input_token`, `text_output_token` (completion, reasoning included)

- [ ] **Step 1: Write the failing test**

`src/lib/ai-models/__tests__/service-price.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  dubUsd, lipSyncUsd, voiceChangeEstimateUsd, voiceChangeCharge, transcribeEstimateUsd,
  transcribeCharge, promptEstimateCredits, promptCharge,
} from "../service-price";
import type { AiModelPrice } from "../types";

const row = (lines: AiModelPrice["lines"], estimate: Record<string, number> = {}): AiModelPrice => ({
  id: "p", modelId: "m", effectiveFrom: "2026-01-01T00:00:00Z", lines, estimate, sourceUrl: null, note: null,
});

describe("dub and lip sync", () => {
  it("bills a dub per whole second of source", () => {
    const p = row([{ meter: "audio_second", unit_usd: 0.01 }]);
    expect(dubUsd(p, 10.2)).toBeCloseTo(0.11, 10);
  });
  it("bills lip sync per second", () => {
    expect(lipSyncUsd(row([{ meter: "video_second", unit_usd: 0.1 }]), 6)).toBeCloseTo(0.6, 10);
  });
  it("is null when the row has no line for the meter", () => {
    expect(dubUsd(row([{ meter: "video_second", unit_usd: 1 }]), 5)).toBeNull();
  });
});

describe("voice change", () => {
  const p = row([{ meter: "audio_second", unit_usd: 0.002 }, { meter: "provider_credit", unit_usd: 0.000182 }]);
  it("estimates seconds × the voice's multiplier", () => {
    expect(voiceChangeEstimateUsd(p, 30, 2)).toBeCloseTo(0.12, 10);
  });
  it("charges ElevenLabs' reported credits when it sent them", () => {
    const c = voiceChangeCharge(p, { characterCost: 30, seconds: 3, priceMultiplier: 1 })!;
    expect(c.usd).toBeCloseTo(30 * 0.000182, 10);
    expect(c.bill).toEqual({ source: "provider_charge", meters: { provider_credit: 30 } });
  });
  it("falls back to the seconds without a reported cost", () => {
    const c = voiceChangeCharge(p, { characterCost: null, seconds: 30, priceMultiplier: 2 })!;
    expect(c.usd).toBeCloseTo(0.12, 10);
    expect(c.bill.source).toBe("request");
  });
});

describe("transcribe", () => {
  const p = row([{ meter: "audio_second", unit_usd: 0.0001 }, { meter: "usd", unit_usd: 1 }]);
  it("estimates by seconds", () => expect(transcribeEstimateUsd(p, 60)).toBeCloseTo(0.006, 10));
  it("charges the dollars ElevenLabs reported", () => {
    const c = transcribeCharge(p, { providerUsd: 0.0176, seconds: 3 })!;
    expect(c.usd).toBeCloseTo(0.0176, 10);
    expect(c.bill).toEqual({ source: "provider_charge", meters: { usd: 0.0176 } });
  });
  it("falls back to the seconds", () => {
    expect(transcribeCharge(p, { providerUsd: null, seconds: 60 })!.usd).toBeCloseTo(0.006, 10);
  });
});

describe("prompt", () => {
  const p = row(
    [
      { meter: "input_token", unit_usd: 0.00000075 },
      { meter: "cached_input_token", unit_usd: 0.000000075 },
      { meter: "text_output_token", unit_usd: 0.0000045 },
    ],
    { estimate_credits_base: 5, estimate_credits_per_attachment: 2.5 },
  );
  it("estimates the flat base plus each attachment, in credits", () => {
    expect(promptEstimateCredits(p, 0)).toBe(5);
    expect(promptEstimateCredits(p, 3)).toBe(12.5);
  });
  it("is null without the estimate keys", () => {
    expect(promptEstimateCredits(row([]), 1)).toBeNull();
  });
  it("charges uncached input, cached input and output at their own rates", () => {
    const c = promptCharge(p, {
      prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766,
      prompt_tokens_details: { cached_tokens: 3968 },
    })!;
    expect(c.usd).toBeCloseTo((8606 - 3968) * 0.00000075 + 3968 * 0.000000075 + 160 * 0.0000045, 12);
    expect(c.bill).toEqual({
      source: "provider_usage",
      meters: { input_token: 4638, cached_input_token: 3968, text_output_token: 160 },
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/service-price.test.ts`
Expected: FAIL — cannot find `../service-price`.

- [ ] **Step 3: Add `ProviderBill` to `types.ts`**

```ts
/** D554 — what a provider reported for one run, as meters, and its own block verbatim. */
export type ProviderBill = {
  source: "provider_charge" | "provider_usage" | "request";
  meters: Partial<Record<Meter, number>>;
  raw?: unknown;
};
```

- [ ] **Step 4: Write `service-price.ts`**

```ts
// D558 — the per-run services' estimate and charge, from a price row. Client-safe: the dub, lip
// sync, voice, captions and prompt panels price their estimate with these too.
import { priceMeters } from "./pricing";
import type { AiModelPrice, ProviderBill } from "./types";

type Meters = ProviderBill["meters"];

function priced(price: AiModelPrice, meters: Meters): number | null {
  const r = priceMeters(price, meters);
  return r.unpriced.length ? null : r.usd;
}

/** Sarvam bills per whole second of source, one target language. */
export function dubUsd(price: AiModelPrice, seconds: number): number | null {
  return priced(price, { audio_second: Math.ceil(seconds) });
}

export function lipSyncUsd(price: AiModelPrice, seconds: number): number | null {
  return priced(price, { video_second: seconds });
}

/** ElevenLabs bills by audio length, times the voice's custom-rate multiplier. */
export function voiceChangeEstimateUsd(price: AiModelPrice, seconds: number, priceMultiplier: number): number | null {
  return priced(price, { audio_second: seconds * priceMultiplier });
}

export function voiceChangeCharge(
  price: AiModelPrice,
  a: { characterCost: number | null; seconds: number; priceMultiplier: number },
): { usd: number; bill: ProviderBill } | null {
  if (a.characterCost !== null && a.characterCost > 0) {
    const usd = priced(price, { provider_credit: a.characterCost });
    if (usd !== null) return { usd, bill: { source: "provider_charge", meters: { provider_credit: a.characterCost } } };
  }
  const meters: Meters = { audio_second: a.seconds * a.priceMultiplier };
  const usd = priced(price, meters);
  return usd === null ? null : { usd, bill: { source: "request", meters } };
}

export function transcribeEstimateUsd(price: AiModelPrice, seconds: number): number | null {
  return priced(price, { audio_second: seconds });
}

export function transcribeCharge(
  price: AiModelPrice,
  a: { providerUsd: number | null; seconds: number },
): { usd: number; bill: ProviderBill } | null {
  if (a.providerUsd !== null && a.providerUsd > 0) {
    const usd = priced(price, { usd: a.providerUsd });
    if (usd !== null) return { usd, bill: { source: "provider_charge", meters: { usd: a.providerUsd } } };
  }
  const meters: Meters = { audio_second: a.seconds };
  const usd = priced(price, meters);
  return usd === null ? null : { usd, bill: { source: "request", meters } };
}

/** D559 — a prompt run's estimate stays the flat amount it has always been, in credits. */
export function promptEstimateCredits(price: AiModelPrice, attachmentCount: number): number | null {
  const base = price.estimate.estimate_credits_base;
  const per = price.estimate.estimate_credits_per_attachment;
  if (base === undefined || per === undefined) return null;
  return base + per * attachmentCount;
}

type PromptUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
};

/** D559 — a prompt run is charged what OpenAI billed: uncached input, cached input, output. */
export function promptCharge(price: AiModelPrice, usage: PromptUsage): { usd: number; bill: ProviderBill } | null {
  const cached = Math.max(0, Math.min(usage.prompt_tokens, usage.prompt_tokens_details?.cached_tokens ?? 0));
  const meters: Meters = {
    input_token: usage.prompt_tokens - cached,
    ...(cached > 0 ? { cached_input_token: cached } : {}),
    text_output_token: usage.completion_tokens,
  };
  const usd = priced(price, meters);
  return usd === null ? null : { usd, bill: { source: "provider_usage", meters } };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/ai-models`
Expected: PASS (13 new cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/service-price.ts src/lib/ai-models/types.ts src/lib/ai-models/__tests__/service-price.test.ts
git commit -m "feat(credits): service estimates and charges from a price row (D558)"
```

---

### Task 3: Service price rows, Kling unit rows (migration 0080) and the equivalence test

**Files:**
- Create: `src/lib/ai-models/price-sql.ts`
- Create: `src/lib/ai-models/seeds/service-price-rows.ts`
- Create: `src/lib/ai-models/__tests__/service-price-equivalence.test.ts`
- Create (generated): `supabase/migrations/0080_ai_service_prices.sql`
- Modify: `src/lib/ai-models/test-prices.ts` (read 0078 and 0080)
- Modify: `docs/auth-production-migration.md` (count, if it differs)

**Interfaces:**
- Consumes: today's `computeDubCost`, `computeLipSyncCost` (`@/lib/dubbing/cost`), `computeVoiceChangeCost` (`@/lib/elevenlabs/cost`), `transcribeCostUsd` (`@/lib/transcribe/cost`), `PROMPT_ESTIMATE_BASE_CREDITS`, `PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS` (`@/lib/credits/prompt-estimate`), `MODEL_PRICING` (`@/lib/pricing`); `seededCatalog` (0078) from `../test-prices`; service ids from `../service-models`.
- Produces:
  - `type AiModelPriceSeedRow = { model_id; effective_from; lines; estimate; source_url: string | null; note: string }`
  - `priceSql(rows, header): string` (same SQL shape as 0078, `on conflict (model_id, effective_from) do nothing`)
  - `servicePriceRows(): AiModelPriceSeedRow[]` (5 service rows at `2026-01-01T00:00:00.000Z`, plus one row per Kling model at `KLING_UNIT_FROM = "2026-11-23T00:00:00.000Z"` = its 0078 lines + `{ meter: "provider_unit", unit_usd: 0.1508 }`)
  - `seededCatalog()` now holds 0078 + 0080 rows.

- [ ] **Step 1: Write the failing equivalence test**

`src/lib/ai-models/__tests__/service-price-equivalence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { servicePriceRows, SERVICE_PRICE_HEADER, KLING_UNIT_FROM } from "../seeds/service-price-rows";
import { priceSql } from "../price-sql";
import { SEED_JSON_TAG } from "../seed";
import { parseAiModelPriceRow } from "../schema";
import { dubUsd, lipSyncUsd, voiceChangeEstimateUsd, transcribeEstimateUsd, promptEstimateCredits, promptCharge } from "../service-price";
import { videoChargeUsd } from "../video-price";
import { usdToFinalCredits } from "@/lib/credits/units";
import { computeDubCost, computeLipSyncCost } from "@/lib/dubbing/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { transcribeCostUsd } from "@/lib/transcribe/cost";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { computeCost } from "@/lib/pricing";
import { DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID } from "../service-models";
import type { AiModelPrice } from "../types";

const FILE = resolve(process.cwd(), "supabase/migrations/0080_ai_service_prices.sql");
const rows = servicePriceRows();
const asPrice = (modelId: string, from = "2026-01-01T00:00:00.000Z"): AiModelPrice => {
  const r = rows.find((x) => x.model_id === modelId && x.effective_from === from)!;
  return parseAiModelPriceRow({ id: `${modelId}@${from}`, ...r })!;
};
const same = (a: number | null, b: number | null) => {
  if (a === null || b === null) return expect(a).toBe(b);
  expect(a).toBeCloseTo(b, 10);
  expect(usdToFinalCredits(a)).toBe(usdToFinalCredits(b));
};
const SECONDS = [0.4, 1, 3, 9.6, 30, 61, 600];

describe("seeded service rows price exactly what the code does", () => {
  it("every row passes the catalog's check", () => {
    for (const r of rows) expect(parseAiModelPriceRow({ id: "x", ...r }), r.model_id).not.toBeNull();
  });
  it("dub", () => { for (const s of SECONDS) same(dubUsd(asPrice(DUB_MODEL_ID), s), computeDubCost(s).usd); });
  it("lip sync", () => { for (const s of SECONDS) same(lipSyncUsd(asPrice(LIP_SYNC_MODEL_ID), s), computeLipSyncCost(s).usd); });
  it("voice change, every multiplier", () => {
    for (const s of SECONDS) for (const m of [1, 1.5, 2, 3]) {
      same(voiceChangeEstimateUsd(asPrice(VOICE_CHANGE_PRICE_MODEL_ID), s, m), computeVoiceChangeCost(s, m).usd);
    }
  });
  it("transcribe", () => { for (const s of SECONDS) same(transcribeEstimateUsd(asPrice(TRANSCRIBE_MODEL_ID), s), transcribeCostUsd(s)); });
  it("prompt estimate keeps the flat credits", () => {
    for (const n of [0, 1, 2, 5]) expect(promptEstimateCredits(asPrice(PROMPT_MODEL_ID), n)).toBe(estimatePromptCredits(n));
  });
  it("prompt charge equals today's token cost when nothing was cached", () => {
    const usage = { prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766 };
    same(promptCharge(asPrice(PROMPT_MODEL_ID), usage)!.usd, computeCost(PROMPT_MODEL_ID, usage)!.usd);
  });
  it("Kling unit rows keep 0078's per-second lines and add $0.1508 a unit", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1", "kling:kling-3-0-omni"]) {
      const p = asPrice(id, KLING_UNIT_FROM);
      expect(p.lines.find((l) => l.meter === "provider_unit")?.unit_usd).toBe(0.1508);
      const c = videoChargeUsd(p, { usage: { kind: "kling", units: 6.4 }, durationSeconds: 8, audioEnabled: false, resolution: "720p" });
      expect(c?.source).toBe("provider_usage");
      expect(c?.usd).toBeCloseTo(6.4 * 0.1508, 10);
    }
  });
});

describe("migration 0080", () => {
  it("matches servicePriceRows", () => {
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, priceSql(rows, SERVICE_PRICE_HEADER));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(priceSql(rows, SERVICE_PRICE_HEADER));
    const sql = readFileSync(FILE, "utf8");
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
```

Note: the Kling case uses `{ kind: "kling", units }`, which Task 4 adds. Until Task 4 lands, that one case fails to compile; implement Task 3 with `it.todo("Kling unit rows …")` in its place and restore the full case in Task 4, Step 6. Every other case must pass in this task.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ai-models/__tests__/service-price-equivalence.test.ts`
Expected: FAIL — cannot find `../seeds/service-price-rows`.

- [ ] **Step 3: Write `price-sql.ts`**

```ts
// D558 — a price seed migration's SQL, the same shape as 0078.
import { SEED_JSON_TAG } from "./seed";
import type { PriceLine } from "./types";

export type AiModelPriceSeedRow = {
  model_id: string;
  effective_from: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  source_url: string | null;
  note: string;
};

export function priceSql(rows: AiModelPriceSeedRow[], header: string[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols = "model_id, effective_from, lines, estimate, source_url, note";
  return [
    ...header,
    `insert into ai_model_prices (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  model_id text, effective_from timestamptz, lines jsonb, estimate jsonb, source_url text, note text",
    ")",
    "on conflict (model_id, effective_from) do nothing;",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Write `seeds/service-price-rows.ts`**

```ts
// D558 — 0080's rows, derived by calling today's code prices (never copying their numbers), so a
// typo can't change a price. Deleted with those constants in Task 10; 0080 is then frozen history.
// Test-only: reads 0078 for the Kling rows.
import { computeDubCost, computeLipSyncCost } from "@/lib/dubbing/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { transcribeCostUsd } from "@/lib/transcribe/cost";
import { PROMPT_ESTIMATE_BASE_CREDITS, PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS } from "@/lib/credits/prompt-estimate";
import { MODEL_PRICING } from "@/lib/pricing";
import { seededCatalog } from "../test-prices";
import { currentPrice } from "../pricing";
import { DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID } from "../service-models";
import type { AiModelPriceSeedRow } from "../price-sql";

export const SERVICE_EPOCH = "2026-01-01T00:00:00.000Z";
export const KLING_UNIT_FROM = "2026-11-23T00:00:00.000Z";
const KLING_USD_PER_UNIT = 0.1508;
/** ElevenLabs Creator plan: $22 for 121,000 credits. */
const ELEVENLABS_USD_PER_CREDIT = 0.000182;
const NOTE = "Seeded from the code prices (D558).";

export const SERVICE_PRICE_HEADER = [
  "-- D558: the per-run services' prices from the code, and a dated Kling row adding the price per unit.",
  "-- Generated by src/lib/ai-models/seeds/service-price-rows.ts. Regenerate with:",
  "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/service-price-equivalence.test.ts",
];

export function servicePriceRows(): AiModelPriceSeedRow[] {
  const perM = MODEL_PRICING["gpt-5.4-mini"];
  const services: AiModelPriceSeedRow[] = [
    { model_id: DUB_MODEL_ID, effective_from: SERVICE_EPOCH, estimate: {}, source_url: "https://www.sarvam.ai/api-pricing", note: NOTE,
      lines: [{ meter: "audio_second", unit_usd: computeDubCost(60).usd / 60 }] },
    { model_id: LIP_SYNC_MODEL_ID, effective_from: SERVICE_EPOCH, estimate: {}, source_url: "https://fal.ai/models/fal-ai/sync-lipsync/v2/pro", note: NOTE,
      lines: [{ meter: "video_second", unit_usd: computeLipSyncCost(60).usd / 60 }] },
    { model_id: VOICE_CHANGE_PRICE_MODEL_ID, effective_from: SERVICE_EPOCH, estimate: {}, source_url: "https://elevenlabs.io/pricing/api", note: NOTE,
      lines: [
        { meter: "audio_second", unit_usd: computeVoiceChangeCost(60, 1).usd / 60 },
        { meter: "provider_credit", unit_usd: ELEVENLABS_USD_PER_CREDIT },
      ] },
    { model_id: TRANSCRIBE_MODEL_ID, effective_from: SERVICE_EPOCH, estimate: {}, source_url: "https://elevenlabs.io/pricing/api", note: NOTE,
      lines: [
        { meter: "audio_second", unit_usd: transcribeCostUsd(3600) / 3600 },
        { meter: "usd", unit_usd: 1 },
      ] },
    { model_id: PROMPT_MODEL_ID, effective_from: SERVICE_EPOCH, source_url: "https://developers.openai.com/api/docs/pricing", note: NOTE,
      estimate: { estimate_credits_base: PROMPT_ESTIMATE_BASE_CREDITS, estimate_credits_per_attachment: PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS },
      lines: [
        { meter: "input_token", unit_usd: perM.inputPerM / 1_000_000 },
        { meter: "cached_input_token", unit_usd: perM.inputPerM / 10 / 1_000_000 },
        { meter: "text_output_token", unit_usd: perM.outputPerM / 1_000_000 },
      ] },
  ];
  const kling = ["kling:kling-3-0", "kling:kling-o1", "kling:kling-3-0-omni"].map((id): AiModelPriceSeedRow => {
    const base = currentPrice(seededCatalog(), id, new Date(KLING_UNIT_FROM))!;
    return {
      model_id: id, effective_from: KLING_UNIT_FROM, estimate: base.estimate, source_url: base.sourceUrl, note: "Adds the price per Kling unit (D558).",
      lines: [...base.lines, { meter: "provider_unit", unit_usd: KLING_USD_PER_UNIT }],
    };
  });
  return [...services, ...kling];
}
```

The cached-input rate is OpenAI's published 10% of the input rate for gpt-5.4-mini ($0.075 against $0.75 per million).

- [ ] **Step 5: Generate 0080, extend `test-prices.ts`, run**

Generate: `UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/service-price-equivalence.test.ts`

In `src/lib/ai-models/test-prices.ts`, read both migrations (0080 is read only once it exists, so the 0078-only Kling base read in the builder keeps working):

```ts
const MIGRATIONS = ["0078_ai_model_prices_seed.sql", "0080_ai_service_prices.sql"];

export function seededCatalog(): AiCatalog {
  if (catalog) return catalog;
  const prices = MIGRATIONS.flatMap((name) => {
    const file = resolve(process.cwd(), "supabase/migrations", name);
    if (!existsSync(file)) return [];
    const sql = readFileSync(file, "utf8");
    const rows = JSON.parse(sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG))) as
      Array<{ model_id: string; effective_from: string }>;
    return rows.map((row) => {
      const price = parseAiModelPriceRow({ id: `${row.model_id}@${row.effective_from}`, ...row });
      if (!price) throw new Error(`${name} row for ${row.model_id} fails the catalog's check`);
      return price;
    });
  });
  catalog = { models: [], prices };
  return catalog;
}
```

(add `existsSync` to the `node:fs` import). The builder reads Kling's base at `KLING_UNIT_FROM`; once 0080 exists that resolves to the 0080 row itself, so derive the base explicitly from 0078: change the builder's lookup to `currentPrice(seededCatalog(), id, new Date(new Date(KLING_UNIT_FROM).getTime() - 1))`.

Run: `npx vitest run src/lib/ai-models` (no env var). Expected: PASS except the Kling `todo`. Check `grep -c '"model_id"' supabase/migrations/0080_ai_service_prices.sql` → `8`; correct the migration doc's "expect 8" if it differs.

Also run the frozen price grid and frozen-prices tests: they must still pass (Kling's new row starts 23 Nov; the grid prices at 22 Nov).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-models/price-sql.ts src/lib/ai-models/seeds/service-price-rows.ts src/lib/ai-models/__tests__/service-price-equivalence.test.ts src/lib/ai-models/test-prices.ts supabase/migrations/0080_ai_service_prices.sql docs/auth-production-migration.md
git commit -m "feat(credits): seed service prices and the Kling unit price (migration 0080, D558)"
```

---

### Task 4: Provider bills — Kling units, ElevenLabs credits and dollars, `provider_bill` column

**Files:**
- Modify: `src/lib/video-gen/provider-usage.ts`, `src/lib/ai-models/video-price.ts`
- Modify: `src/lib/video-gen/providers/kling.ts`
- Modify: `src/lib/elevenlabs/client.ts`, `src/lib/voice-change/revoice.ts`, `trigger/video-voice-change.ts`, `trigger/avatar-voice-preview.ts`
- Modify: `src/lib/transcribe/elevenlabs.ts`, `src/lib/transcribe/run.ts`
- Modify: `src/lib/db/generations.ts` (`providerBill`)
- Tests: extend `src/lib/video-gen/__tests__/kling-provider.test.ts`, the `speechToSpeech`/revoice tests, `src/lib/transcribe/__tests__/*`, `src/lib/ai-models/__tests__/video-price.test.ts`, and restore the Kling equivalence case.

**Interfaces:**
- Produces:
  - `type KlingUsage = { kind: "kling"; units: number }`; `VideoProviderUsage = OmniUsage | SeedanceUsage | KlingUsage`; `normalizeKlingBilling(raw: unknown): KlingUsage | null` (sums `billing[].amount` where `charge_type === "unit"`); `readVideoUsage` accepts `{ kind: "kling", units }`.
  - `videoUsageMeters({ kind: "kling", units })` → `{ provider_unit: units }`.
  - Kling `generate` returns `usage` when the task reported units.
  - `speechToSpeech(args): Promise<{ audio: Buffer; characterCost: number | null }>` (reads the `character-cost` header).
  - `revoiceVideo` returns `{ driftMs, characterCost }`; the task posts `meta.voiceChange.characterCost`.
  - `transcribeUrl` returns `{ language, words, providerUsd: number | null }` (header `fiat-cost-before-overages`); `runTranscription` returns `{ result, secondsDone, providerUsd: number | null }` — the sum, or null if any finished file lacked the header.
  - `succeedGeneration({ …, providerBill?: ProviderBill | null })` writes `provider_bill`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/ai-models/__tests__/video-price.test.ts`:

```ts
it("prices Kling's billed units on provider_unit", () => {
  const p: AiModelPrice = { id: "k", modelId: "kling:kling-3-0", effectiveFrom: "2026-11-23T00:00:00Z", estimate: {}, sourceUrl: null, note: null,
    lines: [{ meter: "video_second", unit_usd: 0.084, when: { resolution: "720p", audio: false } }, { meter: "provider_unit", unit_usd: 0.1508 }] };
  const c = videoChargeUsd(p, { usage: { kind: "kling", units: 6.4 }, durationSeconds: 8, audioEnabled: false, resolution: "720p" })!;
  expect(c).toEqual({ usd: 6.4 * 0.1508, source: "provider_usage", meters: { provider_unit: 6.4 } });
});
```

Add to the Kling provider test (the task query mock) a succeeded task carrying `billing: [{ charge_type: "unit", amount: "6.4", package_type: "video" }]` and expect `result.usage` to equal `{ kind: "kling", units: 6.4 }`; and one without `billing` expecting no `usage` key.

Add to the ElevenLabs client test: a `fetchImpl` returning `new Response(new Uint8Array([1]), { headers: { "character-cost": "30" } })` → `speechToSpeech` resolves `{ audio: Buffer.from([1]), characterCost: 30 }`; no header → `characterCost: null`.

Add to the transcribe tests: `transcribeUrl` with a response carrying `fiat-cost-before-overages: 0.0176` returns `providerUsd: 0.0176`; `runTranscription` over two files with 0.01 and 0.02 returns `providerUsd` ≈ 0.03, and over one file with the header and one without returns `providerUsd: null`.

Add to `src/lib/db/__tests__` (the generations test that covers `succeedGeneration`): passing `providerBill` writes `provider_bill`; omitting it leaves the column untouched.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/ai-models src/lib/video-gen src/lib/elevenlabs src/lib/voice-change src/lib/transcribe src/lib/db`
Expected: the new cases FAIL (no `kling` kind, Buffer returned, no `providerUsd`).

- [ ] **Step 3: Implement the usage types and pricing**

In `src/lib/video-gen/provider-usage.ts`:

```ts
export type KlingUsage = { kind: "kling"; units: number };
export type VideoProviderUsage = OmniUsage | SeedanceUsage | KlingUsage;

/** D558 — Kling's task `billing` list: the units deducted for this task. */
export function normalizeKlingBilling(raw: unknown): KlingUsage | null {
  if (!Array.isArray(raw)) return null;
  let units = 0;
  for (const entry of raw) {
    const e = entry as { charge_type?: unknown; amount?: unknown };
    if (e.charge_type !== "unit") continue;
    const n = Number(e.amount);
    if (Number.isFinite(n) && n > 0) units += n;
  }
  return units > 0 ? { kind: "kling", units } : null;
}
```

and in `readVideoUsage` before the final `return null`:

```ts
  if (v.kind === "kling" && isCount(v.units)) return { kind: "kling", units: v.units };
```

In `src/lib/ai-models/video-price.ts` `videoUsageMeters`:

```ts
export function videoUsageMeters(usage: VideoProviderUsage): MeterQuantities {
  if (usage.kind === "omni") {
    return {
      input_token: usage.inputTokens,
      video_output_token: usage.videoOutputTokens,
      text_output_token: usage.textOutputTokens,
      thought_token: usage.thoughtTokens,
    };
  }
  if (usage.kind === "kling") return { provider_unit: usage.units };
  return { video_output_token: usage.completionTokens };
}
```

- [ ] **Step 4: Kling returns its units**

In `src/lib/video-gen/providers/kling.ts`, extend the task type and the success return:

```ts
type KlingTask = {
  id: string;
  status: "submitted" | "processing" | "succeeded" | "failed";
  message?: string;
  outputs?: KlingTaskOutput[];
  /** D558 — what Kling deducted for the task: units for a resource package. */
  billing?: unknown;
};
```

```ts
      const usage = normalizeKlingBilling(kTask.billing);
      return {
        videoUrl: video.url,
        durationSeconds: Number(video.duration ?? 0),
        ...(usage ? { usage } : {}),
      };
```

(import `normalizeKlingBilling` from `../provider-usage`). The fal transport reports no units and keeps returning no `usage`; it is charged by seconds.

- [ ] **Step 5: ElevenLabs reports its cost**

`src/lib/elevenlabs/client.ts`:

```ts
/** D558 — ElevenLabs' `character-cost` header: the credits this request deducted. */
function readCharacterCost(res: Response): number | null {
  const n = Number(res.headers.get("character-cost"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function speechToSpeech(
  args: { audio: Buffer; voiceId: string; settings?: VoiceChangeSettings },
  fetchImpl: typeof fetch = fetch,
): Promise<{ audio: Buffer; characterCost: number | null }> {
```

ending with:

```ts
  return { audio: Buffer.from(await res.arrayBuffer()), characterCost: readCharacterCost(res) };
```

`src/lib/voice-change/revoice.ts`: the dep type becomes `speechToSpeech: (args: …) => Promise<{ audio: Buffer; characterCost: number | null }>`; `revoiceVideo` returns `Promise<{ driftMs: number; characterCost: number | null }>`; inside, `const { audio: voiced, characterCost } = await deps.speechToSpeech(…)` (keep the try/catch), and the final return is `{ driftMs: Math.round(drift * 1000), characterCost }`.

`trigger/video-voice-change.ts`: `({ driftMs, characterCost } = await revoiceVideo(…))` (declare `let characterCost: number | null = null;`), and post `meta: { voiceChange: { driftMs, characterCost } }`. Log `characterCost` with the success line so a failed delivery can be completed by hand at what ElevenLabs billed.

`trigger/avatar-voice-preview.ts` (line ~74 passes `speechToSpeech` into the preview runner): update the runner's dependency type the same way and use `.audio` where it used the Buffer; carry `characterCost` into the preview's webhook meta under `voiceChange.characterCost` exactly as the voice-change task does.

- [ ] **Step 6: Speech-to-text reports its dollars**

`src/lib/transcribe/elevenlabs.ts`: `transcribeUrl` returns `Promise<{ language: string; words: TranscriptWord[]; providerUsd: number | null }>`; after a successful parse:

```ts
  const fiat = Number(res.headers.get("fiat-cost-before-overages"));
  return { ...parsed, providerUsd: Number.isFinite(fiat) && fiat > 0 ? fiat : null };
```

`src/lib/transcribe/run.ts`: track `let providerUsd: number | null = 0;`; after each saved file, `providerUsd = providerUsd === null || r.providerUsd === null ? null : providerUsd + r.providerUsd;`; return `{ result: { failed }, secondsDone, providerUsd: secondsDone > 0 ? providerUsd : null }`. Update the `Deps.transcribe` return type.

Restore the full Kling case in `service-price-equivalence.test.ts` (replace the `it.todo`).

- [ ] **Step 7: `succeedGeneration` writes the bill**

In `src/lib/db/generations.ts` add to the input type `providerBill?: ProviderBill | null;` (import the type from `@/lib/ai-models/types`) and to the update:

```ts
  if (input.providerBill !== undefined) update.provider_bill = input.providerBill;
```

- [ ] **Step 8: Run the tests and tsc**

Run: `npx vitest run src/lib/ai-models src/lib/video-gen src/lib/elevenlabs src/lib/voice-change src/lib/transcribe src/lib/db src/lib/avatars src/lib/generations` and `npx tsc --noEmit -p tsconfig.json`
Expected: PASS; only the known pre-existing tsc errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/video-gen/provider-usage.ts src/lib/ai-models/video-price.ts src/lib/video-gen/providers/kling.ts src/lib/elevenlabs/client.ts src/lib/voice-change/revoice.ts trigger/video-voice-change.ts trigger/avatar-voice-preview.ts src/lib/transcribe/elevenlabs.ts src/lib/transcribe/run.ts src/lib/db/generations.ts src/lib/ai-models/__tests__/service-price-equivalence.test.ts
git add <each changed test file>
git commit -m "feat(credits): Kling and ElevenLabs report what they billed (D558)"
```

(Stage the changed test files by their explicit paths.)

---

### Task 5: Dub and lip sync reserve and settle with their price row

**Files:**
- Modify: `src/app/api/nodes/[id]/dub/route.ts`, `src/app/api/nodes/[id]/lip-sync/route.ts`
- Modify: `src/lib/dubbing/complete.ts`, `src/lib/generations/complete.ts` (the deps factory call)
- Modify: `src/components/nodes/dubbing-dub-panel.tsx`, `dubbing-lip-sync-panel.tsx`, `src/components/editor/editor-dub-task.tsx`, `editor-lip-task.tsx`
- Tests: the dub and lip-sync route tests, `src/lib/dubbing/__tests__/complete.test.ts`

**Interfaces:**
- Consumes: `priceForNewRun`, `priceForGeneration`, `NO_PRICE_MESSAGE` (`@/lib/ai-models/run-price`); `dubUsd`, `lipSyncUsd` (`@/lib/ai-models/service-price`); `DUB_MODEL_ID`, `LIP_SYNC_MODEL_ID`; `reservedAmountForUnpriced` (widen its `kind` to `"image" | "video" | "dub" | "lipsync" | "voice" | "transcribe" | "prompt"`); `useModelPrice` (browser).
- Produces: `CompleteDeps` gains `priceFor: (g: GenerationRow) => Promise<AiModelPrice | null>` and `reservedFor: (generationId: string, g: GenerationRow, kind: "dub" | "lipsync") => Promise<number>`; `dubbingCompleteDeps(failAndRefund, reservedFor)`.

- [ ] **Step 1: Write the failing tests**

Route tests (dub and lip sync), each:
- with the run-price mock returning `null`: POST answers 409 with `{ error: NO_PRICE_MESSAGE }` and `insertGeneration`/`reserveCredits` are not called;
- with a seeded price (`seededPrice(DUB_MODEL_ID)` / `seededPrice(LIP_SYNC_MODEL_ID)` from `@/lib/ai-models/test-prices`): `insertGeneration` is called with `modelPriceId` equal to that row's id, and `reserveCredits` with `usdToFinalCredits(dubUsd(price, seconds)!)` (lip sync: `lipSyncUsd`).

`src/lib/dubbing/__tests__/complete.test.ts`:
- a succeeded dub with `priceFor` resolving the seeded row settles `usdToFinalCredits(dubUsd(row, input.durationSeconds)!)` and succeeds with `costUsd` = that USD and `providerBill: { source: "request", meters: { audio_second: Math.ceil(seconds) } }`;
- `priceFor` resolving `null` settles at `reservedFor(...)`'s amount (mock 77), `costUsd` undefined, and still succeeds (version kept);
- the same two for lip sync (`meters: { video_second: seconds }`).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync" src/lib/dubbing`
Expected: FAIL.

- [ ] **Step 3: The dub route**

In `src/app/api/nodes/[id]/dub/route.ts`, after the `source.ok` check and before building `dub`:

```ts
      // D558 — the price row this run is reserved and charged with; none, no run.
      const price = await priceForNewRun(DUB_MODEL_ID);
      if (!price) return apiError(NO_PRICE_MESSAGE, 409);
      const credits = dubUsd(price, source.durationSeconds);
      if (credits === null) return apiError(NO_PRICE_MESSAGE, 409);
```

add `modelPriceId: price.id,` to `insertGeneration`, and reserve `usdToFinalCredits(credits)` instead of `dubCredits(source.durationSeconds)`. Imports: replace `dubCredits` with `priceForNewRun, NO_PRICE_MESSAGE` from `@/lib/ai-models/run-price`, `dubUsd` from `@/lib/ai-models/service-price`, `DUB_MODEL_ID` from `@/lib/ai-models/service-models`, `usdToFinalCredits` from `@/lib/credits/units`.

- [ ] **Step 4: The lip-sync route**

Same shape in `src/app/api/nodes/[id]/lip-sync/route.ts`, after the `!output || !durationSeconds` check: `priceForNewRun(LIP_SYNC_MODEL_ID)`, 409 on null, `lipSyncUsd(price, durationSeconds)`, `modelPriceId: price.id`, reserve `usdToFinalCredits(usd)`.

- [ ] **Step 5: Completion**

`src/lib/dubbing/complete.ts`:

```ts
export type CompleteDeps = {
  …existing…
  priceFor: (g: GenerationRow) => Promise<AiModelPrice | null>;
  reservedFor: (generationId: string, g: GenerationRow, kind: "dub" | "lipsync") => Promise<number>;
};

export const dubbingCompleteDeps = (
  failAndRefund: CompleteDeps["failAndRefund"],
  reservedFor: CompleteDeps["reservedFor"],
): CompleteDeps => ({
  insertVersion, setActiveVersion, getVersionById, updateVersionOutputAndInputs,
  settleGeneration, succeedGeneration, failAndRefund, isOwnStoredUrl,
  priceFor: (g) => priceForGeneration(g),
  reservedFor,
  now: () => new Date().toISOString(),
});
```

In `completeDubGeneration`, replace the `computeDubCost` block:

```ts
  // D558 — priced with the row this run was reserved with; never 0 for a delivered dub.
  const price = await deps.priceFor(generation);
  const usd = price ? dubUsd(price, input.durationSeconds) : null;
  const credits = usd === null ? await deps.reservedFor(input.generationId, generation, "dub") : usdToFinalCredits(usd);
  await deps.settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: credits });
  await deps.setActiveVersion(nodeId, version.id);
  await deps.succeedGeneration({
    generationId: input.generationId, versionId: version.id, costUsd: usd ?? undefined,
    creditsCharged: credits, outputSnapshot: input.dubbedUrl,
    providerBill: { source: "request", meters: { audio_second: Math.ceil(input.durationSeconds) } },
  });
```

and the same in `completeLipSyncGeneration` with `lipSyncUsd`, kind `"lipsync"`, `meters: { video_second: input.durationSeconds }`, `outputSnapshot: input.videoUrl`. Imports: drop `./cost`; add `priceForGeneration` (`@/lib/ai-models/run-price`), `dubUsd, lipSyncUsd` (`@/lib/ai-models/service-price`), `AiModelPrice` type.

In `src/lib/generations/complete.ts` (line ~264): `const deps = dubbingCompleteDeps(failAndRefund, reservedAmountForUnpriced);` and widen `reservedAmountForUnpriced`'s `kind` union as listed in Interfaces.

- [ ] **Step 6: Browser estimates**

`src/components/nodes/dubbing-dub-panel.tsx` (line ~99):

```tsx
  const { price: dubPrice, loading: dubPriceLoading } = useModelPrice(DUB_MODEL_ID);
  const dubUsdEstimate = dubPrice && sourceSeconds > 0 ? dubUsd(dubPrice, sourceSeconds) : null;
```

and render `<EstimatedCreditsLabel credits={…} />` only when `dubUsdEstimate !== null` with `credits={usdToFinalCredits(dubUsdEstimate)}`; the panel's Dub button gets `|| dubPriceLoading || dubUsdEstimate === null` added to its existing `disabled` (it is a paid action; it waits for the price). Same pattern in `dubbing-lip-sync-panel.tsx` (`LIP_SYNC_MODEL_ID`, `lipSyncUsd`, `activeDubSeconds`), `src/components/editor/editor-dub-task.tsx` (line ~98, the "· N credits" text and its Dub button) and `editor-lip-task.tsx` (line ~63). Read each file before editing so the `disabled` expressions are extended, not replaced.

- [ ] **Step 7: Run tests and tsc**

Run: `npx vitest run "src/app/api/nodes/[id]/dub" "src/app/api/nodes/[id]/lip-sync" src/lib/dubbing src/lib/generations src/components/nodes src/components/editor` and `npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/nodes/[id]/dub/route.ts" "src/app/api/nodes/[id]/lip-sync/route.ts" src/lib/dubbing/complete.ts src/lib/generations/complete.ts src/components/nodes/dubbing-dub-panel.tsx src/components/nodes/dubbing-lip-sync-panel.tsx src/components/editor/editor-dub-task.tsx src/components/editor/editor-lip-task.tsx
git add <each changed test file>
git commit -m "feat(credits): dub and lip sync reserve and settle with their price row (D558)"
```

---

### Task 6: Voice change (and the voice preview's voice part) priced from its row, charged by ElevenLabs' credits

**Files:**
- Modify: `src/app/api/nodes/[id]/voice-change/route.ts`
- Modify: `src/lib/generations/complete.ts` (voice path, lines ~323–390)
- Modify: `src/lib/voice-change/workspace.ts`, `src/components/nodes/video-gen-change-voice.tsx`
- Modify: `src/lib/avatars/voice-preview.ts`, `src/lib/avatars/studio-server.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts`, `src/lib/avatars/complete-voice-preview.ts`
- Tests: voice-change route test, `complete.test.ts` voice cases, `voice-change/__tests__/workspace.test.ts`, `avatars/__tests__/voice-preview.test.ts`, voice-preview route test

**Interfaces:**
- Consumes: `voiceChangeEstimateUsd`, `voiceChangeCharge`; `VOICE_CHANGE_PRICE_MODEL_ID`; `priceForNewRun`, `priceForGeneration`, `NO_PRICE_MESSAGE`.
- Produces:
  - `voiceChangeEstimateCredits(price: AiModelPrice | null, durationSeconds, priceMultiplier): number | null`
  - `voicePreviewCostUsd(price, voiceChangePrice: AiModelPrice | null, mode, engine, durationSeconds, resolution, priceMultiplier)` — a named preview with no voice-change row is null.

Important: a voice change's generation records `model_used` = the video's model, so its row must be found through `model_price_id` (recorded at insert from `VOICE_CHANGE_PRICE_MODEL_ID`). `priceForGeneration` already prefers the recorded id. A voice generation created before this change has no `model_price_id`: its fallback would price by the video model, so the voice path must resolve the row explicitly: `generation.model_price_id ? priceForGeneration(generation) : priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID, new Date(generation.created_at))`.

- [ ] **Step 1: Write the failing tests**

- Route: no voice-change row → 409 `NO_PRICE_MESSAGE`, nothing inserted or reserved; with `seededPrice(VOICE_CHANGE_PRICE_MODEL_ID)` → `insertGeneration` gets `modelPriceId` = that id and `reserveCredits` gets `usdToFinalCredits(voiceChangeEstimateUsd(row, seconds, multiplier)!)`.
- Completion (voice): `input.meta.voiceChange.characterCost = 30` → settles `usdToFinalCredits(30 × 0.000182)`, `costUsd` ≈ 0.00546, `providerBill: { source: "provider_charge", meters: { provider_credit: 30 } }`; no `characterCost` → settles the seconds × multiplier price with `source: "request"`; no row at all → settles the reserved amount (mock 77), keeps the version.
- `workspace.test.ts`: `voiceChangeEstimateCredits(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), 30, 2)` equals `usdToFinalCredits(30 / 60 × 0.12 × 2)`; `null` price → `null`.
- `voice-preview.test.ts`: named mode with the voice-change row adds `voiceChangeEstimateUsd(row, seconds, multiplier)`; named mode without it → null; native mode unchanged.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/voice-change" src/lib/generations src/lib/voice-change src/lib/avatars "src/app/api/clients/[id]/avatars"`
Expected: FAIL.

- [ ] **Step 3: The route**

In `src/app/api/nodes/[id]/voice-change/route.ts`, before `insertGeneration`:

```ts
    // D558 — ElevenLabs' row prices the voice change; the generation still records the video's model.
    const price = await priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID);
    if (!price) return apiError(NO_PRICE_MESSAGE, 409);
    const usd = voiceChangeEstimateUsd(price, source.durationSeconds, voice.priceMultiplier);
    if (usd === null) return apiError(NO_PRICE_MESSAGE, 409);
```

add `modelPriceId: price.id,` to `insertGeneration`; inside `try`, `const credits = usdToFinalCredits(usd);` replaces the `computeVoiceChangeCost` line.

- [ ] **Step 4: The completion's voice path**

In `src/lib/generations/complete.ts`, replace the `cost` computation's voice branch:

```ts
  const characterCost = Number(
    (input.meta?.voiceChange as { characterCost?: unknown } | undefined)?.characterCost,
  );
  const voicePrice = voiceChange
    ? generation.model_price_id
      ? await priceForGeneration(generation)
      : await priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID, new Date(generation.created_at))
    : null;
  const voiceCharge = voiceChange && voicePrice
    ? voiceChangeCharge(voicePrice, {
        characterCost: Number.isFinite(characterCost) && characterCost > 0 ? characterCost : null,
        seconds: input.durationSeconds,
        priceMultiplier: voiceChange.priceMultiplier,
      })
    : null;
  const cost = voiceChange
    ? voiceCharge ? { usd: voiceCharge.usd } : null
    : charge ? { usd: charge.usd } : null;
```

`actualCredits` stays as is (its `reservedAmountForUnpriced` fallback now also covers a voice change with no row; pass `voiceChange ? "voice" : "video"` as the kind). In `succeedGeneration` add `providerBill: voiceChange ? voiceCharge?.bill ?? null : charge ? { source: charge.source, meters: charge.meters } : null,`. Imports: `voiceChangeCharge` (`@/lib/ai-models/service-price`), `priceForNewRun` (`@/lib/ai-models/run-price`), `VOICE_CHANGE_PRICE_MODEL_ID`; drop `computeVoiceChangeCost`.

The non-voice video path now also stores its bill (`charge.meters`), so Kling's units land in `provider_bill`.

- [ ] **Step 5: The panel and the voice preview**

`src/lib/voice-change/workspace.ts`:

```ts
export function voiceChangeEstimateCredits(price: AiModelPrice | null, durationSeconds: number, priceMultiplier: number): number | null {
  const usd = price ? voiceChangeEstimateUsd(price, durationSeconds, priceMultiplier) : null;
  return usd === null ? null : usdToFinalCredits(usd);
}
```

`src/components/nodes/video-gen-change-voice.tsx` (line ~59): `const { price: voicePrice, loading: voicePriceLoading } = useModelPrice(VOICE_CHANGE_PRICE_MODEL_ID);` and `voiceChangeEstimateCredits(voicePrice, duration, choice.voice.priceMultiplier)`; its apply button adds `|| voicePriceLoading || estimatedCredits === null` to `disabled` (read the file first; extend, don't replace).

`src/lib/avatars/voice-preview.ts`: add the `voiceChangePrice: AiModelPrice | null` parameter after `price`; the named branch returns `null` when `voiceChangePrice` is null, else `video + voiceChangeEstimateUsd(voiceChangePrice, durationSeconds, priceMultiplier)` (null-safe). `estimateVoicePreviewCredits` takes the same extra parameter. Callers: `studio-server.ts` `estimateFor` fetches `priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID)` in the same `Promise.all` it already uses; the voice-preview route resolves it next to its video price (409 `NO_PRICE_MESSAGE` if a named preview has none); `complete-voice-preview.ts` resolves it with `priceForNewRun(VOICE_CHANGE_PRICE_MODEL_ID, new Date(generation.created_at))` and, when `meta.voiceChange.characterCost` is present, charges the voice part with `voiceChangeCharge` instead of the estimate.

- [ ] **Step 6: Run tests and tsc**

Run: the Step 2 command plus `src/components/nodes`, and `npx tsc --noEmit -p tsconfig.json`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/nodes/[id]/voice-change/route.ts" src/lib/generations/complete.ts src/lib/voice-change/workspace.ts src/components/nodes/video-gen-change-voice.tsx src/lib/avatars/voice-preview.ts src/lib/avatars/studio-server.ts "src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts" src/lib/avatars/complete-voice-preview.ts
git add <each changed test file>
git commit -m "feat(credits): voice change priced from its row and charged by ElevenLabs' credits (D558)"
```

---

### Task 7: Auto captions priced from its row, charged by the dollars ElevenLabs reports

**Files:**
- Modify: `src/app/api/canvases/[cid]/editor/transcribe/route.ts`
- Modify: `trigger/editor-transcribe.ts`
- Modify: `src/lib/editor/auto-captions.ts`, `src/hooks/use-auto-captions.ts`, and the button that shows the cost (`src/components/editor/editor-auto-captions-button.tsx`)
- Tests: transcribe route test, `src/lib/editor/__tests__/auto-captions.test.ts`, a new `trigger` settle unit if one exists, else a test of the extracted settle helper below

**Interfaces:**
- Produces:
  - `settleTranscribe(input: { generation: { id; model_used; created_at; model_price_id?; org_id }, secondsDone: number, providerUsd: number | null }, deps): Promise<{ credits: number; usd: number | null; bill: ProviderBill | null }>` in `src/lib/transcribe/settle.ts` (server-only), pure apart from its deps (`priceFor`, `reservedFor`) — the Trigger task calls it so the money rule is unit-tested.
  - `autoCaptionCost(price: AiModelPrice | null, doc, sources, transcribed, pieceIds?)` → `{ credits: number | null; free: boolean }`.

- [ ] **Step 1: Write the failing tests**

- Route: no row → 409 `NO_PRICE_MESSAGE` before `insertGeneration`; with `seededPrice(TRANSCRIBE_MODEL_ID)` → `modelPriceId` recorded, reserve `usdToFinalCredits(transcribeEstimateUsd(row, seconds)!)`.
- `settle.test.ts`: `providerUsd: 0.0176` → credits `usdToFinalCredits(0.0176)`, bill `provider_charge`; `providerUsd: null` → seconds price, bill `request`; no row → reserved amount (77), `usd: null`.
- `auto-captions.test.ts`: with the seeded row, `autoCaptionCost` credits equal `usdToFinalCredits(transcribeEstimateUsd(row, seconds)!)`; with `null` price → `credits: null`; nothing new to transcribe → `{ credits: 0, free: true }` unchanged.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run "src/app/api/canvases/[cid]/editor/transcribe" src/lib/transcribe src/lib/editor`. Expected: FAIL.

- [ ] **Step 3: Implement**

Route (`transcribe/route.ts`): after computing `seconds` and before `insertGeneration`:

```ts
      const price = await priceForNewRun(TRANSCRIBE_MODEL_ID);
      const usd = price ? transcribeEstimateUsd(price, seconds) : null;
      if (!price || usd === null) return apiError(NO_PRICE_MESSAGE, 409);
```

`modelPriceId: price.id` on insert; reserve `usdToFinalCredits(usd)`.

`src/lib/transcribe/settle.ts`:

```ts
import "server-only";
import { transcribeCharge } from "@/lib/ai-models/service-price";
import { usdToFinalCredits } from "@/lib/credits/units";
import type { AiModelPrice, ProviderBill } from "@/lib/ai-models/types";
import type { GenerationRow } from "@/lib/db/types";

type Gen = Pick<GenerationRow, "id" | "model_used" | "created_at" | "org_id"> & { model_price_id?: string | null };

/** D558 — what an auto-captions run is charged: ElevenLabs' reported dollars, else the seconds;
 *  never 0 for transcribed audio because a price is missing. */
export async function settleTranscribe(
  input: { generation: Gen; secondsDone: number; providerUsd: number | null },
  deps: {
    priceFor: (g: Gen) => Promise<AiModelPrice | null>;
    reservedFor: (generationId: string, g: Gen) => Promise<number>;
  },
): Promise<{ credits: number; usd: number | null; bill: ProviderBill | null }> {
  const price = await deps.priceFor(input.generation);
  const charge = price ? transcribeCharge(price, { providerUsd: input.providerUsd, seconds: input.secondsDone }) : null;
  if (!charge) return { credits: await deps.reservedFor(input.generation.id, input.generation), usd: null, bill: null };
  return { credits: usdToFinalCredits(charge.usd), usd: charge.usd, bill: charge.bill };
}
```

`trigger/editor-transcribe.ts`: import `@/lib/transcribe/settle`, `@/lib/ai-models/run-price`, `@/lib/generations/complete` dynamically with the others; replace the `cost.transcribeCredits` branch:

```ts
      const generation = await gens.getGeneration(input.generationId);
      const { credits: charged, usd, bill } = await settle.settleTranscribe(
        { generation, secondsDone, providerUsd },
        { priceFor: (g) => runPrice.priceForGeneration(g), reservedFor: (id, g) => complete.reservedAmountForUnpriced(id, g as GenerationRow, "transcribe") },
      );
      await credits.settleGeneration({ orgId: input.orgId, generationId: input.generationId, actualAmount: charged });
      await gens.succeedGeneration({ generationId: input.generationId, creditsCharged: charged, costUsd: usd ?? undefined, providerBill: bill });
```

(take `providerUsd` from `runTranscription`'s result; drop the `@/lib/transcribe/cost` import).

`src/lib/editor/auto-captions.ts`: `autoCaptionCost(price, doc, sources, transcribed, pieceIds?)`; `credits: price ? (usd => usd === null ? null : usdToFinalCredits(usd))(transcribeEstimateUsd(price, seconds)) : null` when `seconds > 0`, `0` when nothing is fresh. `src/hooks/use-auto-captions.ts`: `const { price, loading } = useModelPrice(TRANSCRIBE_MODEL_ID);` passed into `autoCaptionCost`, and `loading` exposed so `editor-auto-captions-button.tsx` disables the paid button while `loading || credits === null` (read the button first; extend its `disabled`).

- [ ] **Step 4: Run tests and tsc**

Run: Step 2's command plus `src/hooks src/components/editor`, and `npx tsc --noEmit -p tsconfig.json`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/canvases/[cid]/editor/transcribe/route.ts" trigger/editor-transcribe.ts src/lib/transcribe/settle.ts src/lib/editor/auto-captions.ts src/hooks/use-auto-captions.ts src/components/editor/editor-auto-captions-button.tsx
git add <each changed test file>
git commit -m "feat(credits): auto captions priced from its row and charged by ElevenLabs' dollars (D558)"
```

---

### Task 8: Prompt runs reserve the flat estimate and settle real token cost

Superseded: this part is replaced by the D558 and D559 entries in the roadmap ADR log and by `.superpowers/sdd/2b/overrides.md`.

**Files:**
- Modify: `src/lib/api/prompt-run.ts`
- Modify: `src/app/api/nodes/[id]/generate/route.ts`, `src/app/api/nodes/[id]/video-prompt/route.ts`, `src/app/api/nodes/[id]/multishot-prompt/route.ts`
- Modify: `src/components/nodes/prompt-focus-view.tsx`, `video-prompt-focus-view.tsx`, `multishot-prompt-focus-view.tsx`
- Tests: `src/lib/api/__tests__/prompt-run.test.ts` (or the existing prompt-run test), the three route tests

**Interfaces:**
- `runPromptGeneration` no longer takes `estimatedCredits`; it takes `attachmentCount: number`, resolves `priceForNewRun(args.model)` itself (throws `NoPriceError` → route maps to 409 `NO_PRICE_MESSAGE` **before** anything is recorded — so the price lookup happens before `insertGeneration`), reserves `promptEstimateCredits(price, attachmentCount)`, records `modelPriceId`, and settles `usdToFinalCredits(promptCharge(price, usage).usd)`; with no usage or no matching line, it settles the reserved amount (the flat estimate) — never 0.
- `export class NoPriceError extends Error {}` in `src/lib/ai-models/run-price.ts`.

- [ ] **Step 1: Write the failing tests**

prompt-run test:
- seeded `PROMPT_MODEL_ID` row, `attachmentCount: 2`: reserves `promptEstimateCredits(row, 2)` (10), insert has `modelPriceId`;
- usage `{ prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766, prompt_tokens_details: { cached_tokens: 3968 } }`: settles `usdToFinalCredits(promptCharge(row, usage)!.usd)` (5) and succeeds with `costUsd` = that USD and `providerBill` = the charge's bill;
- `usage: null`: settles the reserved estimate (10), `costUsd` undefined;
- no row: rejects with `NoPriceError` and `insertGeneration` is not called.

Route tests: a missing row answers 409 with `NO_PRICE_MESSAGE` (generate, video-prompt, multishot-prompt).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/api "src/app/api/nodes/[id]/generate" "src/app/api/nodes/[id]/video-prompt" "src/app/api/nodes/[id]/multishot-prompt"`. Expected: FAIL.

- [ ] **Step 3: Implement `runPromptGeneration`**

At the top of `runPromptGeneration`, before `insertGeneration`:

```ts
  const price = await priceForNewRun(args.model);
  const estimate = price ? promptEstimateCredits(price, args.attachmentCount) : null;
  if (!price || estimate === null) throw new NoPriceError(NO_PRICE_MESSAGE);
```

`insertGeneration({ …, modelPriceId: price.id })`; reserve `estimate`; after the call:

```ts
    // D559 — charged what OpenAI billed; the flat amount was only the estimate. With no usage
    // (or a token type the row can't price) the run settles at what was reserved, never 0.
    const charge = usage ? promptCharge(price, usage) : null;
    const credits = charge ? usdToFinalCredits(charge.usd) : estimate;
    await settleGeneration({ orgId: args.orgId, generationId: generation.id, actualAmount: credits });
    await succeedGeneration({
      generationId: generation.id, versionId: version.id, costUsd: charge?.usd, creditsCharged: credits,
      tokensUsed: usage ? { ...usage } : null, providerBill: charge?.bill ?? null,
      outputSnapshot: typeof output === "string" ? output : JSON.stringify(output),
    });
```

Remove the old flat-settle comment and the `computeCost` import. `NoPriceError` is thrown before the `try`, so it never reaches the refund cleanup.

Routes: video-prompt and multishot-prompt pass `attachmentCount: resolved.upstream.filter(isVisionAttachment).length` instead of `estimatedCredits`, and their catch maps `e instanceof NoPriceError` to `apiError(NO_PRICE_MESSAGE, 409)`. The generate route (which inlines its own flow) follows the same steps as `runPromptGeneration`: price lookup before `insertGeneration` (409 on none), reserve `promptEstimateCredits`, `modelPriceId`, settle `promptCharge` or the estimate, `providerBill`; replace its long "settle on the flat estimate" comment with the D559 comment above. Drop `estimatePromptCredits` and `computeCost` imports.

- [ ] **Step 4: Browser estimates**

In each of the three focus views (lines ~130, ~201, ~298): `const { price: promptPrice, loading: promptPriceLoading } = useModelPrice(PROMPT_MODEL_ID);` and `const estimatedCredits = promptPrice ? promptEstimateCredits(promptPrice, upstream.filter(isVisionAttachment).length) : null;`; pass `estimating={… || promptPriceLoading}` and add `|| promptPriceLoading || estimatedCredits === null` to each Generate button's `disabled` (read each file first; extend the existing expressions).

- [ ] **Step 5: Run tests and tsc**

Run: Step 2's command plus `src/components/nodes`, and `npx tsc --noEmit -p tsconfig.json`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/prompt-run.ts src/lib/ai-models/run-price.ts "src/app/api/nodes/[id]/generate/route.ts" "src/app/api/nodes/[id]/video-prompt/route.ts" "src/app/api/nodes/[id]/multishot-prompt/route.ts" src/components/nodes/prompt-focus-view.tsx src/components/nodes/video-prompt-focus-view.tsx src/components/nodes/multishot-prompt-focus-view.tsx
git add <each changed test file>
git commit -m "feat(credits): prompt runs are charged what OpenAI billed (D559)"
```

---

### Task 9: Kling runs are charged by their units

**Files:**
- Test: `src/lib/generations/complete.test.ts`

Task 4 made Kling report `usage` and Task 6 made completion store `provider_bill` for video. This task proves the end-to-end path and fixes anything missing.

- [ ] **Step 1: Write the failing test**

In `complete.test.ts`, a Kling generation (`model_used: "kling:kling-3-0"`, `created_at: "2026-11-24T00:00:00Z"`, `model_price_id` = the seeded 0080 Kling row id, `params_snapshot: { resolution: "720p", audio: "off" }`) completing with `usage: { kind: "kling", units: 6.4 }` settles `usdToFinalCredits(6.4 × 0.1508)` (965), `costUsd` ≈ 0.96512, and `providerBill: { source: "provider_usage", meters: { provider_unit: 6.4 } }`; the same run with no usage settles the per-second price (`source: "request"`).

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/generations/complete.test.ts`. If it passes immediately, keep it as the regression guard and say so in the report; if it fails, fix the cause in `complete.ts` (most likely the `providerBill` line from Task 6) and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/generations/complete.test.ts src/lib/generations/complete.ts
git commit -m "test(credits): a Kling run is charged by the units Kling billed (D558)"
```

---

### Task 10: Delete the service price constants; 0080 becomes frozen history; D558–D559

**Files:**
- Delete: `src/lib/dubbing/cost.ts` (pricing parts; keep any non-price export, moving it next to its user), `src/lib/elevenlabs/cost.ts`, `src/lib/transcribe/cost.ts`, `src/lib/credits/prompt-estimate.ts`, `src/lib/ai-models/seeds/service-price-rows.ts`
- Modify: `src/lib/elevenlabs/constants.ts` (remove `VOICE_CHANGE_USD_PER_MINUTE`), `src/lib/pricing.ts` (remove `gpt-5.4-mini` from `MODEL_PRICING` only if no caller remains — 2b-ii's record-only paths use rows; `computeCost` and the other models stay until 2b-ii's last task)
- Replace: `src/lib/ai-models/__tests__/service-price-equivalence.test.ts` with `src/lib/ai-models/__tests__/frozen-service-prices.test.ts`
- Modify: the 0080 header comment (frozen history), `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D558, D559)

- [ ] **Step 1: Write the frozen test first**

`frozen-service-prices.test.ts` loops over `[DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID]` × seconds `[0.4, 1, 3, 9.6, 30, 61, 600]` × (voice) multipliers `[1, 1.5, 2, 3]` × (prompt) attachments `[0, 1, 2, 5]` and the 19 Nov usage fixture, computing `usdToFinalCredits(...)` with the `service-price.ts` functions on `seededPrice(id)`, plus the three Kling unit rows at `2026-11-24` with `units: 6.4`; pins the keyed object with `toMatchSnapshot()`. Run it once to write the snapshot while the old constants still exist and the equivalence test still passes (so the snapshot equals today's prices).

- [ ] **Step 2: Delete and re-point**

Grep `src/` and `trigger/` for every symbol in the deleted files (`computeDubCost`, `computeLipSyncCost`, `dubCredits`, `lipSyncCredits`, `SARVAM_DUB_INR_PER_MIN`, `LIP_SYNC_PRO_USD_PER_MIN`, `computeVoiceChangeCost`, `VOICE_CHANGE_USD_PER_MINUTE`, `transcribeCostUsd`, `transcribeCredits`, `STT_USD_PER_HOUR`, `estimatePromptCredits`, `PROMPT_ESTIMATE_*`). After Tasks 5–8 only tests and the deleted builder should import them; update those tests onto `service-price.ts` + `seededPrice`. Delete the files and `service-price-equivalence.test.ts`. Change 0080's header first line to `-- D558: frozen history — the service prices as seeded; the code constants they came from are gone.` and confirm no test compares 0080 to a generator any more (`priceSql` and `price-sql.ts` stay: 2b-ii uses them).

- [ ] **Step 3: ADR entries**

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (plain wording, no taglines):

Superseded: this part is replaced by the D558 and D559 entries in the roadmap ADR log and by `.superpowers/sdd/2b/overrides.md`.

```markdown
### D558 — Dub, lip sync, voice change, auto captions and Kling are charged from price rows and what the provider billed *(recorded 2026-11-23; follows D554, D557)*

**Decision.** Five service models (`sarvam:dub`, `fal:lipsync-2-pro`, `elevenlabs:eleven_multilingual_sts_v2`, `elevenlabs:scribe_v2`, `openai:gpt-5.4-mini`) are in `ai_models` (migration 0079) with dated prices in `ai_model_prices` (0080). Each run reserves with its row, records `model_price_id`, and settles with the same row. A voice change records the video's model but is priced by the ElevenLabs row. When the provider reports its charge it is used: Kling's task `billing` units at $0.1508 a unit, ElevenLabs' `character-cost` credits at $0.000182 a credit, and speech-to-text's `fiat-cost-before-overages` dollars. fal and Sarvam report nothing and are priced by seconds. The report is stored in `generations.provider_bill`. The code constants are gone; 0080 is pinned by a snapshot test.

**Why.** The credit audit (19–21 Nov) found these prices hard-coded and, for auto captions, far below the provider's real charge.

**Rejected.** Keeping per-service constants beside the rows (two sources of truth).

**Originated →** [2026-11-22-model-catalog-2b-remaining-prices.md](../plans/2026-11-22-model-catalog-2b-remaining-prices.md).

### D559 — A prompt run is charged what OpenAI billed; the flat amount is only the estimate *(recorded 2026-11-23; replaces the flat settle noted in prompt-run.ts)*

**Decision.** Prompt runs still reserve and show the flat amount (5 credits plus 2.5 per image attachment), now stored as the estimate on the `openai:gpt-5.4-mini` row. They settle at the real token cost: uncached input, cached input (10% of the input rate) and output, rounded up to 5 credits. With no usage reported they settle at the reserved amount.

**Why.** User, 21 Nov: deduct what the provider charged. The flat settle overcharged by about 46% (1,980 credits charged for 1,358 credits of real cost, October).

**Rejected.** Keeping the flat settle for the attachment premium (it charged for work OpenAI didn't bill).

**Originated →** [2026-11-22-model-catalog-2b-remaining-prices.md](../plans/2026-11-22-model-catalog-2b-remaining-prices.md).
```

- [ ] **Step 4: Full suite and tsc**

Run: `npx vitest run` and `npx tsc --noEmit -p tsconfig.json`. Known: the two D467 "refuses a deprecated model" tests fail on staging too; some API route tests time out under the full run — re-run any failing file alone. Grep for every deleted symbol returns nothing in `src/` and `trigger/`.

- [ ] **Step 5: Commit**

```bash
git rm src/lib/elevenlabs/cost.ts src/lib/transcribe/cost.ts src/lib/credits/prompt-estimate.ts src/lib/ai-models/seeds/service-price-rows.ts src/lib/ai-models/__tests__/service-price-equivalence.test.ts
git add <every other changed file by path, incl. the snapshot and the roadmap>
git commit -m "refactor(credits): delete the service price constants; prices come only from ai_model_prices (D558, D559)"
```

---

## After the plan

Apply 0079 and 0080 to the dev database, then retest on 3001: a dub, a lip sync, a voice change and auto captions each show an estimate, reserve it, and settle with `model_price_id` and `provider_bill` set. Staging and production need 0076–0080, with their verify SQL, before this code deploys there.
