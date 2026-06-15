# Step 3 — Eval Review Viewer (open coding)

**Date:** 2026-06-14
**Status:** Approved (design). Implementation pending.
**Type:** Design spec (Step 3 of the eval flywheel; companion to
`docs/evals/2026-06-14-eval-flywheel-rationale.md` §9 and the Run-01 log).

---

## 1. Purpose

A focused surface to **open-code** the eval traces: read each `(source shot → generated image
prompt)`, mark **pass/fail**, write a **note**, move on fast. Turns the 20 Run-01 traces into
labelled data; the labels (per-trace `decision` + `note`) are the input to *axial coding* (cluster
→ ranked failure modes → prompt fix). Method: Hamel/Shankar (rationale §4, §9).

## 2. Scope

**In (open-coding MVP):** one trace per screen — source shot + generated prompt — with binary
pass/fail, a note, hotkeys, progress, and durable persistence to `decision`/`note`. Layout **B**
(stacked panels + sticky label bar; chosen via the visual companion).

**Out (deferred, with triggers):**
- Filter/sort by error type → needs a taxonomy that doesn't exist until after open coding (axial).
- Cluster/aggregation view → axial coding, *by hand first* (or one LLM pass on the notes).
- Generated-vs-edited **diff** → Run-01 traces are synthetic (no human edits; `generated_output ==
  output`); the diff matters for *production* traces, not this batch.
- Full **request inspector** (system prompt + image parts) → the `compiledUser` is stored, but the
  MVP surfaces only the **source shot**; full inspector later.
- **Scorers / LLM-judge** → Step 4.

## 3. Data model — the "swappable source" boundary

The dataset is **a query across nodes**, never one node (the corrected 20-node model — a node = one
input/task, D4). The review UI is **source-agnostic**: it takes a `traces[]` list; the *page* decides
the query.

| Source | Query | When |
|---|---|---|
| **Bootstrap** (Run 01) | prompt nodes on the eval canvas + each node's active version | now |
| **Production** | prompt nodes for client X, ranked by edit-diff (`generated_output ≠ output`) & errors | later — additive, same component |

### Read — `listEvalTraces(canvasId)` (new db helper, `src/lib/db/eval.ts`)
For each prompt node on the canvas, join its active `node_versions` row → a `Trace`:
```ts
type Trace = {
  nodeId: string; versionId: string;
  scriptNum: number; scriptTitle: string; reelType: string; shotIndex: number; // inputs_used
  shotText: string;        // inputs_used.shotText — the "source shot" panel
  prompt: string;          // generated_output / output — the "generated prompt" panel
  decision: "pass" | "fail" | null;  // node_versions.decision
  note: string | null;               // node_versions.note
};
```
Loaded server-side in the page (no API roundtrip for reads).

### Write — `setVersionLabelAction(versionId, { decision, note })` (server action, `src/lib/actions/eval.ts`)
`UPDATE node_versions SET decision, note WHERE id = versionId`. First writer of those columns.
Mirrors the existing `savePromptOutputAction` server-action pattern (no new API route).

**No migration** — `decision` and `note` already exist on `node_versions` (`0001_init.sql`).

## 4. UI — layout B (stacked + sticky label bar)

```
src/app/eval/[canvasId]/page.tsx        server — listEvalTraces(canvasId) → <ReviewScreen traces>
src/components/eval/review-screen.tsx   client — index state, hotkeys, save orchestration
src/components/eval/trace-panels.tsx    source shot (top) + generated prompt (below, scrolls)
src/components/eval/label-bar.tsx       pass/fail toggle + note input + save&next (sticky)
```

- **Header:** progress `n / N`, reel meta (`#22 · VISUAL · "This Diwali" · shot 2`), prev/next,
  a small "labelled n/N" count.
- **Panels (stacked):** *Source shot* (the `shotText`) on top; *Generated prompt* below, scrolls.
- **Sticky label bar:** Pass / Fail toggle, note textarea, `↵ = save & next`.
- **Hotkeys:** `p` pass · `f` fail · `↵` save&next · `←/→` prev/next. (Hamel: speed.)
- **Resumable:** pre-fills an already-set `decision`/`note`; advancing past labelled traces is fine.
- **Persistence:** save calls the server action; optimistic local update; the row's `decision`/`note`
  update in place (no new version — labels annotate the attempt, they are not a new attempt).

Follows the Yuvabe design system (neutral-led, Clash/Gilroy, `shadow-card`, purple sparingly) and the
component rules (one component per file, named export, split ~200 lines).

## 5. Route
`/eval/[canvasId]` — the eval canvas (`6508a73f-…`). Production later adds `/eval/review` (or a
filter querystring) feeding the *same* `ReviewScreen`. A tiny `/eval` index (list eval canvases) is
optional and out of MVP scope.

## 6. Verification
- `/eval/<canvasId>` lists 20 traces; each shows its source shot + generated prompt.
- Mark pass/fail + note + save → re-load shows the persisted label (`peek.mjs` shows `→ pass: …`).
- Hotkeys advance and save. Progress + labelled-count update.
- `tsc --noEmit` + vitest stay green.

## 7. What this unlocks
Once the 20 are labelled, **axial coding by hand** (group notes → ranked failure modes; the Run-01
hypothesis says *template homogeneity* dominates) → fix `prompt-generate` → **Run 02** (re-run the
bootstrap; appends a v2 to each shot node) → re-label → compare pass-rate. The viewer is reused every
turn; the only new build later is the **production cross-node query** (same component).
