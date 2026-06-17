# Eval system — architecture & flywheel

**Date:** 2026-06-16
**Status:** Implemented (Steps 1–3 built; Step 4 deferred)
**Area:** Eval → image-prompt quality measurement

## Problem

Every AI node in CreativeOS is steered by a hand-written prompt (`src/prompts/*.ts`). Without
measurement, improving those prompts is vibe-checking — "I think v2 is better" with no evidence.
Stage 3 (Image Gen) multiplies the prompt surface; instrumenting now, before it ships, means image
and video prompts are measurable from day one instead of accruing un-evaluated debt.

Full rationale: `docs/evals/2026-06-14-eval-flywheel-rationale.md`.

## Goals

- Preserve raw model output before any human edit overwrites it (Step 1 — D22).
- Produce a controlled 20-trace dataset from real Prakriti scripts (Step 2 — bootstrap).
- Manual open-coding UI: read each trace, mark pass/fail, write a free-text note (Step 3).
- [Deferred] LLM-judge auto-scorers, trained on human labels (Step 4).

## Non-goals

- No hosted eval platform (Braintrust/Promptfoo) — a local loop is right at this team size.
- No automatic prompt optimization — a golden dataset must exist first.
- No per-keystroke edit history — two points (raw generation, shipped output) are what error analysis consumes.
- Step 4 (LLM-as-judge) is not built; it follows after axial coding produces named failure modes.

## Design

### A. The 4-step flywheel

The loop: **capture → accumulate → error-analysis → automate** (not "install a metrics dashboard").
Method: Hamel Husain + Shreya Shankar (error analysis first; binary pass/fail; bespoke metrics from
your own failure modes, not generic rubrics).

| Step | What | Files | Status |
|------|------|-------|--------|
| **1. Capture** | Freeze raw model output in `generated_output` before it can be overwritten by a designer edit | `src/lib/db/versions.ts`, migration `0005` | Done (D22) |
| **2. Bootstrap** | Run 20 real-script shots through the live Prompt node; park traces on a dedicated eval canvas | `src/app/api/eval-bootstrap/route.ts` (throwaway) | Done (Run 01) |
| **3. Review** | Open-coding UI: one trace per screen, pass/fail toggle, note, hotkeys | `src/app/eval/`, `src/components/eval/` | Built |
| **4. Auto-score** | LLM judge aligned to human labels; re-run at scale | — | Deferred |

Each turn of the loop: **fix top failure in `prompt-generate` → re-run bootstrap → re-label → compare
pass-rate.** The 20-shot fixture stays frozen (same inputs, same brand context, same model); only the
prompt changes. That isolation is what makes "homogeneity 18/20 → 4/20" a meaningful number.

### B. Data model

The eval system reads and writes a single table: **`node_versions`**. Most columns already existed;
Steps 1 and 3 each add one write path.

| Column | Written by | Meaning |
|--------|-----------|---------|
| `inputs_used` | generation route | `{ scriptNum, scriptTitle, reelType, shotIndex, shotText, compiledUser, … }` — the full input context |
| `params_used` | generation route | `{ promptId, promptVersion, model, tokensUsed, … }` — which prompt/model produced this |
| `output` | generation route + designer edits | **mutable** working copy; designer edits happen here |
| `generated_output` | `insertVersion` (Step 1) | **frozen** raw model output; written once, never updated |
| `decision` | `setVersionLabelAction` (Step 3) | `"pass"` / `"fail"` / `null` |
| `note` | `setVersionLabelAction` (Step 3) | free-text open-coding annotation |

`generated_output ≠ output` after a designer edits → **that divergence is the correction signal** (the
single most valuable eval input; see rationale §5). Losing it by overwriting is unrecoverable.

Key type assembled by the review layer:

```ts
type EvalTrace = {
  nodeId: string;
  versionId: string;
  evalKey: string;                    // "s{scriptNum}-shot{shotIndex}"
  scriptNum: number;
  scriptTitle: string;
  reelType: string;                   // "VISUAL" | "VO" | "TEXT"
  shotIndex: number;
  shotText: string;                   // inputs_used.shotText — the "source shot" panel
  prompt: string;                     // generated_output ?? output — the "generated prompt" panel
  decision: "pass" | "fail" | null;
  note: string | null;
};
```

### C. Step 1 — raw capture

**The only time-sensitive piece.** Every designer edit before Step 1 ships is a correction lost
forever. A new `generated_output` column on `node_versions` captures the model's raw output at
generation time and is never touched again.

- Migration: [supabase/migrations/0005_generated_output.sql](../../supabase/migrations/0005_generated_output.sql)
- Writer: `src/lib/db/versions.ts` → `insertVersion(nodeId, { inputs_used, params_used, model_used, output })` — `output` is copied into `generated_output` at insert time.
- Rule: `generated_output` is set once on insert. No update path exists for it.

### D. Step 2 — bootstrap

A one-time, throwaway route that produces the first dataset without waiting for organic usage.
Follows Hamel's rule: **generate inputs, not outputs** — the 53 real Prakriti scripts are the
inputs; the image prompts must come from running the *real* Prompt node.

**Data flow:**

```
docs/context-refs/Prakriti - satva/Prakriti Sattva Reel 52 Scripts.md
  → split on ## **#N** headers → deduplicate (file contains two copies) → 53 unique scripts
  → stratified-select 20 (even stride across #1–#53, shot index varied 0–4 for coverage)
  → per selected shot:
      real Script-parse  (scriptParsePrompt v1, gpt-5.4-mini)    → ReelScript
      narrow to one shot (D21)                                    → narrowed script
      renderScriptAsText(narrowed)                                → shotText
      compilePrompt({ clientContext: KB slices, upstream:[shot] }) → compiledUser
      promptGeneratePrompt v2 (gpt-5.4-mini)                     → image prompt
      find-or-create Prompt node  (idempotent: evalKey = "s{n}-shot{i}" on data.evalKey)
      insertVersion(...)                                          → generated_output captured
```

**Why one node per shot (not 20 versions of one node):** a `node_versions` row means *an attempt at
that node's task* (D4). 20 different shots = 20 different tasks → 20 different nodes, one version
each. A re-run with `prompt-generate` v3 appends a *new version to the same node*, giving a clean
before/after diff per shot.

- Route: [src/app/api/eval-bootstrap/route.ts](../../src/app/api/eval-bootstrap/route.ts) — **throwaway; delete after use.** Logic is preserved in the Run-01 log for reproducibility.
- Eval canvas: `6508a73f-…` (slug `eval-harness`), client `prakriti-satva`.
- `?dry=1` prints the 20 selected shots without making any LLM calls.
- Run 01 result: 20/20 generated, 0 failures. Full record: [docs/evals/2026-06-14-run-01-prakriti-image-prompt-bootstrap.md](../../evals/2026-06-14-run-01-prakriti-image-prompt-bootstrap.md).

### E. Step 3 — review UI

A focused screen for **open coding**: one trace at a time, fast to navigate, labels persist immediately.

**Route:** `/eval/[canvasId]`

**Component tree:**

```
src/app/eval/[canvasId]/page.tsx        server — listEvalTraces(canvasId) → <ReviewScreen traces>
src/components/eval/review-screen.tsx   client — index state, hotkeys, save orchestration
src/components/eval/trace-panels.tsx    source shot (top) + generated prompt (below, scrollable)
src/components/eval/label-bar.tsx       pass/fail toggle · note textarea · save&next (sticky bottom)
```

**DB layer:**

| File | Export | What |
|------|--------|------|
| `src/lib/db/eval.ts` | `listEvalTraces(canvasId)` | Fetches prompt nodes on the canvas + each node's active version; returns raw rows |
| `src/lib/eval/map-traces.ts` | `mapEvalTraces(nodes, versions)` | Pure function — assembles `EvalTrace[]`, sorted by `scriptNum` then `shotIndex` |
| `src/lib/actions/eval.ts` | `setVersionLabelAction(versionId, { decision, note })` | Server action — `UPDATE node_versions SET decision, note WHERE id = versionId` |

**Hotkeys:** `p` = pass · `f` = fail · `↵` = save & next · `←` / `→` = prev / next (no save).

**Resumable:** pre-fills an already-set `decision` / `note`; advancing past labelled traces is fine.

**Source-agnostic design:** `ReviewScreen` takes a `traces[]` prop; the page owns the query. The
same component works for production traces later (a different query: cross-node, ranked by
edit-diff) — additive, no UI change.

### F. File map

| File | Role |
|------|------|
| `src/app/eval/[canvasId]/page.tsx` | Server page: loads traces, renders ReviewScreen |
| `src/app/api/eval-bootstrap/route.ts` | Throwaway: generates the 20-trace dataset (Step 2) |
| `src/components/eval/review-screen.tsx` | Client: index, hotkeys, orchestration |
| `src/components/eval/trace-panels.tsx` | Shot input + prompt output panels |
| `src/components/eval/label-bar.tsx` | Sticky pass/fail + note controls |
| `src/lib/db/eval.ts` | `listEvalTraces` — cross-node DB read |
| `src/lib/eval/map-traces.ts` | Pure row-to-EvalTrace mapping |
| `src/lib/eval/map-traces.test.ts` | Unit tests for the mapping |
| `src/lib/actions/eval.ts` | `setVersionLabelAction` — label write |
| `src/lib/db/versions.ts` | `insertVersion` — where `generated_output` is captured |
| `supabase/migrations/0005_generated_output.sql` | Adds `generated_output` column |
| `scripts/peek.mjs` | Temp: dump eval traces to stdout for inspection |

## Testing

- **Step 1:** after any generation, `node scripts/peek.mjs` shows the trace; `generated_output` column is populated.
- **Step 2:** `curl -X POST localhost:3000/api/eval-bootstrap?dry=1` prints the 20 selected shots without LLM calls; remove `?dry=1` to run for real (idempotent — re-runs append new versions).
- **Step 3:** `/eval/<canvasId>` lists 20 traces; mark one pass/fail + note → save → reload confirms persistence. Hotkeys advance and save correctly.
- **Types + tests:** `npx tsc --noEmit` clean; `npx vitest run` (map-traces tests pass).

## Related docs

- [eval-flywheel-rationale.md](../../evals/2026-06-14-eval-flywheel-rationale.md) — WHY: the methodology, the timing argument, the build order.
- [run-01-prakriti-image-prompt-bootstrap.md](../../evals/2026-06-14-run-01-prakriti-image-prompt-bootstrap.md) — HOW Run 01 was executed; first-pass observations (template homogeneity dominates).
- [eval-review-viewer-design.md](2026-06-14-eval-review-viewer-design.md) — Step 3 UI design spec in full.
