# Credit System (Stage 3) — Plan Index

**Spec:** `docs/superpowers/specs/2026-07-24-credit-system-design.md` (approved), with
`2026-07-24-credit-system-pricing-sources.md` and `2026-07-24-credit-system-full-combinations.md`
as data references.

Same just-in-time decomposition used for the auth rollout (Stage 1: 1A-1D, Stage 2: 2A-2C)
and the admin UX work (AX-A through AX-E): write one sub-plan, execute + review it, then
write the next. This file tracks scope and status; each sub-plan gets its own file with
full task-level detail.

## Sub-plans

- **3A — Schema + the rename it requires** (design spec §2, §3)
  New `credit_transactions` table + RLS + `org_credit_usage` view. `generations
  .credits_consumed` → `cost_usd` (it always held raw USD, never credits) + new
  `credits_charged` column. `monthly_credit_limit` ×1000 migration. The rename touches 9
  application files and 3 test fixtures — done in the same sub-plan as the migration, since
  a partial rename leaves the build broken either way.
  → `2026-07-24-credit-system-3a-schema.md`. **Status: complete** (migration `0019` applied
  to Supabase; rename landed in commit `25e1234`, task review clean, 597/597 tests passing).

- **3B — Pre-generation estimate functions + credit-unit conversion** (design spec §2a, §5)
  `src/lib/credits/units.ts`: `USD_TO_CREDITS`/`MARGIN_PERCENT`/`CREDIT_ROUND_STEP`/
  `CREDIT_ROUND_DIRECTION` constants and the shared `usdToFinalCredits(costUsd)` function
  (margin then round-up-to-nearest-5, per §2a — used by both the estimate display and
  settlement, so what's shown always matches what's charged). `IMAGE_ESTIMATE_TABLE` (OpenAI
  + Gemini, output cost by quality/size) in `image-gen/cost.ts`. Input-token counting via
  each provider's live official endpoint (`ai.models.countTokens()` for Gemini,
  `client.responses.input_tokens.count()` for OpenAI) — both client- and server-side.
  Prompt/text estimate formula (`fixed_base + per_attached_node_multiplier × attachment
  count`, starting placeholder 10/5 credits). Video needs no new code — `computeVideoCost`
  already covers it. Pure functions, no ledger dependency — can build and unit-test
  independently of 3A's schema. Also resolved during 3B's write-up: `quality: "auto"` on
  `gpt-image-2`/`gpt-image-1` has no published price (found via the same params-vs-pricing
  audit method as the kling-2-6/sora-2 bugs) — estimated at `"high"` (worst case).
  → `2026-07-24-credit-system-3b-estimate-functions.md`. **Status: complete** (all 5 tasks
  implemented and reviewed clean; 87/87 test files, 611/611 tests passing).

- **3C — Reservation, settlement, refund** (design spec §4)
  `reserveCredits(orgId, generationId, estimatedAmount)` (row-locked via a new
  `reserve_credits` RPC, same shape as `acquire_canvas_lock`; UTC-month-scoped), where
  `estimatedAmount`/settlement's `credits_charged` are both always produced via 3B's
  `usdToFinalCredits`, never a raw USD number. Wired into all 3 creation routes (`generate`,
  `image-generate`, `video-generate`) before the provider call, and into every terminal-state
  path (success: refund + consumption; failure: refund only — the corrected
  double-counting-safe rule) across all 4 files that settle/fail a generation, including a
  real bug found while writing this plan: the video webhook's org-mismatch drop-path never
  called `failGeneration` at all, leaving the row stuck `running` forever — fixed to fail +
  refund immediately. Also resolved: images fail closed (never reserve/generate) when
  `estimateImageOutputCost` returns `null`; OpenAI's split text/image input-token rates are
  priced worst-case (the higher rate, for the whole count) whenever the live token count
  can't be split by the provider. Depends on 3A's schema and 3B's estimate functions +
  `usdToFinalCredits`.
  → `2026-07-24-credit-system-3c-reservation-settlement.md`. **Status: complete** (all 7
  tasks implemented and reviewed clean, including a real double-refund race caught during
  Task 5's review and fixed centrally in `credit-transactions.ts`, commit `e0487cd`;
  87/87 test files, 616/616 tests passing).

- **3D — Reconciliation sweep** (design spec §4)
  New scheduled Trigger.dev task, `trigger/reconcile-stuck-generations.ts`, closing out
  anything stuck in `running` past 15 minutes. Depends on 3C's refund path (reuses it
  exactly). **Scope note added while reviewing 3C's final task:** `failAndRefund` (and every
  route's own fail-then-refund sequence) calls `failGeneration` then `refundReservation`
  non-atomically — if the generation update succeeds but the refund call itself then throws,
  the row becomes terminal (`failed`) with its reservation never refunded, and 3C's own
  idempotency guard (`if status !== "running"`) means nothing else will ever retry it. 3D's
  sweep needs to catch this case too, not just rows stuck in `running` — i.e. also find
  terminal (`failed`/`succeeded`) rows with an outstanding, unrefunded `reservation` ledger
  row (a `reservation` with no matching `refund`/`consumption` row for that
  `generation_id`), not only `status = 'running'` past the timeout.
  → `2026-07-24-credit-system-3d-reconciliation-sweep.md`. **Status: complete** (both tasks
  implemented and reviewed; one doc-accuracy fix along the way, no functional issues;
  `npx tsc --noEmit` clean).

- **3E — Pre-generation estimate UI** (design spec §5)
  Wire the 3B estimate functions into the three focus views
  (`video-gen-focus-view.tsx:844`, `image-gen-focus-view.tsx`, `prompt-focus-view.tsx`),
  reactive to param changes, shown next to each Generate button. Video/prompt compute fully
  client-side (pure functions, no network call); image needs one new read-only route
  (`image-generate/estimate`) since live token counting can't run in the browser — the exact
  computation is extracted out of 3C's already-shipped reservation logic
  (`estimateImageGenerationCostUsd`) so both call sites can never drift apart. Scoped to each
  view's primary Generate button only — the image view's separate Edit-mode button is
  explicitly out of scope (stated in the plan, not silently dropped). Depends on 3B.
  → `2026-07-24-credit-system-3e-estimate-ui.md`. **Status: plan written, not yet executed.**

- **3F — Admin UI wiring** (design spec §6)
  Overview tab gains a "Used this month" tile (`org_credit_usage`). Generations table splits
  its one "Credits" (really USD) column into real Amount ($, `cost_usd`) and Credits
  (`credits_charged`) columns. Depends on 3A's renamed/new fields and 3C actually writing
  real `credits_charged` values (before 3C, this column is always `null`). **Status: not
  started.**

## Testing convention note (applies to every sub-plan)

Same as the admin-ux and prior auth-rollout plans: this repo's vitest config runs in plain
Node (no jsdom/RTL) — unit tests exist only for pure logic. New pure functions (credit-unit
conversion, the image estimate lookup, the prompt estimate formula) get real unit tests.
Route/DB/UI changes get a build check (`npm run build`) + `npm test` regression + manual
staging verification, not fabricated component/route tests.
