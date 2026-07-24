# CreativeOS — Credit System (Stage 3)

**Date:** 2026-07-24
**Status:** Approved
**Builds on:** `2026-07-21-auth-staging-rollout-plan.md` Stage 3 (ADR D77) — this doc supersedes
that section's sketch with a fully worked-out design; the append-only-ledger /
row-locked-reservation shape D77 chose stands, this fills in the unit, the estimate
mechanism, and the UI surface it didn't specify.
**ADR:** D77 (refined)

---

## 1. Why

Stage 1/2 shipped org isolation and an admin view of *what* generations happened, but nothing
stops an org from generating past whatever budget was agreed with them, and nothing shows a
user what a generation will cost *before* they commit to it — every other AI image/video SaaS
does the latter, and its absence is a real gap. This stage adds both: a real credit ledger
that enforces a monthly cap, and a pre-generation cost estimate surfaced in the UI.

---

## 2. What a credit is

**1 credit = $0.001 USD** (confirmed after review — chosen over 1:1 or 1:$0.01 because it
keeps the app's actual cost range, roughly $0.0025–$2.13 per generation today, in a
readable low-hundreds range: a $0.0025 generation ≈ 2.5 credits, a $2.13 video ≈ 2,130
credits, a $500/month cap = 500,000 credits).

USD remains the tracked source of truth exactly as today (`computeVideoCost`/
`computeImageCost`/`computeCost` all still return `.usd`; `generations.credits_consumed`
keeps storing that raw USD number, unchanged). Credits are a display/ledger-unit conversion
applied on top (`credits = usd * 1000`), not a replacement for USD tracking.

`organizations.monthly_credit_limit` is reinterpreted as a **credit** count, not a raw USD
number. Every value currently on staging was entered under the old (undefined) assumption —
these need a one-time `× 1000` migration alongside the schema change, so an admin who typed
"500" meaning "$500/month" ends up with a limit that still means the same thing.

---

## 3. Data model

New table, `credit_transactions` (org_id + RLS, per D78's standing rule for new tables):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `org_id` | uuid, not null | RLS scope |
| `generation_id` | uuid, not null | FK to `generations` |
| `amount` | numeric | credits (positive for reservation/consumption/adjustment-up, negative for refund) |
| `type` | text | `reservation` \| `consumption` \| `refund` \| `adjustment` |
| `created_at` | timestamptz | |

A new `org_credit_usage` DB view sums this-UTC-month `reservation + consumption` rows per
org, read by the admin Overview tab (§6) and by `reserveCredits` itself (§4).

---

## 4. Reservation, settlement, refund

`reserveCredits(orgId, generationId, estimatedAmount)`:
1. Row-locks the org (`SELECT ... FOR UPDATE` on `organizations`).
2. Sums this-**UTC**-month `reservation + consumption` rows for the org from
   `credit_transactions` (month boundary pinned to UTC, not server-local time — this was an
   explicit checklist item in the original Stage 3 scope).
3. If `sum + estimatedAmount > monthly_credit_limit` (and limit is not `null` — Yuvabe's own
   org and any `null`-limit org always proceeds), reject.
4. Else insert a `reservation` row for `estimatedAmount`, return success.

**Call order in all 3 creation routes** (`generate`, `image-generate`, `video-generate`):
`insertGeneration()` (as today, status `running`) → `reserveCredits(orgId, generation.id,
estimate)` → if rejected, `failGeneration()` with a clear "monthly credit limit reached"
message and return an error response (image/prompt: 402; video: never fires the Trigger.dev
task) → if accepted, proceed exactly as today (call the provider / fire the task).
`generation.id` must exist before reserving, since `credit_transactions.generation_id` is
not-null — this is why reservation happens after `insertGeneration`, not before.

**Settlement (success):** insert a `consumption` row for the *actual* cost (from the existing
real-usage-based `computeVideoCost`/`computeImageCost`/`computeCost` calls, unchanged) —
`succeedGeneration`'s call sites in all 3 routes plus `completeGeneration()` (video's webhook
path) each gain this one extra ledger write, right where `creditsConsumed` is already
computed today.

**Refund (failure/cancel):** insert a `refund` row for `-estimatedAmount`, zeroing the
reservation out — at every existing `failGeneration()` call site (image/prompt's synchronous
catch blocks, `completeGeneration()`'s failure branch, and the webhook's org-mismatch
drop-path, which already exists per D79).

This mirrors the async-worker-revalidation pattern D79 already established for org
mismatches — same shape, applied to credits.

---

## 5. Pre-generation estimate

Shown in the UI next to each focus view's Generate button (video-gen-focus-view.tsx:844,
image-gen-focus-view.tsx, prompt-focus-view.tsx — same integration point in all three:
recomputed reactively as the user changes model/params, before they click Generate).

All three estimate functions below return a **USD** number (matching the existing cost
functions' return shape) — the `× 1000` conversion to credits happens once, at the call site,
right before it's passed as `reserveCredits`' `estimatedAmount`. The client-displayed number
is never trusted as the reservation input: the route handler recomputes the estimate
server-side from the same request params (`modelId`, `quality`/`size`, or `duration`/`audio`)
it already has, the same way it already independently computes actual cost at settlement — a
client could otherwise submit a fabricated low estimate to slip past the cap.

- **Video — exact.** `computeVideoCost(modelId, durationSeconds, audioEnabled, resolution?)` —
  already sourced, already exists (signature updated post-merge: Kling's 5 current models
  were rewritten against verified pricing docs — D90 — and now price by resolution as well
  as audio, via a separate `KLING_RESOLUTION_PRICING` table; Veo/Sora keep the simpler
  duration×rate×audio-multiplier shape, unaffected). Duration, audio, and (for Kling)
  resolution are all known request params before firing the task, so this stays exact. One
  inherited caveat, already flagged inline in that file: `kling-o1`'s audio-on pricing is
  marked `ASSUMPTION` (reused from `kling-3-0`'s delta, since Kling's pricing page doesn't
  split it out for o1) — not this stage's gap to fix, just worth knowing the estimate
  inherits that one model's uncertainty.
- **Image — exact.** New lookup table, `IMAGE_ESTIMATE_TABLE` in `src/lib/image-gen/cost.ts`,
  keyed by model + quality + size, giving the exact USD cost — sourced today directly from
  OpenAI's and Google's own docs (not derived from the token-based `IMAGE_MODEL_PRICING` used
  for actual-cost settlement, since gpt-image-2 has no public token table, only published
  dollar figures per quality/size):

  | Model | Low (1024×1024 / ×1536 / 1536×) | Medium | High |
  |---|---|---|---|
  | `gpt-image-2` | $0.006 / $0.005 / $0.005 | $0.053 / $0.041 / $0.041 | $0.211 / $0.165 / $0.165 |
  | `gpt-image-1` | $0.011 / $0.016 / $0.016 | $0.042 / $0.063 / $0.063 | $0.167 / $0.25 / $0.25 |
  | `gpt-image-1-mini` | $0.005 / $0.006 / $0.006 | $0.011 / $0.015 / $0.015 | $0.036 / $0.052 / $0.052 |
  | `gemini-2.5-flash-image` | flat $0.039/image (no quality/size tiers) |
  | `gemini-3.1-flash-image` | $0.045 (512px) / $0.067 (1024px) / $0.101 (2048px) / $0.151 (4096px) |
  | `gemini-3-pro-image` | $0.134 (1K/2K) / $0.24 (4K) |

  (These figures were fully cross-checked against this app's existing per-token
  `IMAGE_MODEL_PRICING` rates where a token count was independently known — e.g. `gpt-image-1`
  Medium/1024×1024: 1056 tokens × $40/1M = $0.0422 ≈ the table's $0.042 — before being treated
  as trusted.) The app's aspect-ratio system (`ASPECT_RATIO_TO_OPENAI_SIZE`) only ever
  produces the three OpenAI sizes in this table, so every real request maps cleanly.

  **Input tokens — partially covered, on purpose.** OpenAI's own docs are explicit that "the
  final cost is the sum of: input text tokens, input image tokens if using the edits
  endpoint, image output tokens" — the table above is output-only. This estimate adds
  **prompt text tokens** (exact — a standard tokenizer count on the already-known prompt
  string × the model's existing `textIn` rate, no research needed). It **excludes reference/
  edit image input tokens** (this app allows up to 16 reference images per generation):
  repeated research attempts (automated fetch and a manual page check) could not reliably
  source OpenAI's input-image-token formula, unlike the output table above which was
  cross-checked and confirmed. This means the pre-click estimate can undershoot for
  edit-heavy generations with many/large reference images — **not a financial-integrity
  problem**, since settlement (§4) always corrects the ledger to the real actual cost
  afterward regardless of what the estimate said; it only means the number shown before
  clicking Generate is occasionally optimistic for that specific case. Worth a follow-up once
  a trusted source for that formula turns up, not a blocker for this stage.

- **Prompt/text — approximate, explicitly labeled "~estimated".** No vendor can predict an
  LLM's output length before it generates (confirmed — OpenAI's "Predicted Outputs" feature
  requires *you* to already know the output; it doesn't forecast an unknown one). Formula:
  `fixed_base + (per_attached_node_multiplier × count of upstream nodes connected to the
  prompt node)`. `fixed_base` and the multiplier are derived from this app's own historical
  `credits_consumed` data (regression: average cost at 0 attachments ≈ base, average
  incremental cost per attachment ≈ multiplier), recomputed periodically as more real usage
  accumulates; a conservative placeholder value is used until there's enough history to fit
  from (this app has no prompt-type generation history yet on staging).

---

## 6. Admin pages

The Overview tab's existing "Monthly credit limit" stat tile (built in AX-C) gains a sibling
"Used this month" tile, reading `org_credit_usage`. No new pages — this fills in the number
that tile's "Edit in Settings" note already implicitly promised.

---

## 7. Corrections already applied (not blocked on this stage)

Found while sourcing the image estimate table, already fixed and committed independently of
this plan (commits `1d66232`):
- `gemini-3-pro-image`'s actual-cost `imgOut` rate was `80.00` (marked "estimated — update
  when Google publishes"); Google has published it — corrected to the real `120.00`. Every
  past generation with this model under-recorded cost by 33%; **not backfilled**, going
  forward only, per explicit decision.
- `gemini-3.1-flash-image` / `gemini-3-pro-image` had split `textIn`/`imgIn` rates; Google
  prices combined text+image input as one rate — both fields set equal to that single
  published rate so the existing formula still sums correctly.

---

## 8. Testing / error handling

No dedicated component/route tests per this repo's established convention (pure-logic only —
see the admin-ux-index doc's testing-convention note, which applies here too). New pure
functions get real unit tests: the credit-unit conversion (`usd → credits`), the image
estimate lookup, and the prompt estimate formula (given fixed inputs, deterministic output)
are all genuinely pure and testable. `reserveCredits`' row-locking and the settlement/refund
wiring are Supabase-query-driven like every other `src/lib/db/*.ts` function in this codebase
— verified via `npm run build` + manual staging checks, not new tests.

Shippable checklist (carried from the original Stage 3 scope, still the right acceptance
bar):
- [ ] Two concurrent generation requests near an org's cap: exactly one is admitted, the
      other is rejected with a clear "monthly credit limit reached" message
- [ ] Viewing/editing/approving remain unaffected when an org is at its cap
- [ ] Yuvabe org (`null` limit) always proceeds and still logs a reservation row
- [ ] A failed/cancelled job's reservation is refunded, not left dangling
- [ ] Month boundary confirmed pinned to UTC, not server-local time
- [ ] Admin org list / Overview tab shows live `used / limit` matching the ledger
- [ ] Pre-generation estimate shown in all three focus views, updates when params change
- [ ] `monthly_credit_limit` values already on staging correctly ×1000-migrated
