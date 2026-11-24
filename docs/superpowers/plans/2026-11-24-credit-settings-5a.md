# Credit settings in the database (5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The margin and the rounding step that turn a run's USD cost into credits come from dated `credit_settings` rows a super admin can change, read with the model catalog, and every place that works out credits uses the row live when the run started.

**Architecture:** Migration 0086 adds `credit_settings` (seeded with today's values) with the same "never edited, cancel only before it starts" guard as prices. The catalog loader reads it with models and prices; `AiCatalog` gains `creditSettings`. `src/lib/credits/units.ts` keeps the fixed rate and "round up" in code and exposes `creditsFromUsd(usd, settings)` plus `creditSettingsAt(catalog, at)`. Every caller passes the settings row: estimates and reservations use the row live now, completion uses the row live at the run's `created_at`. Admin actions add or cancel a row through checks like D546's.

**Tech Stack:** Supabase Postgres, TypeScript, TanStack Query (browser catalog), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-24-model-admin-v3-design.md` ("Credit settings in the database").

## Global Constraints

- Decision **D548**. Migration **0086**, with its entry in `docs/auth-production-migration.md` (CRLF) in the same commit, verify SQL included.
- **No behaviour change until an admin adds a row:** the seeded row (effective 2026-01-01, margin 0, step 5) gives exactly today's credits for every run. Every existing credit test keeps its numbers.
- Credit rate stays `USD_TO_CREDITS = 1000` in code; rounding stays up. Margin 0–200 (a number with up to 2 decimals); step one of 1, 5, 10.
- `credit_settings` rows: never updated; deleted only while `effective_from > now()` (DB trigger, like `ai_model_prices`); `effective_from` unique.
- **One function** turns USD into credits: `creditsFromUsd(usd, settings)`. No caller keeps its own margin or rounding. The old `usdToFinalCredits(usd)` is removed (callers must pass settings).
- Which row: an estimate or reservation uses `creditSettingsAt(catalog, new Date())`; completion and settling use `creditSettingsAt(catalog, new Date(generation.created_at))`. When no row is live (should never happen after 0086), fall back to the code defaults and `console.error` once.
- The browser gets the rows through the existing catalog (`/api/ai-models`, `useAiCatalog`); no new request. Server code reads them through `getAiCatalog()` already loaded by the route or task (one catalog read per request — never an extra one).
- Admin writes: `requireSuperAdmin()` first, server-side checks, cache cleared after a write, actions allowlisted in `with-action-coverage.test.ts` like the D546 ones. Copy plain.
- Run vitest from PowerShell. Files keep their line endings; comments UTF-8. No AI attribution in commits; stage by explicit path. No database connections by the implementer. `npx tsc --noEmit -p tsconfig.json`: only `.next/` errors are known. Known flakes: re-run a timed-out route test alone.

---

### Task 1: Migration 0086 and the catalog loads credit settings

**Files:**
- Create: `supabase/migrations/0086_credit_settings.sql`
- Modify: `docs/auth-production-migration.md` (0086 entry, CRLF)
- Modify: `src/lib/ai-models/types.ts` (`CreditSettings`, `AiCatalog.creditSettings`), `src/lib/ai-models/schema.ts` (`CREDIT_SETTINGS_COLUMNS`, `checkCreditSettingsRow`, `parseCreditSettingsRow`), `src/lib/ai-models/catalog.ts` (third query), `src/lib/ai-models/browser-catalog.ts` (pass them through), `src/lib/ai-models/test-catalog.ts` (seed them from 0086 so `seededModelCatalog()` has them)
- Test: `src/lib/ai-models/__tests__/credit-settings-schema.test.ts`, the existing catalog and browser-catalog tests

**Interfaces:**
- Produces:
  ```ts
  export type CreditSettings = { id: string; effectiveFrom: string; marginPercent: number; roundStep: 1 | 5 | 10; note: string | null };
  export type AiCatalog = { models: AiModel[]; prices: AiModelPrice[]; creditSettings: CreditSettings[] };
  ```

- [ ] **Step 1: Migration**

```sql
-- D548: how a run's cost becomes credits, as dated rows the super admin changes like prices.
-- The credit rate (1 credit = $0.001) and rounding up stay in code. Apply before the 5a code deploys.
create table if not exists credit_settings (
  id              uuid primary key default gen_random_uuid(),
  effective_from  timestamptz not null unique,
  margin_percent  numeric(5,2) not null check (margin_percent >= 0 and margin_percent <= 200),
  round_step      integer not null check (round_step in (1, 5, 10)),
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create or replace function credit_settings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'credit_settings rows are never edited; add a new row';
  end if;
  if old.effective_from <= now() then
    raise exception 'credit settings that have started cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists credit_settings_guard on credit_settings;
create trigger credit_settings_guard
  before update or delete on credit_settings
  for each row execute function credit_settings_guard();

alter table credit_settings enable row level security;

-- Today's behaviour: no margin, round up to the next 5 credits.
insert into credit_settings (effective_from, margin_percent, round_step, note)
values ('2026-01-01T00:00:00Z', 0, 5, 'Starting settings')
on conflict (effective_from) do nothing;
```

Check how 0076 sets RLS on `ai_model_prices` (policies or none, service-role only) and copy that exactly; reads go through the service-role client.

- [ ] **Step 2: Migration doc entry** (CRLF, after 0085, the 0084 format): what it does, apply before 5a deploys (without the table the catalog read fails and every paid run is refused — say so plainly), safe to re-run, verify SQL:

```sql
-- expect 1 row: margin 0, step 5, from 2026-01-01
select effective_from, margin_percent, round_step from credit_settings order by effective_from;
-- expect an error: rows are never edited
update credit_settings set round_step = 1;
```

- [ ] **Step 3: Failing tests** — `credit-settings-schema.test.ts`: a valid row parses to `CreditSettings` with numbers (Postgres `numeric` arrives as a string: "0.00" → 0); margin 250, step 3, a missing `effective_from` each fail with a problem list. `seededModelCatalog().creditSettings` has the one seeded row. `browserCatalog` keeps every settings row.

- [ ] **Step 4: Implement** — the loader adds `db.from("credit_settings").select(CREDIT_SETTINGS_COLUMNS).order("effective_from")` to its `Promise.all`; a failed read throws (rule 13); a row that fails its check is left out with `console.error`; zero rows logs an error ("is migration 0086 applied?"). `test-catalog.ts` reads 0086's seed values (parse the `insert … values` line, or add a `SEED_JSON_TAG` block to the migration if that's simpler and consistent with 0077 — pick one and say which).

- [ ] **Step 5: Run** `npx vitest run src/lib/ai-models` → PASS; tsc clean apart from `.next/`.

- [ ] **Step 6: Commit** — `git add` the migration, doc, the five lib files and tests; message `feat(credits): credit settings rows load with the model catalog (D548)`.

---

### Task 2: One credit conversion that takes the settings

**Files:**
- Modify: `src/lib/credits/units.ts`
- Test: `src/lib/credits/__tests__/units.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const USD_TO_CREDITS = 1000;            // fixed: changes only with plan prices
  export const DEFAULT_CREDIT_SETTINGS: CreditSettings; // margin 0, step 5 (fallback only)
  export function creditsFromUsd(usd: number, settings: Pick<CreditSettings, "marginPercent" | "roundStep">): number;
  export function creditSettingsAt(catalog: Pick<AiCatalog, "creditSettings">, at: Date): CreditSettings; // latest row with effectiveFrom <= at; fallback DEFAULT with one console.error
  ```
  `usdToFinalCredits`, `MARGIN_PERCENT`, `CREDIT_ROUND_STEP`, `CREDIT_ROUND_DIRECTION` are removed in Task 4, after every caller moved.

- [ ] **Step 1: Failing tests** — keep every existing `usdToFinalCredits` expectation, rewritten as `creditsFromUsd(x, { marginPercent: 0, roundStep: 5 })` with the same numbers (including the float-noise case 5 × 0.084). Add: margin 10% on $0.81088 → 895; step 1 on $0.00695 → 7; step 10 on $0.0123 → 20; the spec's example $0.0123 at step 5 → 15; `creditSettingsAt` picks the latest started row, ignores a future row, and falls back to the defaults (with a `console.error` spy) when none has started.

- [ ] **Step 2: Implement** with the same 6-decimal step as today, then `Math.ceil(raw / step) * step`. Keep `usdToFinalCredits` temporarily as `creditsFromUsd(usd, DEFAULT_CREDIT_SETTINGS)` marked `/** @deprecated Task 4 removes it */` so the tree compiles until Tasks 3–4 move the callers.

- [ ] **Step 3: Run** `npx vitest run src/lib/credits` → PASS; tsc clean. **Commit** `feat(credits): one conversion that takes the settings row (D548)`.

---

### Task 3: Server callers pass the settings of the run

**Files:** every non-test server caller of `usdToFinalCredits` (find with `grep -rn "usdToFinalCredits" src trigger --include=*.ts | grep -v test`): the transcribe, dub, lip-sync, video-generate and voice-change routes; `src/lib/generations/complete.ts`; `src/lib/image-gen/billed-run.ts`, `start-generation.ts`; `src/lib/transcribe/settle.ts`; `src/lib/dubbing/complete.ts`; `src/lib/editor/auto-captions.ts`; `src/lib/avatars/complete-voice-preview.ts`, `voice-preview.ts` (server use); `src/lib/voice-change/workspace.ts`; and any other server file the grep shows. Shared helpers used by both sides (`src/lib/avatars/generation.ts`, `src/lib/video-edit/record.ts`, `src/lib/ai-models/service-price.ts`) take the settings as an argument here, and Task 4 updates their browser callers.

**Interfaces:**
- Consumes: `creditsFromUsd`, `creditSettingsAt` (Task 2); the catalog each route or task already loads.

- [ ] **Step 1: Failing tests** — for `complete.ts` and one route (video-generate): with a catalog whose settings have a row from yesterday (margin 0, step 5) and one from one hour ago (margin 10, step 1), a generation created two hours ago settles at margin 0 / step 5, and a new run reserves at margin 10 / step 1. Use `withModel`-style helpers or a small `withCreditSettings(catalog, rows)` added to `test-catalog.ts`.

- [ ] **Step 2: Implement** — reservation and estimate sites: `creditsFromUsd(usd, creditSettingsAt(catalog, new Date()))`, using the catalog the route already has (if a route gets prices through a helper like `priceForNewRun` without holding the catalog, return or expose the catalog from the same read — never call `getAiCatalog()` twice in one request). Completion and settle sites: `creditSettingsAt(catalog, new Date(generation.created_at))`. Shared helpers gain a `settings` parameter (last argument, required).

- [ ] **Step 3: Run** per directory: `npx vitest run src/lib/generations src/lib/image-gen src/lib/transcribe src/lib/dubbing src/lib/editor src/lib/avatars src/lib/voice-change src/lib/video-edit src/lib/ai-models "src/app/api/nodes" "src/app/api/canvases" "src/app/api/clients"` → PASS (re-run timeouts alone). tsc: the browser callers of the changed shared helpers may fail to compile until Task 4 — if so, do Task 4 in the same session before committing, and commit Tasks 3 and 4 together.

- [ ] **Step 4: Commit** `refactor(credits): server runs use the credit settings live when they started (D548)`.

---

### Task 4: Browser callers and removing the old constants

**Files:** every remaining caller (the focus views, dubbing panels, editor tasks, composite view, `src/components/admin/models/price-draft.ts`, the browser callers of the Task 3 shared helpers); `src/lib/credits/units.ts` (delete `usdToFinalCredits` and the three old constants).

- [ ] **Step 1** — In components, get the row once per component: `const settings = creditSettingsAt(useAiCatalog().data ?? { creditSettings: [] }, new Date())` — or add a tiny hook `useCreditSettings()` in `src/hooks/queries/ai-models.ts` returning the live row from the cached catalog (preferred: one place). Pass it to `creditsFromUsd` and to the shared helpers.
- [ ] **Step 2** — Delete `usdToFinalCredits`, `MARGIN_PERCENT`, `CREDIT_ROUND_STEP`, `CREDIT_ROUND_DIRECTION`. `grep -rn "usdToFinalCredits\|MARGIN_PERCENT\|CREDIT_ROUND_STEP\|CREDIT_ROUND_DIRECTION" src trigger` → nothing. Update the component tests that mock `useAiCatalog` to include `creditSettings` (the seeded row).
- [ ] **Step 3: Run** `npx vitest run src/components src/hooks src/lib` (per directory) → PASS; tsc clean.
- [ ] **Step 4: Commit** `refactor(credits): screens show credits with the live settings; old constants removed (D548)`.

---

### Task 5: Admin checks and actions for credit settings

**Files:**
- Create: `src/lib/credits/settings-edit.ts` (pure checks), `src/lib/db/credit-settings-admin.ts` (reads with creator names, insert, delete-if-future scoped by id)
- Modify: `src/lib/actions/ai-models.ts` or create `src/lib/actions/credit-settings.ts` (`addCreditSettingsAction`, `cancelCreditSettingsAction`); `src/lib/actions/with-action-coverage.test.ts` (ALLOWLIST with the D546 reason)
- Test: `src/lib/credits/__tests__/settings-edit.test.ts`, `src/lib/actions/credit-settings.test.ts`, `src/lib/db/__tests__/credit-settings-admin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function checkNewCreditSettings(input: { effectiveFrom: Date; marginPercent: unknown; roundStep: unknown; note?: unknown }, existing: Pick<CreditSettings, "effectiveFrom">[], now: Date): { ok: true; value: { effectiveFrom: string; marginPercent: number; roundStep: 1|5|10; note: string|null } } | { ok: false; error: string };
  export async function addCreditSettingsAction(input: { effectiveFrom: string; marginPercent: number; roundStep: number; note?: string }): Promise<{ error?: string }>;
  export async function cancelCreditSettingsAction(id: string): Promise<{ error?: string }>;
  ```

- [ ] **Step 1: Failing tests** — checks: margin must be a finite number 0–200 with at most 2 decimals (`"The margin must be between 0% and 200%."`); step one of 1, 5, 10 (`"Pick a rounding step of 1, 5 or 10."`); start now or later with the same 60 s allowance as prices (`"A change can't start in the past."`); a taken start instant (`"There is already a change starting then."`); note trimmed, max 500 chars. Actions: `requireSuperAdmin` first; a refusal writes nothing; a valid add inserts with `created_by` and clears the catalog cache; cancel of a started row returns `"Only a change that hasn't started can be cancelled."`; a database error returns `"Could not save. Try again."` and logs the real one; shape guards on untyped input.
- [ ] **Step 2: Implement** following `src/lib/actions/ai-models.ts` (Task 3 of plan 4) exactly: fresh reads in one `Promise.all`, refresh (cache clear + `revalidatePath("/admin/credits")`) outside the write's try.
- [ ] **Step 3: Run** `npx vitest run src/lib/credits src/lib/actions src/lib/db` → PASS; tsc clean. **Commit** `feat(credits): the super admin adds or cancels credit settings through checks (D548)`.

---

### Task 6: ADR D548

**Files:** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7 after D547; keep line endings)

- [ ] Append:

```markdown
### D548 — Margin and rounding are dated settings rows *(recorded 2026-11-24; follows D529, D546)*

**Decision.** How a run's USD cost becomes credits is read from `credit_settings` (migration 0086): dated rows with a margin (0–200%) and a rounding step (1, 5 or 10), never edited, cancellable only before they start, changed by the super admin through checked actions. The credit rate (1 credit = $0.001) and rounding up stay in code: the rate changes what every credit an agency holds is worth, so it changes only with plan prices, and rounding up keeps a run from charging below its cost. The rows load with the model catalog and reach the browser in the same payload. One function, `creditsFromUsd(usd, settings)`, does the sum; an estimate or reservation uses the row live now, completion uses the row live at the run's `created_at`, so a run is charged with the settings live when it started. The seeded first row is today's behaviour (margin 0, step 5).

**Why.** Margin and rounding are business decisions like prices and should not need a deploy; small runs pay a lot for a step of 5 (a $0.0059 image is 10 credits), so the step must be tunable.

**Rejected.** A `credit_settings_id` on every generation (the time of the run already identifies the row, since rows are never edited and only future rows can be cancelled). An editable credit rate.

**Originated →** [2026-11-24-credit-settings-5a.md](../plans/2026-11-24-credit-settings-5a.md).
```

- [ ] Commit `docs: D548 margin and rounding are dated settings rows`.

---

## Not in this plan

The admin pages (plan 5b: models list, model page, change-prices flow and Credits page from prototype v3), replacing a scheduled price in one step, reordering, agencies affected, Undo of a started change. Per-agency margin.

## After the plan

Apply 0086 on dev, then on a canvas: an image and a video estimate show the same credits as before. Staging and production need 0076–0086 before this branch deploys.
