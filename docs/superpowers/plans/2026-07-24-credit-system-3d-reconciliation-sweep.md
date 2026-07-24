# Credit System 3D — Reconciliation Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing stays stuck. Every reservation eventually gets refunded — even a generation
whose worker crashed mid-task (bypassing its own `try/catch`), or one where the fail-then-
refund cleanup itself partially failed (the gap found while reviewing 3C's final task).

**Architecture:** A new DB view, `stuck_reservations`, does the actual "what needs fixing"
query in Postgres (a `NOT EXISTS` anti-join credit_transactions can't cleanly express through
the PostgREST query builder — same reasoning that made `org_credit_usage` a view rather than
client-side aggregation). A new scheduled Trigger.dev task,
`trigger/reconcile-stuck-generations.ts`, reads that view every 15 minutes and closes out
whatever it finds, reusing 3C's own idempotent `failGeneration`/`refundReservation` — no new
ledger-writing logic, just new orchestration around functions that already exist and are
already safe to call more than once.

**Tech Stack:** Supabase Postgres (a plain view, no RPC needed — no parameters, the 15-minute
threshold is a fixed design constant), Trigger.dev v3 `schedules.task`.

## Global Constraints

- **`trigger/*.ts` files never statically import a `@/lib/*` module that carries `import
  "server-only"`.** Confirmed by reading both existing task files: `trigger/video-generate.ts`
  has one `@/lib` import (`video-gen/registry`, which is `server-only`) and it's dynamic,
  inside `run`. `trigger/kb-build.ts` has one static `@/lib` import (`kb/build-message`) —
  safe there specifically because that module carries no `server-only` sentinel, not because
  the rule is "never import `@/lib` statically" in general. This matters here because
  `@/lib/db/generations.ts`, `@/lib/db/credit-transactions.ts`, and `@/lib/supabase/server.ts`
  all carry `import "server-only"` — a Next.js-specific sentinel not meant to be statically
  bundled into Trigger.dev's separate build. Follow this exactly: every `@/lib` import in the
  new task file is a dynamic `await import(...)` inside `run`.
- **The sweep covers two cases with one query, not two.** A row can need reconciling either
  because it's still `running` past the timeout, or because it's already terminal (`failed`)
  but its reservation was never refunded (the fail-then-refund race found in 3C's Task 7
  review: `failGeneration` succeeds, the immediately-following `refundReservation` call
  itself throws). The `stuck_reservations` view returns both kinds in one read — the task
  branches on the generation's *current* status to decide whether `failGeneration` is still
  needed before refunding.
- **Reuse 3C's functions verbatim — no new ledger-writing code.** `failGeneration` (already
  exported from `@/lib/db/generations.ts`) and `refundReservation` (already exported from
  `@/lib/db/credit-transactions.ts`, already idempotent — safe to call on a generation that
  turns out to already be settled/refunded) are the only two functions this task calls to
  actually change anything.
- **One row's failure must not abort the whole sweep.** Each row is processed in its own
  `try/catch`; a failure is logged and the loop continues — the next scheduled run 15 minutes
  later will pick up anything still unresolved regardless.
- **15 minutes is a fixed threshold, not configurable** — 5-minute buffer above
  `video-generate.ts`'s hard `maxDuration: 600` (10 minutes); image/prompt generations are
  synchronous HTTP requests that should never legitimately still be `running` this long.
- No unit test for the migration (SQL) or the trigger task (I/O-bound, calls live DB
  functions) — matches this repo's established convention. Verified by `npm run build` +
  manual staging verification (actually triggering a stuck generation and confirming the
  sweep closes it out is beyond what can be verified in this environment — noted as a
  staging-only checklist item, same as this project's other cross-cutting acceptance items).

---

### Task 1: `stuck_reservations` view

**Files:**
- Create: `supabase/migrations/0021_stuck_reservations.sql`

**Interfaces:**
- Produces: view `stuck_reservations(generation_id uuid, org_id uuid)` — every reservation
  older than 15 minutes with no matching `refund` or `consumption` row for the same
  `generation_id`. The exact columns Task 2's sweep selects.

- [ ] **Step 1: Write the migration file**

```sql
-- Stage 3 (Credit System) reconciliation sweep. See
-- docs/superpowers/specs/2026-07-24-credit-system-design.md §4, and the 3D scope note added
-- to docs/superpowers/plans/2026-07-24-credit-system-index.md after 3C's final review.
--
-- Every reservation row with no matching refund/consumption row for the same generation,
-- older than the 15-minute threshold (5-minute buffer above video-generate.ts's hard
-- maxDuration: 600). Covers two distinct real cases with one query: a generation still
-- stuck in `running` (the worker crashed or was force-killed, bypassing its own try/catch),
-- and a generation that's already `failed` but whose refund itself failed on a prior attempt
-- (found during 3C's Task 7 review — failGeneration succeeding while the immediately-
-- following refundReservation call throws). The reconciliation task (trigger/
-- reconcile-stuck-generations.ts) reads this and branches on the generation's current
-- status to decide whether failGeneration is still needed before refunding.
create view stuck_reservations as
select r.generation_id, r.org_id
from credit_transactions r
where r.type = 'reservation'
  and r.created_at < now() - interval '15 minutes'
  and not exists (
    select 1 from credit_transactions t
    where t.generation_id = r.generation_id
      and t.type in ('refund', 'consumption')
  );
```

- [ ] **Step 2: Apply the migration**

Run the full contents of `0021_stuck_reservations.sql` in the Supabase dashboard SQL editor.
Expected: no errors.

- [ ] **Step 3: Verify with a read-only query**

Run: `select * from stuck_reservations limit 1;`
Expected: no errors (an empty result is correct — there should be no genuinely stuck
generations at migration time; this just confirms the view is queryable and its column
types are sane).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0021_stuck_reservations.sql
git commit -m "feat(db): add stuck_reservations view for the reconciliation sweep"
```

---

### Task 2: `reconcile-stuck-generations` scheduled task

**Files:**
- Create: `trigger/reconcile-stuck-generations.ts`

**Interfaces:**
- Consumes: `stuck_reservations` (Task 1), `getGeneration`/`failGeneration`
  (`@/lib/db/generations`, existing), `refundReservation` (`@/lib/db/credit-transactions`,
  sub-plan 3C).
- Produces: a Trigger.dev scheduled task, auto-discovered from `trigger.config.ts`'s
  `dirs: ["./trigger"]` — no separate registration step.

No test for this task (I/O-bound, calls live DB functions — matches this repo's convention
for `trigger/*.ts` files, none of which have unit tests today either). Verified by
`npm run build` only; full end-to-end behavior (actually letting a generation get stuck and
confirming the sweep closes it) is a manual staging check, listed in the Testing section
below.

- [ ] **Step 1: Write the task file**

```ts
// trigger/reconcile-stuck-generations.ts
// See docs/superpowers/specs/2026-07-24-credit-system-design.md §4. Every @/lib import here
// is dynamic (await import(...)), not static — those modules carry `import "server-only"`,
// a Next.js-specific sentinel not meant for Trigger.dev's separate build. Matches the
// existing convention in trigger/video-generate.ts and trigger/kb-build.ts exactly (neither
// has a single static @/lib import).
import { schedules, logger } from "@trigger.dev/sdk/v3";

export const reconcileStuckGenerationsTask = schedules.task({
  id: "reconcile-stuck-generations",
  cron: "*/15 * * * *",
  run: async () => {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const { getGeneration, failGeneration } = await import("@/lib/db/generations");
    const { refundReservation } = await import("@/lib/db/credit-transactions");

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("stuck_reservations")
      .select("generation_id, org_id");
    if (error) throw error;

    const rows = (data ?? []) as { generation_id: string; org_id: string }[];
    logger.info("Reconciliation sweep found stuck reservations", { count: rows.length });

    for (const row of rows) {
      try {
        const generation = await getGeneration(row.generation_id);
        // Already-terminal rows here mean a prior refund attempt itself failed (see the
        // migration's comment) — failGeneration was already called once; calling it again
        // would be redundant, not incorrect, but skipping it keeps the log signal clean.
        if (generation.status === "running") {
          await failGeneration({
            generationId: row.generation_id,
            error: "Generation timed out — no response from provider",
          });
        }
        // Idempotent (sub-plan 3C) — safe even if a concurrent request already resolved
        // this generation between the view read above and this call.
        await refundReservation({ orgId: row.org_id, generationId: row.generation_id });
        logger.info("Reconciled stuck generation", {
          generationId: row.generation_id,
          priorStatus: generation.status,
        });
      } catch (e) {
        // One bad row must not abort the sweep — log and continue; the next scheduled run
        // picks up anything still unresolved regardless.
        logger.error("Failed to reconcile stuck generation", {
          generationId: row.generation_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add trigger/reconcile-stuck-generations.ts
git commit -m "feat(credits): add reconcile-stuck-generations scheduled sweep"
```

---

## Self-Review

**1. Spec coverage.** Design spec §4's reconciliation sweep — Tasks 1+2 in full: 15-minute
threshold, scheduled Trigger.dev task, `failGeneration` + the same refund every other failure
path already writes. The 3D scope note added after 3C's Task 7 review (terminal-but-
unrefunded rows, not just `status = 'running'`) — covered by the view's `NOT EXISTS`
anti-join catching both cases in one query, and the task's status-branch logic.

**2. Placeholder scan.** No TBD/TODO. Both files show complete, exact code.

**3. Type consistency.** `stuck_reservations`' two columns (`generation_id`, `org_id`) match
exactly what Task 2's `.select("generation_id, org_id")` reads and how `getGeneration`/
`failGeneration`/`refundReservation` are called (`getGeneration(row.generation_id)`,
`failGeneration({ generationId: row.generation_id, error })`, `refundReservation({ orgId:
row.org_id, generationId: row.generation_id })`) — same names used identically to their
existing exported signatures in `@/lib/db/generations.ts` and
`@/lib/db/credit-transactions.ts`.

No gaps found.

---

## Testing (manual staging checklist — carried into the Stage 3 shippable checklist)

- [ ] A generation stuck in `running` for >15 minutes gets picked up by the sweep, marked
      `failed`, and its reservation refunded (design spec §8's existing checklist item)
- [ ] A `failed` generation whose refund previously failed (simulate: temporarily break
      `refundReservation` for one call, confirm the row lands in `stuck_reservations`, restore
      it, confirm the next sweep run refunds it without re-calling `failGeneration`)
- [ ] The sweep runs on its 15-minute schedule in the Trigger.dev dashboard (staging
      environment) without manual triggering

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3d-reconciliation-sweep.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
