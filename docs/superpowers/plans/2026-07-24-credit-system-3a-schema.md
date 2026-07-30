# Credit System 3A — Schema + Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the credit-ledger schema (new `credit_transactions` table + `org_credit_usage`
view) and correct `generations`' long-mislabeled money column (`credits_consumed`, which has
always held raw USD) to `cost_usd`, adding the new `credits_charged` column later sub-plans
will populate — without breaking the build or any existing test.

**Architecture:** One manually-applied SQL migration (`0019`) does the schema work. Because
this project migrates DB and dependent app code together (not behind a compat shim — MVP,
pre-launch, no production data per the design spec), every reference to the old column name
is updated in the same sub-plan so `npm run build` and `npm test` stay green throughout.

**Tech Stack:** Supabase Postgres (manual migration via SQL editor, per this repo's existing
convention — see `supabase/migrations/`), Next.js API routes, vitest.

## Global Constraints

- Migrations are plain SQL files in `supabase/migrations/`, numbered sequentially, applied
  manually via the Supabase dashboard SQL editor — never automated in this repo.
- `credits_consumed` → `cost_usd` is a direct rename, no backward-compat column, no dual-write
  shim — explicitly authorized (pre-launch MVP, per `2026-07-24-credit-system-design.md` §3).
- `credits_charged` is added now but stays `null` on every row until sub-plan 3C wires up the
  reservation/settlement logic that populates it. Do not attempt to populate it in this
  sub-plan.
- Org-scoped tables get RLS with a `select`-only "org isolation" policy following the existing
  pattern (`org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)`)
  — the app's real reads/writes go through the service-role client, which bypasses RLS; the
  policy is a backstop against direct REST API access, per D78.
- This repo's vitest config runs in plain Node (no jsdom/RTL) — only pure-logic files get unit
  tests. This sub-plan touches no pure logic (it's a rename), so no new tests are added; the 3
  existing test files with `GenerationRow`-shaped mock fixtures must still typecheck and pass.

---

### Task 1: Migration 0019 — `credit_transactions` table, `org_credit_usage` view, and the `generations` rename

**Files:**
- Create: `supabase/migrations/0019_credit_transactions.sql`

**Interfaces:**
- Produces: table `credit_transactions(id uuid, org_id uuid, generation_id uuid, amount
  numeric, type text, created_at timestamptz)`; view `org_credit_usage(org_id, credits_used)`;
  `generations.cost_usd` (renamed from `credits_consumed`); `generations.credits_charged
  numeric` (new, nullable).
- Consumes: existing tables `organizations`, `generations`, `org_memberships` (all already
  present as of migration `0018`).

- [ ] **Step 1: Write the migration file**

```sql
-- Stage 3 (Credit System) foundation. See docs/superpowers/specs/2026-07-24-credit-system-design.md.
--
-- generations.credits_consumed has always held raw USD, never credits, despite the name —
-- there is no production data yet (pre-launch MVP), so this is a direct rename, not a
-- backward-compatible migration.
alter table generations rename column credits_consumed to cost_usd;

-- Actual credits deducted at settlement — a denormalized copy of that generation's
-- `consumption` row in credit_transactions (below), written in the same settlement step so
-- the two always agree. Nullable and left unbackfilled: existing rows predate the credit
-- system, and this stays null for every row until sub-plan 3C wires up settlement.
alter table generations add column credits_charged numeric;

-- Append-only ledger. amount is credits: positive for reservation/consumption/adjustment-up,
-- negative for refund. Every generation reaches exactly one terminal state, and every
-- terminal state refunds its reservation exactly once (success: refund + consumption;
-- failure: refund only) — see design spec §4 — so a plain sum of every row is always correct.
create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  generation_id uuid not null references generations(id),
  amount numeric not null,
  type text not null check (type in ('reservation', 'consumption', 'refund', 'adjustment')),
  created_at timestamptz not null default now()
);

create index credit_transactions_org_id_idx on credit_transactions (org_id);
create index credit_transactions_generation_id_idx on credit_transactions (generation_id);
create index credit_transactions_org_id_created_at_idx on credit_transactions (org_id, created_at);

alter table credit_transactions enable row level security;

-- Backstop only (D78 pattern) — the app's real reads go through the service-role client,
-- which bypasses RLS entirely. This just denies direct anon/authenticated REST access to
-- other orgs' ledger rows.
create policy "org isolation" on credit_transactions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Sums every ledger row for the current UTC calendar month per org. Recomputed on every
-- query (a view, not a materialized snapshot) so "this month" always reflects query time.
create view org_credit_usage as
select
  org_id,
  sum(amount) as credits_used
from credit_transactions
where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
group by org_id;

-- monthly_credit_limit was entered before credits vs. USD was defined. 1 credit = $0.001 USD
-- (see design spec §2 — USD_TO_CREDITS), so an admin who typed "500" meaning "$500/month"
-- keeps the same real-world meaning after this one-time ×1000 conversion.
update organizations
  set monthly_credit_limit = monthly_credit_limit * 1000
  where monthly_credit_limit is not null;
```

- [ ] **Step 2: Apply the migration**

Open the Supabase dashboard SQL editor for this project's database, paste the full contents
of `0019_credit_transactions.sql`, and run it.

Expected: no errors. `generations` now has `cost_usd` and `credits_charged` columns (and no
`credits_consumed` column); `credit_transactions` and `org_credit_usage` exist.

- [ ] **Step 3: Verify with a read-only query**

Run in the same SQL editor:

```sql
select column_name from information_schema.columns
where table_name = 'generations' and column_name in ('cost_usd', 'credits_charged', 'credits_consumed');
```

Expected: two rows (`cost_usd`, `credits_charged`) — `credits_consumed` must NOT appear.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_credit_transactions.sql
git commit -m "feat(db): add credit_transactions ledger, rename generations.credits_consumed to cost_usd"
```

---

### Task 2: Rename `credits_consumed` → `cost_usd` across the application

This is one atomic task, not several: the app only compiles and its tests only pass once
every reference agrees with the new column name, so there is no meaningful intermediate
state to verify separately. Each step below touches one file; the verification (build + test)
comes once, at the end, after all files are edited.

**Files:**
- Modify: `src/lib/db/types.ts:110`
- Modify: `src/lib/db/generations.ts:43,51`
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts:307`
- Modify: `src/app/api/nodes/[id]/generate/route.ts:114`
- Modify: `src/lib/generations/complete.ts:130`
- Modify: `src/app/api/nodes/[id]/cost/route.ts:20,27`
- Modify: `src/app/api/canvas/[id]/cost/route.ts:24,31`
- Modify: `src/components/admin/generations-table.tsx:103,105`
- Modify: `src/lib/__tests__/generation-tray-prompts.test.ts:20`
- Modify: `src/lib/canvas-store.test.ts:187`
- Modify: `src/lib/generation-tray.test.ts:57`

**Interfaces:**
- Consumes: Task 1's renamed `generations.cost_usd` and new `generations.credits_charged`
  columns.
- Produces: `GenerationRow.cost_usd: number | null` and `GenerationRow.credits_charged: number
  | null` (both required, non-optional fields on the type — every object literal typed as
  `GenerationRow` must include both). `succeedGeneration({ ..., costUsd?: number, ... })`
  (renamed from `creditsConsumed`) — the exact name every later sub-plan's settlement code
  (3C) must use when calling `succeedGeneration`.

- [ ] **Step 1: Update the `GenerationRow` type**

In `src/lib/db/types.ts`, replace line 110:

```ts
  credits_consumed: number | null;
```

with:

```ts
  cost_usd: number | null;
  credits_charged: number | null;
```

- [ ] **Step 2: Update `src/lib/db/generations.ts`**

Replace the `succeedGeneration` signature and body (lines 40-65):

```ts
export async function succeedGeneration(input: {
  generationId: string;
  versionId: string;
  costUsd?: number;
  outputSnapshot?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {
    status: "succeeded",
    version_id: input.versionId,
    cost_usd: input.costUsd ?? null,
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

(Only `creditsConsumed?: number` → `costUsd?: number` and `credits_consumed: input
.creditsConsumed ?? null` → `cost_usd: input.costUsd ?? null` actually change; the rest of
the function is shown for context/exactness.)

- [ ] **Step 3: Update the 3 `succeedGeneration` call sites**

In `src/app/api/nodes/[id]/image-generate/route.ts`, line 307, change:

```ts
        creditsConsumed: cost?.usd,
```

to:

```ts
        costUsd: cost?.usd,
```

In `src/app/api/nodes/[id]/generate/route.ts`, line 114, change:

```ts
        creditsConsumed: cost?.usd,
```

to:

```ts
        costUsd: cost?.usd,
```

In `src/lib/generations/complete.ts`, line 130, change:

```ts
    creditsConsumed: cost?.usd,
```

to:

```ts
    costUsd: cost?.usd,
```

- [ ] **Step 4: Update the two cost-badge routes**

In `src/app/api/nodes/[id]/cost/route.ts`, lines 20 and 27:

```ts
      .select("credits_consumed")
```

→

```ts
      .select("cost_usd")
```

and

```ts
    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_consumed ?? 0),
      0,
    );
```

→

```ts
    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.cost_usd ?? 0),
      0,
    );
```

In `src/app/api/canvas/[id]/cost/route.ts`, lines 24 and 31, apply the identical two
replacements (same `.select("credits_consumed")` → `.select("cost_usd")` and same
`row.credits_consumed` → `row.cost_usd` inside the reduce).

- [ ] **Step 5: Update the admin generations table**

In `src/components/admin/generations-table.tsx`, lines 102-106, change:

```tsx
                  <span className="flex-1 text-sm text-muted-foreground">
                    {g.credits_consumed === null
                      ? "—"
                      : `₹${(g.credits_consumed * USD_TO_INR).toFixed(2)}`}
                  </span>
```

to:

```tsx
                  <span className="flex-1 text-sm text-muted-foreground">
                    {g.cost_usd === null
                      ? "—"
                      : `₹${(g.cost_usd * USD_TO_INR).toFixed(2)}`}
                  </span>
```

(This column still shows the USD→INR figure under the "Credits" header for now — splitting
it into real Amount/Credits columns is sub-plan 3F's job, once `credits_charged` is actually
populated by 3C. This step only keeps the existing display working against the renamed
column.)

- [ ] **Step 6: Update the 3 test fixtures**

In `src/lib/__tests__/generation-tray-prompts.test.ts`, in `makeJob()` (line 20), change:

```ts
    credits_consumed: 0.001,
```

to:

```ts
    cost_usd: 0.001,
    credits_charged: null,
```

In `src/lib/canvas-store.test.ts`, in `genRow()` (line 187), change:

```ts
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
```

to:

```ts
    inputs_snapshot: null, tokens_used: null, cost_usd: null, credits_charged: null,
```

In `src/lib/generation-tray.test.ts`, in `job()` (line 57), apply the identical change:

```ts
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
```

to:

```ts
    inputs_snapshot: null, tokens_used: null, cost_usd: null, credits_charged: null,
```

- [ ] **Step 7: Confirm no references remain**

Run: `grep -rn "credits_consumed\|creditsConsumed" src/`
Expected: no output (empty).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 9: Test**

Run: `npm test`
Expected: all tests pass (597/597 as of the last full run before this sub-plan, plus/minus
nothing — this task adds no new tests, only fixes fixtures so existing ones keep passing).

- [ ] **Step 10: Commit**

```bash
git add src/lib/db/types.ts src/lib/db/generations.ts \
  src/app/api/nodes/\[id\]/image-generate/route.ts \
  src/app/api/nodes/\[id\]/generate/route.ts \
  src/lib/generations/complete.ts \
  src/app/api/nodes/\[id\]/cost/route.ts \
  src/app/api/canvas/\[id\]/cost/route.ts \
  src/components/admin/generations-table.tsx \
  src/lib/__tests__/generation-tray-prompts.test.ts \
  src/lib/canvas-store.test.ts \
  src/lib/generation-tray.test.ts
git commit -m "refactor: rename credits_consumed to cost_usd, add credits_charged field"
```

---

## Self-Review

**1. Spec coverage.** Design spec §2 (credit unit, `USD_TO_CREDITS` conceptually) — not code
yet, that constant lands in 3B/3C where it's first consumed; §3 (`generations.cost_usd` +
`credits_charged` rename) — Task 2; new `credit_transactions` table + RLS — Task 1; `org_credit_usage`
view — Task 1; `monthly_credit_limit` ×1000 data migration — Task 1, Step 1. Everything else
in the design spec (reservation/settlement, estimate functions, reconciliation sweep,
admin/focus-view UI) is out of scope for 3A per the index doc — deferred to 3B-3F.

**2. Placeholder scan.** No TBD/TODO. Every step shows exact before/after code or an exact
SQL block. No "similar to Task N" — Step 4's second replacement is spelled out as identical
rather than assumed, but the exact strings are given in Step 4's first replacement immediately
above it, so nothing is left for the implementer to reconstruct.

**3. Type consistency.** `GenerationRow.cost_usd`/`credits_charged` (Task 2 Step 1) matches
every consumer: `generations.ts`'s `cost_usd: input.costUsd ?? null` (Step 2), the 3 route
call sites' `costUsd: cost?.usd` (Step 3), the cost-badge routes' `.select("cost_usd")` /
`row.cost_usd` (Step 4), the admin table's `g.cost_usd` (Step 5), and all 3 test fixtures
(Step 6). `succeedGeneration`'s new `costUsd?: number` parameter name is used identically at
all 3 call sites — no lingering `creditsConsumed` anywhere (checked mechanically in Step 7).

No gaps found.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3a-schema.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
