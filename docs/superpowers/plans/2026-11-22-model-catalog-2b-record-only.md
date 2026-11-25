# Model catalog 2b-ii — record what the free features cost us Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every paid provider call that charges no credits (script writer, KB extraction and website research, image analysis, avatar brief, Copilot, compose, parse, split scene, file extract, Apify) writes one `generations` row with `record_only = true`, its model, its price row and what it cost us, and no ledger rows.

**Architecture:** Migration 0081 lets a record-only row exist without a node, avatar or script. The text models these features call are seeded into `ai_models` (0082) with dated prices (0083), plus one Apify row priced on the `usd` meter. One server helper, `recordProviderCost`, turns an OpenAI or Gemini usage block (or Apify's run cost) into meters, prices them with `priceForNewRun`, and inserts the row. It never throws and never blocks the feature: a failure to record is logged, not shown. Each call site calls it once after its provider call returns.

**Tech Stack:** Next.js route handlers, Supabase Postgres, Vitest 4.

**Follows:** `docs/superpowers/plans/2026-11-22-model-catalog-2b-remaining-prices.md` (2b-i). Uses its `price-sql.ts`, `ProviderBill` and `succeedGeneration({ providerBill })`. Spec D555.

## Global Constraints

- Migrations **0081** (owner check), **0082** (text and scrape models), **0083** (their prices). Decision **D560**.
- A record-only row has `record_only = true`, `status = 'succeeded'`, `credits_charged = 0`, and **no** `credit_transactions` rows. Nothing reserves or settles.
- Recording never changes what the user sees: no new error, no new wait. The insert runs after the feature's own work and its failure is logged with `console.error("[record-cost]", …)`.
- A model with no price row is still recorded, with `cost_usd` null and the bill kept, so the cost can be priced later.
- One insert per provider call, none per item. A loop that calls the provider N times records N rows (that is N paid calls), never more.
- Every migration gets its entry in `docs/auth-production-migration.md` in the same commit. No AI attribution in commits. No database connections by the implementer.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0081_generations_record_only_owner.sql` | owner check allows record-only rows |
| `src/lib/ai-models/text-models.ts` | text and scrape model ids and their `ai_models` rows |
| `src/lib/ai-models/seeds/text-price-rows.ts` | 0083's rows |
| `src/lib/ai-models/text-usage.ts` | OpenAI / Gemini / Apify usage → meters (pure) |
| `src/lib/generations/record-cost.ts` | `recordProviderCost` (server-only) |
| `src/lib/db/generations.ts` | `insertRecordOnlyGeneration` |
| call sites | one `recordProviderCost` call each (Tasks 5–7) |

---

### Task 1: Record-only rows need no owner (migration 0081) and their insert

**Files:**
- Create: `supabase/migrations/0081_generations_record_only_owner.sql`
- Modify: `src/lib/db/generations.ts`, `docs/auth-production-migration.md`
- Test: `src/lib/db/__tests__/generations.test.ts`

**Interfaces:**
- Produces: `insertRecordOnlyGeneration(input: { orgId: string; clientId?: string | null; userId?: string | null; userEmail?: string | null; nodeId?: string | null; avatarId?: string | null; scriptId?: string | null; type: RecordOnlyType; modelUsed: string; modelPriceId: string | null; costUsd: number | null; providerBill: ProviderBill; tokensUsed?: Record<string, unknown> | null }): Promise<void>`
- `type RecordOnlyType = "script" | "kb" | "image_analysis" | "avatar_brief" | "copilot" | "compose" | "parse" | "split_scene" | "file_extract" | "scrape"` — added to `GenerationRow["type"]`.

- [ ] **Step 1: Write the migration**

```sql
-- D560: a record-only row (D555) logs a provider call that charges no credits. Many of those
-- calls (Copilot, KB extraction, website research) belong to no node, avatar or script.
alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check
  check (node_id is not null or avatar_id is not null or script_id is not null or record_only);
```

Doc entry (append, CRLF, one blank line before):

````markdown
## Migration 0081 — record-only generations need no owner (D560, 2026-11-24)

`supabase/migrations/0081_generations_record_only_owner.sql`. Paste into the Supabase SQL editor → Run, after 0080.
Apply **before** the 2b-ii code deploys; without it every record-only insert fails (logged, not shown, and the cost is lost).
**Safe to re-run:** drops and re-adds the constraint.

```sql
-- expect: ... or record_only
select pg_get_constraintdef(oid) from pg_constraint where conname = 'generations_owner_check';
```
````

- [ ] **Step 2: Write the failing test**

In the generations db test (mocked Supabase client, as the file already does): `insertRecordOnlyGeneration({ orgId: "o", type: "copilot", modelUsed: "gemini:gemini-3.1-pro-preview", modelPriceId: "p1", costUsd: 0.004, providerBill: { source: "provider_usage", meters: { input_token: 100 } } })` inserts exactly `{ org_id: "o", client_id: null, user_id: null, user_email: null, node_id: null, avatar_id: null, script_id: null, type: "copilot", model_used: "gemini:gemini-3.1-pro-preview", model_price_id: "p1", status: "succeeded", record_only: true, cost_usd: 0.004, credits_charged: 0, provider_bill: { … }, tokens_used: null, completed_at: <any string> }` and resolves; a Supabase error rejects.

Run: `npx vitest run src/lib/db` — FAIL.

- [ ] **Step 3: Implement**

```ts
/** D560 — a provider call that charges no credits, kept so we know what it cost us. No ledger rows. */
export async function insertRecordOnlyGeneration(input: {
  orgId: string; clientId?: string | null; userId?: string | null; userEmail?: string | null;
  nodeId?: string | null; avatarId?: string | null; scriptId?: string | null;
  type: RecordOnlyType; modelUsed: string; modelPriceId: string | null; costUsd: number | null;
  providerBill: ProviderBill; tokensUsed?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabase().from("generations").insert({
    org_id: input.orgId, client_id: input.clientId ?? null, user_id: input.userId ?? null,
    user_email: input.userEmail ?? null, node_id: input.nodeId ?? null, avatar_id: input.avatarId ?? null,
    script_id: input.scriptId ?? null, type: input.type, model_used: input.modelUsed,
    model_price_id: input.modelPriceId, status: "succeeded", record_only: true,
    cost_usd: input.costUsd, credits_charged: 0, provider_bill: input.providerBill,
    tokens_used: input.tokensUsed ?? null, completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`insertRecordOnlyGeneration: ${error.message}`);
}
```

(use the same client accessor the file's other inserts use). Run: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0081_generations_record_only_owner.sql src/lib/db/generations.ts src/lib/db/types.ts docs/auth-production-migration.md src/lib/db/__tests__/generations.test.ts
git commit -m "feat(credits): record-only generations need no owner (migration 0081, D560)"
```

---

### Task 2: The text and scrape models (0082) and their prices (0083)

**Files:**
- Create: `src/lib/ai-models/text-models.ts`, `src/lib/ai-models/seeds/text-price-rows.ts`
- Create: `src/lib/ai-models/__tests__/text-models.test.ts`
- Create (generated): `supabase/migrations/0082_ai_text_models.sql`, `0083_ai_text_prices.sql`
- Modify: `src/lib/ai-models/test-prices.ts` (add 0083 to `MIGRATIONS`), `docs/auth-production-migration.md`

**Interfaces:**
- Produces: `TEXT_MODEL_IDS = ["openai:gpt-5", "openai:gpt-4o-mini", "gemini:gemini-3.1-pro-preview", "gemini:gemini-3.8-flash", "gemini:gemini-3.5-flash-lite"] as const`, `APIFY_MODEL_ID = "apify:actor"`, `textModelRows(): AiModelSeedRow[]` (kind `"text"`, Apify kind `"scrape"` — add `"scrape"` to `AI_MODEL_KINDS` and the 0076 check is a text column with no check, confirm with `grep -n "kind" supabase/migrations/0076_ai_model_catalog.sql` and, if a check exists, add it to 0082), `textPriceRows(): AiModelPriceSeedRow[]` at `2026-01-01T00:00:00.000Z`.

- [ ] **Step 1: Find every model id these features call**

Run: `grep -rnoE '"(gpt|gemini)-[0-9a-z.\-]+"' src/lib/scripts src/lib/kb src/lib/image-analysis src/lib/avatars src/app/api/copilot "src/app/api/nodes/[id]/compose" "src/app/api/nodes/[id]/parse" "src/app/api/nodes/[id]/split-scene" "src/app/api/nodes/[id]/file" src/lib/market src/prompts | sort -u`
Every id in the output must be in `TEXT_MODEL_IDS` (prefixed `openai:` or `gemini:`). Add any the list above misses; the test in Step 2 enforces it.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TEXT_MODEL_IDS, APIFY_MODEL_ID, textModelRows, TEXT_SEED_HEADER } from "../text-models";
import { textPriceRows, TEXT_PRICE_HEADER } from "../seeds/text-price-rows";
import { seedSql } from "../seed";
import { priceSql } from "../price-sql";
import { parseAiModelRow, parseAiModelPriceRow } from "../schema";

const drift = (file: string, sql: string) => {
  const path = resolve(process.cwd(), "supabase/migrations", file);
  if (process.env.UPDATE_SEED === "1") writeFileSync(path, sql);
  expect(existsSync(path), "run with UPDATE_SEED=1 to write it").toBe(true);
  expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(sql);
};

describe("text and scrape models", () => {
  it("one live row per id, each passing the catalog's check", () => {
    const rows = textModelRows();
    expect(rows.map((r) => r.id).sort()).toEqual([...TEXT_MODEL_IDS, APIFY_MODEL_ID].sort());
    for (const r of rows) expect(parseAiModelRow({ ...r, description: null, provider_model_id: null, updated_at: "x" }), r.id).not.toBeNull();
  });
  it("every model has a price; text rows price input, cached input and output; Apify prices usd", () => {
    const prices = textPriceRows();
    for (const id of TEXT_MODEL_IDS) {
      const p = prices.find((x) => x.model_id === id)!;
      expect(parseAiModelPriceRow({ id: "x", ...p }), id).not.toBeNull();
      expect(p.lines.map((l) => l.meter).sort(), id).toEqual(["cached_input_token", "input_token", "text_output_token"]);
      expect(p.source_url, id).toMatch(/^https:\/\//);
    }
    expect(prices.find((x) => x.model_id === APIFY_MODEL_ID)!.lines).toEqual([{ meter: "usd", unit_usd: 1 }]);
  });
  it("0082 and 0083 match the builders", () => {
    drift("0082_ai_text_models.sql", seedSql(textModelRows(), TEXT_SEED_HEADER));
    drift("0083_ai_text_prices.sql", priceSql(textPriceRows(), TEXT_PRICE_HEADER));
  });
});
```

Run: `npx vitest run src/lib/ai-models/__tests__/text-models.test.ts` — FAIL.

- [ ] **Step 3: Write `text-models.ts`**

Same shape as 2b-i's `service-models.ts` (`row(id, provider, kind, label, providerLabel, sortOrder)`, status `live`, empty params/rules), header `-- D560: the text and scrape models the free features call. Generated by src/lib/ai-models/text-models.ts …`. Labels: "GPT-5", "GPT-4o mini", "Gemini 3.1 Pro", "Gemini 3.8 Flash", "Gemini 3.5 Flash Lite", "Web scraping".

- [ ] **Step 4: Write `seeds/text-price-rows.ts`**

Per-million rates, each with its `source_url`:

| model | input | cached input | output | source |
|---|---|---|---|---|
| `openai:gpt-5` | 1.25 | 0.125 | 10.00 | `https://developers.openai.com/api/docs/pricing` |
| `openai:gpt-4o-mini` | 0.15 | 0.075 | 0.60 | same |
| `gemini:*` (three rows) | the paid-tier rates on `https://ai.google.dev/gemini-api/docs/pricing` on the day this task runs (≤200k-token prompt tier; cached input is the context-caching rate) | | | that URL |

The Gemini numbers are read from that page when this task is done, written into the builder as literals with a one-line comment giving the date read, and checked by the reviewer against the page. Apify: `{ model_id: APIFY_MODEL_ID, lines: [{ meter: "usd", unit_usd: 1 }], estimate: {}, source_url: "https://apify.com/pricing", note: "Apify reports each run's cost in USD (D560)." }`.

```ts
const perM = (n: number) => n / 1_000_000;
const text = (model_id: string, input: number, cached: number, output: number, source_url: string): AiModelPriceSeedRow => ({
  model_id, effective_from: TEXT_EPOCH, estimate: {}, source_url, note: "Published rate (D560).",
  lines: [
    { meter: "input_token", unit_usd: perM(input) },
    { meter: "cached_input_token", unit_usd: perM(cached) },
    { meter: "text_output_token", unit_usd: perM(output) },
  ],
});
```

Unlike 2b-i's builder this one holds the numbers itself and is not deleted: 0083 has no code constant to derive from.

- [ ] **Step 5: Generate, extend `test-prices.ts`, run, doc, commit**

`UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/text-models.test.ts`, then without it `npx vitest run src/lib/ai-models` (PASS). Add `"0083_ai_text_prices.sql"` to `MIGRATIONS` in `test-prices.ts`. Doc entry "Migrations 0082 + 0083 — text and scrape models and prices (D560)" with verify SQL `select count(*) from ai_models where kind in ('text','scrape');` → expect 7 (6 here + 2b-i's prompt model).

```bash
git add src/lib/ai-models/text-models.ts src/lib/ai-models/seeds/text-price-rows.ts src/lib/ai-models/__tests__/text-models.test.ts src/lib/ai-models/test-prices.ts src/lib/ai-models/types.ts supabase/migrations/0082_ai_text_models.sql supabase/migrations/0083_ai_text_prices.sql docs/auth-production-migration.md
git commit -m "feat(credits): text and scrape models and prices for the free features (migrations 0082, 0083, D560)"
```

---

### Task 3: Usage blocks to meters

**Files:**
- Create: `src/lib/ai-models/text-usage.ts`, `src/lib/ai-models/__tests__/text-usage.test.ts`

**Interfaces:**
- `openAiChatMeters(usage: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } | null }): Meters` — same split as 2b-i's `promptCharge` (extract that split into this file and have `promptCharge` import it: two call sites).
- `openAiResponsesMeters(usage: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } | null }): Meters`
- `geminiMeters(u: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }): Meters` — `input_token` = prompt − cached, `cached_input_token`, `text_output_token` = candidates + thoughts (Gemini bills thinking at the output rate).
- `apifyMeters(usageTotalUsd: number | null): Meters` → `{ usd }` or `{}`.

- [ ] **Step 1: Failing test** — one case per function with real-shaped fixtures, including: cached > prompt clamps to prompt; missing details → no cached meter; Gemini with thoughts sums into output; Apify null → `{}`.
- [ ] **Step 2: Run** `npx vitest run src/lib/ai-models` — FAIL.
- [ ] **Step 3: Implement** (pure; zero-valued meters omitted).
- [ ] **Step 4: Run** — PASS, including 2b-i's `service-price` tests after `promptCharge` imports `openAiChatMeters`.
- [ ] **Step 5: Commit** `git commit -m "feat(credits): OpenAI, Gemini and Apify usage as meters (D560)"` (stage the two new files and `service-price.ts` by path).

---

### Task 4: `recordProviderCost`

**Files:**
- Create: `src/lib/generations/record-cost.ts`, `src/lib/generations/__tests__/record-cost.test.ts`

**Interfaces:**
```ts
export async function recordProviderCost(
  input: {
    orgId: string; clientId?: string | null; userId?: string | null; userEmail?: string | null;
    nodeId?: string | null; avatarId?: string | null; scriptId?: string | null;
    type: RecordOnlyType; modelId: string; meters: Meters; raw?: unknown;
  },
  deps?: { priceFor?: typeof priceForNewRun; insert?: typeof insertRecordOnlyGeneration },
): Promise<void>
```

- [ ] **Step 1: Failing test**
  - priced: inserts `modelPriceId` = row id, `costUsd` = `priceMeters(row, meters).usd`, `providerBill: { source: "provider_usage", meters, raw }`;
  - Apify (`meters: { usd }`): `source: "provider_charge"`;
  - no row: inserts with `modelPriceId: null`, `costUsd: null`, bill kept;
  - a meter the row can't price: `costUsd: null`;
  - empty meters: inserts nothing (no call was billed);
  - insert throws: resolves, and `console.error` was called with `"[record-cost]"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/generations/__tests__/record-cost.test.ts` — FAIL.
- [ ] **Step 3: Implement**

```ts
import "server-only";
import { priceForNewRun } from "@/lib/ai-models/run-price";
import { priceMeters } from "@/lib/ai-models/pricing";
import { insertRecordOnlyGeneration } from "@/lib/db/generations";

/** D560 — log what a free feature's provider call cost us. Never throws, never charges. */
export async function recordProviderCost(input: …, deps: … = {}): Promise<void> {
  if (!Object.values(input.meters).some((n) => typeof n === "number" && n > 0)) return;
  try {
    const price = await (deps.priceFor ?? priceForNewRun)(input.modelId);
    const priced = price ? priceMeters(price, input.meters) : null;
    await (deps.insert ?? insertRecordOnlyGeneration)({
      ...input, modelUsed: input.modelId, modelPriceId: price?.id ?? null,
      costUsd: priced && priced.unpriced.length === 0 ? priced.usd : null,
      providerBill: { source: "usd" in input.meters ? "provider_charge" : "provider_usage", meters: input.meters, raw: input.raw },
    });
  } catch (e) {
    console.error("[record-cost]", input.type, input.modelId, e instanceof Error ? e.message : e);
  }
}
```

(strip `meters`/`raw`/`modelId` from the spread passed to the insert so only its own fields go through.)
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(credits): recordProviderCost logs a free feature's provider cost (D560)"`.

---

### Task 5: Gemini call sites record their cost

**Files (read each before editing; each provider call gets exactly one `recordProviderCost` after it returns):**
- `src/lib/scripts/copilot/model.ts` (`structuredCaller`, `streamingCaller`: Gemini `generateContent` / `generateContentStream` — for the stream, read `usageMetadata` from the last chunk)
- `src/lib/kb/providers/gemini.ts` (lines ~67, ~98)
- `src/lib/image-analysis/gemini.ts` (~16)
- the script writer and avatar brief paths (find them: `grep -rln "generateContent" src/lib src/app | grep -v __tests__`; every hit not covered by another task belongs here)

The callers need `orgId` (and where known `clientId`, `userId`, `scriptId`/`avatarId`): thread a `recordFor?: { orgId; clientId?; userId?; userEmail?; scriptId?; avatarId?; nodeId? }` argument from the route that already resolved the caller (auth once per request; never re-resolve). A caller without it records nothing — a test asserts every production call site passes it.

- [ ] **Step 1: Failing tests** — per module, mock the Gemini response with `usageMetadata: { promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 50 }` and assert `recordProviderCost` was called once with `type` (copilot / kb / image_analysis / script / avatar_brief), `modelId: "gemini:<id>"` and `meters: geminiMeters(that block)`; a provider error records nothing.
- [ ] **Step 2: Run** the affected test directories — FAIL.
- [ ] **Step 3: Implement**, passing `recordFor` down from each route.
- [ ] **Step 4: Run** the directories plus `npx tsc --noEmit -p tsconfig.json` — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(credits): Gemini calls in the free features record their cost (D560)"` (paths staged explicitly).

---

### Task 6: OpenAI call sites record their cost

**Files:** `src/lib/kb/providers/openai.ts` (~84, Responses API → `openAiResponsesMeters`), the website research call (`gpt-5`), `src/lib/scripts/copilot/model.ts`'s OpenAI branch (`responses.parse`), `src/app/api/copilot/route.ts` (~22), `copilot/actions/route.ts` (~225), `copilot/references/route.ts` (~41), `src/app/api/nodes/[id]/compose/route.ts` (~66), `parse/route.ts` (~56), `split-scene/route.ts` (~31), `src/app/api/nodes/[id]/file/extract/route.ts` (~45). Chat Completions responses use `openAiChatMeters`.

Same steps as Task 5: one failing test per call site asserting a single `recordProviderCost` with the right `type`, `modelId: "openai:<id>"` and meters; implement with the route's already-resolved caller; run the directories and tsc; commit `"feat(credits): OpenAI calls in the free features record their cost (D560)"`.

Node routes pass `nodeId`; Copilot and KB pass `clientId` (and `scriptId` when the Copilot is on a script).

---

### Task 7: Apify records its run cost; the market scraper moves to async runs

**Files:** `src/lib/asset-import/apify.ts`, `src/lib/market/apify.ts`, their tests.

- `asset-import`: after `readRun` reports the run finished, `recordProviderCost({ type: "scrape", modelId: APIFY_MODEL_ID, meters: apifyMeters(run.usageTotalUsd ?? null), raw: { runId, actorId } })`.
- `market`: `run-sync-get-dataset-items` returns no run, so no cost. Switch it to the same start → poll `actor-runs/{id}` → read dataset flow `asset-import/apify.ts` already uses (extract that flow into one shared function there and call it from both: two call sites), then record as above. Keep the market call's existing timeout as the poll deadline and its existing error copy.

- [ ] **Step 1: Failing tests** — asset import records `{ usd: 0.031 }` from a mocked run; market starts a run, polls until `SUCCEEDED`, returns the same items as before, records once; a run that never finishes before the deadline fails with the old message and records nothing.
- [ ] **Step 2: Run** `npx vitest run src/lib/asset-import src/lib/market` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** plus tsc — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(credits): Apify runs record what they cost (D560)"`.

---

### Task 8: D560, remove the last code price table

**Files:** `src/lib/pricing.ts`, `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.

- [ ] **Step 1:** `grep -rn "computeCost\|MODEL_PRICING" src trigger --include=*.ts --include=*.tsx | grep -v __tests__`. Every remaining caller is a record-only path now covered by `recordProviderCost`; remove its `computeCost` use (the cost comes from the row). Then delete `computeCost`, `MODEL_PRICING` and `TokenUsage` if unused (keep `USD_TO_INR` if anything imports it — move it to `src/lib/credits/units.ts` only if `pricing.ts` would otherwise hold nothing else).
- [ ] **Step 2:** Append D560 to the roadmap §7:

```markdown
### D560 — Free features record what each provider call cost us *(recorded 2026-11-24; follows D555)*

**Decision.** Script writer, KB extraction and website research, image analysis, avatar brief, Copilot, compose, parse, split scene, file extract and Apify write one `generations` row per provider call with `record_only = true`, the model, its price row, `cost_usd` and `provider_bill`, and no ledger rows. The rows need no node, avatar or script (migration 0081). Their models and published prices are in 0082 and 0083. Recording never blocks or changes the feature; a failure is logged. The market scraper moved from Apify's synchronous endpoint to async runs, because only a run reports its cost.

**Why.** The credit audit found these calls billed to us with no record at all.

**Rejected.** Charging credits for them (user, 21 Nov: record cost, don't deduct).

**Originated →** [2026-11-22-model-catalog-2b-record-only.md](../plans/2026-11-22-model-catalog-2b-record-only.md).
```

- [ ] **Step 3:** `npx vitest run` and `npx tsc --noEmit -p tsconfig.json` (known flakes: re-run a failing API route file alone).
- [ ] **Step 4: Commit** `git commit -m "refactor(credits): free features priced only from ai_model_prices (D560)"`.

---

## After the plan

Apply 0081–0083 to dev, use Copilot, a KB extraction, an image analysis and an asset import on 3001, then check: `select type, model_used, cost_usd, provider_bill from generations where record_only order by created_at desc limit 10;` shows one row per call, no `credit_transactions` for them, and the credits balance unchanged.
