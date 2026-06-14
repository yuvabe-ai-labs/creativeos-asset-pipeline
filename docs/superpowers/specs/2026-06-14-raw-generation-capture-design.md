# CreativeOS — Step 1: Raw Generation Capture

**Date:** 2026-06-14
**Status:** Approved (design). Implementation pending.
**Type:** Design spec (single step of the eval flywheel; amends D18/D19, adds **D22**).

---

## 1. Context — why this exists

This is **Step 1 of a 4-step "eval flywheel"** for systematically improving the
LLM prompts behind the Script and Prompt nodes (method: Hamel Husain's *Field Guide
to Rapidly Improving AI Products* + Shreya Shankar's *EvalGen / Who Validates the
Validators*):

| Step | What | Build? |
|---|---|---|
| **1. Capture the raw generation** *(this spec)* | preserve the model's original output so the generated→edited diff survives | small schema + write-path change |
| 2. Accumulate | let real designer usage produce labelled traces | passive, no build |
| 3. Error analysis | a data viewer to read traces, label pass/fail + notes, cluster failure modes | its own spec |
| 4. Evals | turn failure modes into bespoke binary scorers + a golden set | its own spec |

The flywheel's core signal is the **correction**: *the model wrote X, the human
shipped Y.* The diff between X and Y is the highest-value evidence of where a prompt
fails. **Step 1 is the only time-sensitive step** — until it ships, every manual edit
destroys X, and lost signal cannot be recovered.

### The gap being closed
Per **D18**, a manual edit to a node's output *updates the active version's `output`
in place* (no new version row). Per **D19**, `output` is the single source for what
the node currently "is." Together these mean: **the moment a designer edits a
generated output, the model's original generation is overwritten and gone.** Both the
Script node (`saveScriptOutputAction`) and the Prompt node (`savePromptOutputAction`)
funnel through the same `updateActiveVersionOutput`, so both destroy it identically.

---

## 2. Decision — one frozen column

Add **`node_versions.generated_output`** (`jsonb`): the model's output as produced,
written **once** at generation and **never** mutated thereafter. The existing `output`
column remains the editable, human-refinable working copy (D18 unchanged).

```
node_versions
  ├─ generated_output   jsonb   ← FROZEN: the model's raw attempt (provenance)
  └─ output             jsonb   ← EDITABLE: the current shipped copy (display/downstream)
```

### Why `generated_output` and `output` are two different fields

This is the crux, and the reason this is a spec and not a one-line patch:

- They answer **two different questions.** `generated_output` answers *"what did the
  model produce?"* (immutable provenance — an attribute of the LLM attempt, alongside
  `inputs_used` / `params_used` / `model_used`). `output` answers *"what does the node
  currently hold / feed downstream?"* (mutable working state).
- They are **meant to diverge.** Before any edit they coincide. After a human edit they
  differ — **and that divergence is the entire signal** Step 3 reads. Their being equal
  is the uninteresting case; their being different is the data.
- This is **not** the drift-prone "display cache" D19 outlawed. D19's rule was: do not
  keep a *second copy of the same truth* that can silently fall out of sync. Here there
  is still exactly **one** source for "what the node currently is" — `output` — and
  display/downstream read only it. `generated_output` is never rendered as the node's
  current value; it is frozen provenance. Two fields that are *supposed* to differ are
  not a cache; a cache is two fields that are supposed to *match* but can drift.
- **"Was it edited?" is derivable**, not stored: `generated_output IS DISTINCT FROM
  output`. No `edited` flag, no `edited_at` (YAGNI — add only if a real question needs it).

---

## 3. Implementation surface

### 3.1 Migration — `supabase/migrations/0005_generated_output.sql`
```sql
alter table node_versions add column generated_output jsonb;

-- Backfill: for existing rows the current output is the only prior record we have.
-- Imperfect for already-edited rows, but it is the best available and harmless.
update node_versions set generated_output = output where generated_output is null;
```

### 3.2 Write path
- **`insertVersion`** (`src/lib/db/versions.ts`) — also write `generated_output`, set
  to the same value as `output` at creation time. Failed attempts pass `output: null`
  → `generated_output: null` (correct: no generation occurred).
- **`updateActiveVersionOutput`** (`src/lib/db/versions.ts`) — **unchanged.** It already
  updates *only* `output`. Because the edit path never names `generated_output`, the
  frozen copy survives automatically. *This is the whole mechanism.*
- Both nodes are covered by the single `insertVersion` change — no per-node-type branch.

### 3.3 Reads / types
- `NodeVersionRow` (`src/lib/db/types.ts`) gains `generated_output`.
- `listVersions` already `select("*")` — the field rides along, no query change.
- `GET /api/nodes/:id/versions` (`versions/route.ts`) maps a `generatedOutput` field into
  its response, so Step 3's viewer (and verification) can read it.

---

## 4. Scope cuts (explicitly NOT in Step 1)
- **No diff computation, no UI, no viewer.** The diff is a mechanical, client-side
  *display* concern owned by Step 3 — never an LLM call, never a stored value.
- **No `decision` / `note` writes.** Those columns already exist (`0001_init.sql`) but
  stay unused until Step 3's error-analysis labels.
- **No edit history / trail.** Step 1 captures two points (raw generation, current
  shipped), which is exactly what the error-analysis method consumes. A full per-save
  trail was rejected: it reverses D18, adds a table + history-noise, and serves
  none of the prompt-improvement goal (YAGNI; revisit only if studying *how* designers
  edit, or for multi-editor audit once auth exists — D14).

---

## 5. Verification
- Migration applies; `generated_output` column present on `node_versions`.
- Generate on a Prompt node → row has `generated_output == output`.
- Edit + Save → `output` changes; `generated_output` unchanged (verified by direct DB
  query — there is no UI in Step 1).
- Script Re-extract → fresh row with its own frozen `generated_output`.
- `tsc --noEmit` and the existing vitest suite stay green.

---

## 6. ADR — D22 (recorded in the roadmap log)

See **D22** in `2026-05-30-creativeos-staging-roadmap.md` §7. Summary: the immutable
record of an LLM attempt grows from *(inputs, params, model)* to *(inputs, params,
model, generated_output)*; `output` stays the single mutable source for display and
downstream (D19 intact); their divergence after a human edit is the eval signal.
