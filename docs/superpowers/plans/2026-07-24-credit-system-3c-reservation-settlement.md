# Credit System 3C — Reservation, Settlement, Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the credit ledger real — an org can no longer generate past its monthly cap.
Every creation route reserves an estimated cost before calling a provider; every terminal
state (success, failure, or a still-existing-but-unpriceable request) settles or refunds that
reservation exactly once, so a plain sum of `credit_transactions` is always correct.

**Architecture:** One new Postgres RPC (`reserve_credits`, row-locked check-and-insert, same
shape as the existing `acquire_canvas_lock` from migration `0010`) plus a small DB-layer
wrapper module (`src/lib/db/credit-transactions.ts`, mirroring `canvas-lock.ts`'s style)
provide `reserveCredits`/`settleGeneration`/`refundReservation`. These get wired into the
three creation routes (`generate`, `image-generate`, `video-generate`) right after
`insertGeneration` and before the provider call, and into every terminal-state path
(`succeedGeneration`'s call sites, `failGeneration`'s call sites, and — a real gap found
while writing this plan — the video webhook's org-mismatch drop-path, which currently never
resolves a stuck generation at all).

**Tech Stack:** TypeScript, Supabase Postgres (RPC via `supabase.rpc()`), Next.js route
handlers, vitest.

## Global Constraints

- **Every generation reaches exactly one terminal state, and every terminal state refunds
  its reservation exactly once** (design spec §4). Success: a `refund` row for
  `-reservedAmount` **and** a `consumption` row for the actual (margin'd, rounded) cost.
  Failure/cancel: a `refund` row for `-reservedAmount` only. Never both success-consumption
  and a second refund for the same generation — that reintroduces the double-counting bug
  already found and fixed once this session.
- **A request whose cost can't be estimated at all fails closed** (design spec §4, resolved
  while writing this plan): return an error and never call the provider or reserve anything.
  Never proceed ungated.
- **Input-token pricing for images, when the live count doesn't split text/image tokens**
  (design spec §5, resolved while writing this plan): zero reference images → the count is
  exactly text (exact, not a guess); one or more reference images → price the **whole** count
  at the higher `imgIn` rate (worst case, never under-reserves).
- **The org-mismatch webhook drop-path bug** (design spec §4, found while writing this plan):
  it currently never calls `failGeneration()`, leaving the row `running` forever with no
  automatic cleanup. Fixed here to fail + refund immediately — this makes the row terminal
  before 3D's future reconciliation sweep (which only ever matches `status = 'running'`)
  could also touch it, so there is no double-refund risk between the two paths.
- `usdToFinalCredits` (from `src/lib/credits/units.ts`, sub-plan 3B) is the only place a USD
  figure becomes a credit number for image/video. `estimatePromptCredits` (also 3B) already
  returns credits directly and is used as-is.
- This repo's vitest config runs in plain Node — only pure-logic files get unit tests. The
  new `estimateImageInputCost` function is pure and gets real tests. Everything else in this
  plan (an RPC migration, a DB-layer wrapper module, and route wiring) is I/O-bound or a
  route handler — verified by `npm run build` + `npm test` (regression) + manual staging
  checks, per this repo's established convention.
- Follow the existing `acquire_canvas_lock` (migration `0010`) / `canvas-lock.ts` pattern
  exactly for the new RPC and its TS wrapper — same `create or replace function ... language
  plpgsql`, same `supabase.rpc(name, { p_... })` calling convention, same "throw on `error`,
  interpret `data`" TS shape.

---

### Task 1: `estimateImageInputCost` — worst-case-safe input-token pricing

**Files:**
- Modify: `src/lib/image-gen/cost.ts`
- Modify: `src/lib/image-gen/__tests__/cost.test.ts`

**Interfaces:**
- Produces: `estimateImageInputCost(modelId: string, inputTokens: number, hasReferenceImages:
  boolean): number | null` — returns USD (not credits). The exact name Task 5's image-route
  wiring must import.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/image-gen/__tests__/cost.test.ts` (update the import line to include
`estimateImageInputCost`, then append a new `describe` block after the existing ones — do
not modify any existing test):

```ts
import { computeImageCost, estimateImageOutputCost, estimateImageInputCost } from "../cost";

describe("estimateImageInputCost", () => {
  it("returns null for an unknown model", () => {
    expect(estimateImageInputCost("unknown:model", 1000, false)).toBeNull();
  });

  it("prices a pure-text count (no reference images) at the exact textIn rate", () => {
    // gpt-image-2: textIn = $5.00/1M
    expect(estimateImageInputCost("openai:gpt-image-2", 1_000_000, false)).toBeCloseTo(5.0, 4);
  });

  it("prices a mixed count (any reference images) at the worst-case imgIn rate", () => {
    // gpt-image-2: imgIn = $8.00/1M — the whole count, not just the image portion
    expect(estimateImageInputCost("openai:gpt-image-2", 1_000_000, true)).toBeCloseTo(8.0, 4);
  });

  it("has no ambiguity for Gemini (textIn == imgIn already)", () => {
    // gemini-3.1-flash-image: textIn = imgIn = $0.50/1M
    expect(estimateImageInputCost("gemini:gemini-3.1-flash-image", 1_000_000, false)).toBeCloseTo(0.5, 4);
    expect(estimateImageInputCost("gemini:gemini-3.1-flash-image", 1_000_000, true)).toBeCloseTo(0.5, 4);
  });

  it("scales linearly with token count", () => {
    expect(estimateImageInputCost("openai:gpt-image-1-mini", 500_000, false)).toBeCloseTo(1.0, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: FAIL — `estimateImageInputCost is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/image-gen/cost.ts`, after `estimateImageOutputCost` (which already exists
from sub-plan 3B):

```ts
/**
 * Pre-generation INPUT cost estimate. Neither provider's live token count
 * (countGeminiInputTokens/countOpenAIInputTokens, sub-plan 3B) splits text vs. image
 * tokens — one combined number. Gemini has no ambiguity (textIn == imgIn already, per the
 * combined-rate fix in IMAGE_MODEL_PRICING above). OpenAI genuinely splits the two — with
 * zero reference images the count is provably 100% text (exact); with one or more, the
 * WHOLE count is priced at the higher imgIn rate, a worst-case that never under-reserves
 * (design spec §5).
 */
export function estimateImageInputCost(
  modelId: string,
  inputTokens: number,
  hasReferenceImages: boolean,
): number | null {
  const p = IMAGE_MODEL_PRICING[modelId];
  if (!p) return null;
  const rate = hasReferenceImages ? (p.imgIn ?? p.textIn ?? 0) : (p.textIn ?? 0);
  return (inputTokens / 1_000_000) * rate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/image-gen/__tests__/cost.test.ts`
Expected: PASS — all tests in the file green (existing `computeImageCost` +
`estimateImageOutputCost` tests, plus the new `estimateImageInputCost` ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-gen/cost.ts src/lib/image-gen/__tests__/cost.test.ts
git commit -m "feat(image-gen): add estimateImageInputCost worst-case token pricing"
```

---

### Task 2: `reserve_credits` migration — row-locked check-and-insert

**Files:**
- Create: `supabase/migrations/0020_reserve_credits.sql`

**Interfaces:**
- Produces: Postgres function `reserve_credits(p_org_id uuid, p_generation_id uuid, p_amount
  numeric) returns boolean` — the exact RPC name and parameter names Task 3's TS wrapper
  must call.

- [ ] **Step 1: Write the migration file**

```sql
-- Stage 3 (Credit System) reservation RPC. See
-- docs/superpowers/specs/2026-07-24-credit-system-design.md §4.
--
-- Atomic check-and-insert: a single plpgsql function call is one transaction, so locking
-- the org row for its duration serializes concurrent reservation attempts for the same org
-- — the sum-then-insert below can't race. Same acquire-lock-in-plpgsql shape as
-- acquire_canvas_lock (migration 0010).
create or replace function reserve_credits(
  p_org_id uuid,
  p_generation_id uuid,
  p_amount numeric
) returns boolean
language plpgsql
as $$
declare
  v_limit numeric;
  v_used numeric;
begin
  select monthly_credit_limit into v_limit
    from organizations
   where id = p_org_id
     for update;

  -- A null monthly_credit_limit (Yuvabe's own org, or any org intentionally left
  -- uncapped) always proceeds — no sum needed.
  if v_limit is not null then
    select coalesce(sum(amount), 0) into v_used
      from credit_transactions
     where org_id = p_org_id
       and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';

    if v_used + p_amount > v_limit then
      return false;
    end if;
  end if;

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, p_amount, 'reservation');

  return true;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Run the full contents of `0020_reserve_credits.sql` in the Supabase dashboard SQL editor.
Expected: no errors.

- [ ] **Step 3: Verify with a read-only query**

Run: `select proname from pg_proc where proname = 'reserve_credits';`
Expected: one row, `reserve_credits`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_reserve_credits.sql
git commit -m "feat(db): add reserve_credits row-locked RPC"
```

---

### Task 3: DB-layer ledger functions + `succeedGeneration`'s `creditsCharged` field

**Files:**
- Create: `src/lib/db/credit-transactions.ts`
- Modify: `src/lib/db/generations.ts:40-65` (the `succeedGeneration` function)

**Interfaces:**
- Consumes: the `reserve_credits` RPC (Task 2).
- Produces: `reserveCredits(orgId: string, generationId: string, amount: number): Promise<{
  ok: boolean }>`, `settleGeneration(input: { orgId: string; generationId: string;
  actualAmount: number }): Promise<void>`, `refundReservation(input: { orgId: string;
  generationId: string }): Promise<void>`, and `class CreditLimitError extends Error {}` —
  all from `src/lib/db/credit-transactions.ts`. These are the exact names Tasks 4-7 import.
  `succeedGeneration` gains a `creditsCharged?: number` parameter, written to the new
  `credits_charged` column (added, unpopulated, in sub-plan 3A).

No test for this task (every function here is a Supabase call — I/O-bound, matching this
repo's established convention for `src/lib/db/*.ts`). Verified by `npm run build` only.

- [ ] **Step 1: Create the DB-layer module**

```ts
// src/lib/db/credit-transactions.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// Thrown by route handlers when reserveCredits rejects a request — callers map this to a
// 402 response, distinct from a generic generation failure (500).
export class CreditLimitError extends Error {}

// Row-locked check-and-insert via the reserve_credits RPC (migration 0020) — the org row is
// locked for the call's duration, serializing concurrent reservation attempts so the
// sum-then-insert can't race. { ok: false } (never throws for a normal cap-exceeded case)
// when the org's monthly cap would be exceeded; a null monthly_credit_limit always succeeds.
export async function reserveCredits(
  orgId: string,
  generationId: string,
  amount: number,
): Promise<{ ok: boolean }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_org_id: orgId,
    p_generation_id: generationId,
    p_amount: amount,
  });
  if (error) throw error;
  return { ok: data === true };
}

// This generation's reservation amount, read back from the ledger (the source of truth —
// not duplicated onto the generations row). 0 if no reservation was ever made, so both
// settleGeneration and refundReservation are safe no-ops when called on a generation that
// was never actually reserved (e.g. reserveCredits itself threw before completing).
async function getReservedAmount(generationId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("generation_id", generationId)
    .eq("type", "reservation")
    .maybeSingle();
  if (error) throw error;
  return (data as { amount: number } | null)?.amount ?? 0;
}

// Success terminal state (design spec §4): refund the reservation AND record the actual
// cost in one insert — net ledger effect is exactly actualAmount, not the estimate. Call
// this and succeedGeneration's creditsCharged with the SAME actualAmount value.
export async function settleGeneration(input: {
  orgId: string;
  generationId: string;
  actualAmount: number;
}): Promise<void> {
  const reserved = await getReservedAmount(input.generationId);
  const supabase = createServerSupabase();
  const { error } = await supabase.from("credit_transactions").insert([
    { org_id: input.orgId, generation_id: input.generationId, amount: -reserved, type: "refund" },
    { org_id: input.orgId, generation_id: input.generationId, amount: input.actualAmount, type: "consumption" },
  ]);
  if (error) throw error;
}

// Failure/cancel terminal state (design spec §4): refund the reservation only — net ledger
// effect is zero.
export async function refundReservation(input: {
  orgId: string;
  generationId: string;
}): Promise<void> {
  const reserved = await getReservedAmount(input.generationId);
  const supabase = createServerSupabase();
  const { error } = await supabase.from("credit_transactions").insert({
    org_id: input.orgId,
    generation_id: input.generationId,
    amount: -reserved,
    type: "refund",
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Extend `succeedGeneration`**

In `src/lib/db/generations.ts`, replace lines 40-65 (the full `succeedGeneration` function)
with:

```ts
export async function succeedGeneration(input: {
  generationId: string;
  versionId: string;
  costUsd?: number;
  creditsCharged?: number;
  outputSnapshot?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {
    status: "succeeded",
    version_id: input.versionId,
    cost_usd: input.costUsd ?? null,
    credits_charged: input.creditsCharged ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.outputSnapshot !== undefined) update.output_snapshot = input.outputSnapshot;
  // Only touch meta when explicitly given a new value — insertGeneration already set it
  // (e.g. the creator's email) and an unconditional overwrite here would silently wipe
  // that out on every completion, since most callers never pass meta.
  if (input.meta !== undefined) update.meta = input.meta;

  const { error } = await supabase
    .from("generations")
    .update(update)
    .eq("id", input.generationId);
  if (error) throw error;
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/credit-transactions.ts src/lib/db/generations.ts
git commit -m "feat(credits): add reserveCredits/settleGeneration/refundReservation, wire creditsCharged"
```

---

### Task 4: Wire reservation + settlement into the prompt route

**Files:**
- Modify: `src/app/api/nodes/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `estimatePromptCredits` (`@/lib/credits/prompt-estimate`, sub-plan 3B),
  `usdToFinalCredits` (`@/lib/credits/units`, sub-plan 3B), `reserveCredits`,
  `settleGeneration`, `refundReservation`, `CreditLimitError` (`@/lib/db/credit-transactions`,
  Task 3).

No test for this task (route handler — build + manual staging check, per this repo's
convention).

- [ ] **Step 1: Update the imports**

At the top of `src/app/api/nodes/[id]/generate/route.ts`, add these three import lines
(after the existing `import { computeCost } from "@/lib/pricing";` line):

```ts
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
```

- [ ] **Step 2: Reserve after `insertGeneration`, before the OpenAI call**

Replace:

```ts
      generation = await insertGeneration({
        nodeId,
        orgId: caller.orgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "prompt",
        modelUsed: model,
        paramsSnapshot: { model: promptGeneratePrompt.model },
        inputsSnapshot: { instruction: effectiveInstruction },
      });

      const openai = createOpenAI();
```

with:

```ts
      generation = await insertGeneration({
        nodeId,
        orgId: caller.orgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "prompt",
        modelUsed: model,
        paramsSnapshot: { model: promptGeneratePrompt.model },
        inputsSnapshot: { instruction: effectiveInstruction },
      });

      const estimatedCredits = estimatePromptCredits(resolved.upstream.length);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }

      const openai = createOpenAI();
```

- [ ] **Step 3: Settle on success**

Replace:

```ts
      const usage = completion.usage;
      const cost = usage
        ? computeCost(model, {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          })
        : null;
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        outputSnapshot: output,
      });
```

with:

```ts
      const usage = completion.usage;
      const cost = usage
        ? computeCost(model, {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          })
        : null;
      // cost is only ever null when the provider returned no usage data — an actual cost
      // of 0 credits in that case, not a reason to skip settlement (every terminal state
      // still refunds its reservation exactly once).
      const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;
      await settleGeneration({
        orgId: caller.orgId,
        generationId: generation.id,
        actualAmount: actualCredits,
      });
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        creditsCharged: actualCredits,
        outputSnapshot: output,
      });
```

- [ ] **Step 4: Refund on failure, and map `CreditLimitError` to a 402**

Replace:

```ts
      if (generation?.id) {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      }
      return apiError(message, 500);
```

with:

```ts
      if (generation?.id) {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: caller.orgId, generationId: generation.id }).catch(() => null);
      }
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
```

(This `catch` block already computes `const message = e instanceof Error ? e.message :
"Generation failed";` above these lines — unchanged. `refundReservation` is a safe no-op if
`reserveCredits` itself never completed, since `getReservedAmount` returns `0` for a
generation with no reservation row.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 6: Regression test**

Run: `npm test`
Expected: all existing tests still pass (this task touches no test files, and no pure
function's behavior changed).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/nodes/\[id\]/generate/route.ts
git commit -m "feat(credits): wire reservation/settlement into the prompt route"
```

---

### Task 5: Wire reservation + settlement into the image route

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

**Interfaces:**
- Consumes: `estimateImageOutputCost` (3B), `estimateImageInputCost` (Task 1),
  `usdToFinalCredits` (3B), `reserveCredits`, `settleGeneration`, `refundReservation`,
  `CreditLimitError` (Task 3), `countGeminiInputTokens` (`@/lib/image-gen/providers/gemini`,
  3B), `countOpenAIInputTokens` (`@/lib/image-gen/providers/openai`, 3B),
  `aspectRatioToOpenAISize` (`@/lib/image-gen/providers/openai`, already exported, used
  internally by that file's own `generateWithOpenAI` today).

No test for this task (route handler — build + manual staging check, per this repo's
convention).

- [ ] **Step 1: Update the imports**

Replace:

```ts
import { computeImageCost } from "@/lib/image-gen/cost";
```

with:

```ts
import { computeImageCost, estimateImageOutputCost, estimateImageInputCost } from "@/lib/image-gen/cost";
import { countGeminiInputTokens } from "@/lib/image-gen/providers/gemini";
import { countOpenAIInputTokens, aspectRatioToOpenAISize } from "@/lib/image-gen/providers/openai";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
```

- [ ] **Step 2: Reserve after `insertGeneration`, before the provider call**

Replace:

```ts
    // Join the shared generations substrate (D26) — image is the synchronous fast path.
    const generation = await insertGeneration({
      nodeId,
      orgId: caller.orgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "image",
      modelUsed: modelId,
      paramsSnapshot: validatedParams,
      inputsSnapshot: inputsUsed,
    });

    try {
      const result = await config.generate({
```

with:

```ts
    // Join the shared generations substrate (D26) — image is the synchronous fast path.
    const generation = await insertGeneration({
      nodeId,
      orgId: caller.orgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "image",
      modelUsed: modelId,
      paramsSnapshot: validatedParams,
      inputsSnapshot: inputsUsed,
    });

    try {
      const hasReferenceImages = referenceUrls.length > 0;
      const isOpenAI = modelId.startsWith("openai:");
      const quality = validatedParams.quality as string | undefined;
      const sizeKey = isOpenAI
        ? aspectRatioToOpenAISize((validatedParams.aspect_ratio as string) ?? "1:1")
        : ((validatedParams.image_size as string) ?? "1K");

      const outputCostUsd = estimateImageOutputCost(modelId, quality, sizeKey);
      if (outputCostUsd === null) {
        throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
      }

      const inputTokens = isOpenAI
        ? await countOpenAIInputTokens(prompt, referenceUrls)
        : await countGeminiInputTokens(modelId.split(":")[1], prompt, referenceUrls);
      const inputCostUsd = estimateImageInputCost(modelId, inputTokens, hasReferenceImages) ?? 0;

      const estimatedCredits = usdToFinalCredits(outputCostUsd + inputCostUsd);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }

      const result = await config.generate({
```

- [ ] **Step 3: Settle on success**

Replace:

```ts
      const cost = result.tokensUsed ? computeImageCost(modelId, result.tokensUsed) : null;
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        outputSnapshot: imageUrl,
      });
```

with:

```ts
      const cost = result.tokensUsed ? computeImageCost(modelId, result.tokensUsed) : null;
      // cost is only ever null when the provider returned no token usage — an actual cost
      // of 0 credits in that case, not a reason to skip settlement.
      const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;
      await settleGeneration({
        orgId: caller.orgId,
        generationId: generation.id,
        actualAmount: actualCredits,
      });
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        creditsCharged: actualCredits,
        outputSnapshot: imageUrl,
      });
```

- [ ] **Step 4: Refund on failure, and map `CreditLimitError` to a 402**

Replace:

```ts
    } catch (e) {
      const message = e instanceof Error ? e.message : "Image generation failed";
      await insertVersion({
        nodeId,
        paramsUsed: { modelId, ...validatedParams },
        modelUsed: modelId,
        error: message,
      }).catch(() => null);
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      return apiError(message, 500);
    }
```

with:

```ts
    } catch (e) {
      const message = e instanceof Error ? e.message : "Image generation failed";
      await insertVersion({
        nodeId,
        paramsUsed: { modelId, ...validatedParams },
        modelUsed: modelId,
        error: message,
      }).catch(() => null);
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: caller.orgId, generationId: generation.id }).catch(() => null);
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
```

(`refundReservation` is a safe no-op if reservation never completed — e.g. the new
`Error("No cost estimate available...")` thrown before `reserveCredits` was even called —
since `getReservedAmount` returns `0` for a generation with no reservation row.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 6: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/nodes/\[id\]/image-generate/route.ts
git commit -m "feat(credits): wire reservation/settlement into the image route"
```

---

### Task 6: Wire reservation into the video route

**Files:**
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`

**Interfaces:**
- Consumes: `computeVideoCost`, `isVideoAudioEnabled`, `asResolutionString`
  (`@/lib/video-gen/cost`, already exist), `usdToFinalCredits` (3B), `reserveCredits`,
  `refundReservation`, `CreditLimitError` (Task 3), `failGeneration`
  (`@/lib/db/generations`, already exported, not currently imported in this file).

Settlement (success/failure) for video happens later, in the webhook path — Task 7, not
here. This task only adds the reservation gate before the Trigger.dev task fires; design
spec §4: "video: never fires the Trigger.dev task" when rejected.

No test for this task (route handler — build + manual staging check, per this repo's
convention).

- [ ] **Step 1: Update the imports**

Replace:

```ts
import { insertGeneration } from "@/lib/db/generations";
```

with:

```ts
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
```

- [ ] **Step 2: Wrap the insert-and-trigger sequence in reservation + a try/catch**

Replace:

```ts
    // Insert generation record (status: 'running')
    const generation = await insertGeneration({
      nodeId,
      orgId: caller.orgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "video",
      modelUsed: modelId,
      paramsSnapshot: resolvedParams,
      inputsSnapshot: {
        videoPromptNodeId: videoPromptNode.nodeId,
        videoPromptVersionId: videoPromptNode.versionId,
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls,
      },
    });

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
    });

    return apiOk({ generationId: generation.id }, 202);
```

with:

```ts
    // Insert generation record (status: 'running')
    const generation = await insertGeneration({
      nodeId,
      orgId: caller.orgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "video",
      modelUsed: modelId,
      paramsSnapshot: resolvedParams,
      inputsSnapshot: {
        videoPromptNodeId: videoPromptNode.nodeId,
        videoPromptVersionId: videoPromptNode.versionId,
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls,
      },
    });

    try {
      const durationSeconds = Number(resolvedParams.seconds ?? resolvedParams.duration ?? 0);
      const audioEnabled = isVideoAudioEnabled(resolvedParams.audio);
      const resolution = asResolutionString(resolvedParams.resolution);
      const estimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
      if (estimate === null) {
        throw new Error(`No cost estimate available for ${modelId} at these params.`);
      }
      const estimatedCredits = usdToFinalCredits(estimate.usd);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
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
      });

      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Video generation failed";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: caller.orgId, generationId: generation.id }).catch(() => null);
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nodes/\[id\]/video-generate/route.ts
git commit -m "feat(credits): wire reservation into the video route"
```

---

### Task 7: Settle/refund video's async completion path, and fix the org-mismatch gap

**Files:**
- Modify: `src/lib/generations/complete.ts`

**Interfaces:**
- Consumes: `settleGeneration`, `refundReservation` (Task 3), `usdToFinalCredits` (3B).

No test for this task (this file is entirely Supabase/fetch I/O — build + manual staging
check, per this repo's convention; `completeGeneration`'s existing behavior has no unit
tests today either).

- [ ] **Step 1: Update the imports**

Replace:

```ts
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
```

with:

```ts
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { settleGeneration, refundReservation } from "@/lib/db/credit-transactions";
import { usdToFinalCredits } from "@/lib/credits/units";
```

- [ ] **Step 2: Add a local fail-and-refund helper**

Add this function right after the imports, before `buildVideoDownloadHeaders`:

```ts
// Every failure path in this file needs the same two calls in the same order — a small
// local helper keeps that from drifting out of sync across the 3 sites that need it.
async function failAndRefund(
  generationId: string,
  orgId: string,
  error: string,
): Promise<void> {
  await failGeneration({ generationId, error });
  await refundReservation({ orgId, generationId });
}
```

- [ ] **Step 3: Fix the org-mismatch drop-path (the gap found while writing this plan)**

Replace:

```ts
  if (!client || client.org_id !== generation.org_id) {
    console.error("[completeGeneration] org mismatch — dropping", {
      generationId: input.generationId,
      recordedOrgId: generation.org_id,
      currentOrgId: client?.org_id ?? null,
    });
    return;
  }
```

with:

```ts
  if (!client || client.org_id !== generation.org_id) {
    console.error("[completeGeneration] org mismatch — dropping", {
      generationId: input.generationId,
      recordedOrgId: generation.org_id,
      currentOrgId: client?.org_id ?? null,
    });
    // D79: this path is a defensive backstop for a case framed as "should be impossible in
    // practice" — its non-throwing, best-effort shape is intentional, so failures here are
    // swallowed rather than propagated. Failing (not just logging) also matters now: it
    // makes this generation terminal immediately, so 3D's future reconciliation sweep
    // (which only ever matches status = 'running') will never also try to refund it —
    // exactly once, from exactly one path.
    await failAndRefund(
      input.generationId,
      generation.org_id,
      "Dropped: org no longer matches the node's current client",
    ).catch((e) => {
      console.error("[completeGeneration] failAndRefund failed on org-mismatch path", { error: e });
    });
    return;
  }
```

- [ ] **Step 4: Refund on the explicit `failed` webhook status**

Replace:

```ts
  if (input.status === "failed") {
    await failGeneration({ generationId: input.generationId, error: input.error });
    return;
  }
```

with:

```ts
  if (input.status === "failed") {
    await failAndRefund(input.generationId, generation.org_id, input.error);
    return;
  }
```

- [ ] **Step 5: Refund on video-download failure**

Replace:

```ts
  if (!videoResponse.ok) {
    await failGeneration({
      generationId: input.generationId,
      error: `Failed to download video from provider: ${videoResponse.status}`,
    });
    return;
  }
```

with:

```ts
  if (!videoResponse.ok) {
    await failAndRefund(
      input.generationId,
      generation.org_id,
      `Failed to download video from provider: ${videoResponse.status}`,
    );
    return;
  }
```

- [ ] **Step 6: Refund on storage-upload failure**

Replace:

```ts
  } catch (e) {
    await failGeneration({
      generationId: input.generationId,
      error: `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return;
  }
```

with:

```ts
  } catch (e) {
    await failAndRefund(
      input.generationId,
      generation.org_id,
      `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
    );
    return;
  }
```

- [ ] **Step 7: Settle on success**

Replace:

```ts
  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
    : null;

  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    costUsd: cost?.usd,
    outputSnapshot: storedVideoUrl,
    meta: input.meta,
  });
```

with:

```ts
  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
    : null;
  // cost is only ever null when model_used is unset (shouldn't happen — every video
  // generation records a model at insertGeneration) — an actual cost of 0 credits in that
  // case, not a reason to skip settlement.
  const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;

  await settleGeneration({
    orgId: generation.org_id,
    generationId: input.generationId,
    actualAmount: actualCredits,
  });
  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    costUsd: cost?.usd,
    creditsCharged: actualCredits,
    outputSnapshot: storedVideoUrl,
    meta: input.meta,
  });
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 9: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/generations/complete.ts
git commit -m "feat(credits): settle/refund video completion path, fix org-mismatch stuck-row gap"
```

---

## Self-Review

**1. Spec coverage.** Design spec §4 in full: `reserveCredits` row-locked RPC (Task 2/3),
call order `insertGeneration → reserveCredits → branch` in all 3 routes (Tasks 4-6), the
terminal-state refund rule applied at every `succeedGeneration`/`failGeneration` call site
across all 4 files that have one (Tasks 4, 5, 6, 7), and the org-mismatch gap found and fixed
while writing this plan (Task 7). §5's fail-closed-on-null-estimate decision — Tasks 5 (image)
and 6 (video) both throw before reserving when their respective estimate function returns
`null`; the prompt route (Task 4) needs no such check since `estimatePromptCredits` always
returns a number. §5's worst-case input-token pricing — Task 1. Reconciliation sweep (3D) and
UI wiring (3E/3F) are explicitly out of scope for this sub-plan, per the index.

**2. Placeholder scan.** No TBD/TODO. Every task shows exact before/after code — the two
throw-sites for "no cost estimate available" use a plain `Error`, not a new class, since
they map to the same 500 status as any other failure (only `CreditLimitError` needs its own
class, for the 402 branch).

**3. Type consistency.** `reserveCredits(orgId, generationId, amount)`,
`settleGeneration({ orgId, generationId, actualAmount })`, `refundReservation({ orgId,
generationId })`, and `CreditLimitError` (Task 3) are used with identical names and shapes in
Tasks 4-7. `succeedGeneration`'s new `creditsCharged?: number` parameter (Task 3) is passed
at every one of its 3 call sites (Tasks 4, 5, 7) with the same locally-computed
`actualCredits` value also passed to `settleGeneration`'s `actualAmount` — the two are never
allowed to drift apart since they're the same variable at each call site.

No gaps found.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3c-reservation-settlement.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
