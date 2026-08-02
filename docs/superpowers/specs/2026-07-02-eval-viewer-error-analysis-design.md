# Eval Viewer — per-node error-analysis surface (open coding + version Δ)

**Date:** 2026-07-02
**Status:** Approved design (brainstormed + visually composed via the companion, session `2072-1782968009`). Implementation pending (test-first).
**Type:** Design spec — generalizes the **already-built** eval review viewer into a per-canvas, per-node, all-action-types, version-aware error-analysis surface. Adds ADR **D94** (append to `2026-05-30-creativeos-staging-roadmap.md` §7).
**Builds on (all built):** the eval-review viewer — `ReviewScreen`, `listEvalTraces`, `mapEvalTraces`, `setVersionLabelAction`, `/eval/[canvasId]` (spec `2026-06-14-eval-review-viewer-design.md`; arch `2026-06-16-eval-system-architecture.md`); the **model-request capture** (`node_versions.inputs_used.request` = `{systemPrompt, compiledUser, attachments, effectiveInstruction}`, `ModelRequestPanel`, plan `2026-07-02-model-request-capture.md`).
**Grounded in:** **D4** (uniform envelope), **D18** (a version = one model attempt; manual edits fold in), **D22** (`generated_output` frozen; the correction signal), the eval flywheel rationale (Hamel/Shankar: *look → open-code → cluster → fix*).
**Separate from:** **D29** approval flag and **D34** review surface — those are the *sign-off* axis; this is the *quality/learning* axis (`decision`/`note`). Intentionally distinct fields (D29 §4.2).
**Origin:** "see what we can learn to improve the prompt." The viewer is the microscope; error analysis is the method.

---

## 1. Problem

The eval viewer that exists today does open coding on a **single node type** (`prompt`), a **single canvas**, the **active version only**, and shows the source shot + generated prompt but **not** the actual request sent, and **not** a node's version history. To actually learn what to improve in a prompt, a reviewer needs to: see **every generated output** on a canvas, filter to **one action-type at a time**, read **input → output**, inspect the **exact request** that produced it, mark **good/bad + note** (open coding), and **step across a node's versions** to see how a change moved the output.

## 2. Goal

Generalize the viewer into a **per-node, version-aware error-analysis surface**:

- **List** every generated node on a canvas, **grouped by action** (node type).
- **Detail** focuses on **A · input → C · output**, shows **B · the exact request sent** (actual content), and supports **D · open coding** (Good/Bad + note) on the viewed version.
- **Walk a node's versions** with a **Δ** that names *what the human changed* between them.

## 3. Non-goals (deferred, with the seam that unblocks them)

- **Failure-mode tags / axial clustering** — a later **analyse** step (Hamel: cluster *by hand first*). This surface is **open coding only**. The `decision`/`note` it writes are the input to that later step.
- **Cross-client rollup** — later; the data is already "a query across nodes," so rollup is a **query swap** (canvas → client), same screen.
- **LLM-as-judge / auto-scorers** — flywheel Step 4, deferred.
- **Approval (D29 / D34)** — the sign-off axis; not shown here.

## 4. Design

### 4.1 The unit — a node, walked by version

A node = one input/task (**D4**); its `node_versions` are attempts (**D18**). The **list is nodes**; the **detail is one node**, defaulting to its **active version**, with a **version stepper + timeline** to walk `v1…vN`. Open-coding `decision`/`note` attach to the **viewed version** (both columns already exist and are per-version).

### 4.2 "Generated node" — what the list includes

A node whose active version came from a **model run**: `prompt`, `image-gen`, `video-prompt`, `video-gen`, `script` (parse). **Excludes** content nodes (`text`/`note`, `file`, `draw`, `shot`) — their content *is* their output; there is no model attempt to analyse.

### 4.3 List — grouped by action

Simple cards (node id + status dot + version-count badge), under collapsible **action headers** (`Prompts` / `Images` / `Videos` / …). "Action" = node type = the prompt/step under evaluation, so grouping *is* the "one kind at a time" filter — no separate chip row. (Left-rail reference: the LLM-Grader annotation tool — simple, scannable, status at a glance.)

### 4.4 Detail — focus on input → output (polymorphic A/C, uniform B/D)

| Panel | Content | Varies by type? |
|---|---|---|
| **A · Input** | the source fed in — shot text; ± a reference image | **yes** |
| **C · Output** | the generated result | **yes** — text (prompt/motion) · image · video · structured |
| **B · Exact request sent** | the **actual** content sent, as parts: **System** / **User (compiled)** / **Attachments** — read from `inputs_used.request`. Real prompt text, **not** KB-slice names. | no |
| **D · Open coding** | **Good/Bad** (writes `decision`) + **Note** (writes `note`) on the viewed version. **No tags.** | no |

Only **A** and **C** vary by modality, so the polymorphism is confined to two slots served by a small **renderer registry** keyed on the slot's `kind`: `text` · `image` (one or many) · `video` · `structured`. **B/D** are the same query fields for every node type (the payoff of the D4 uniform envelope). B reuses the built **`ModelRequestPanel`**.

### 4.5 Version progression — the Δ (structured field-compare, no LLM)

Each version carries its **own** captured request, so two versions differ **because the human changed an input** (or it was a re-roll). Stepping `vN-1 → vN` shows a **Δ banner** naming what moved, computed by **structured field comparison** — deterministic, no diff engine, **no LLM**:

| Δ detects | Compares |
|---|---|
| lens / lighting / composition | `params_used.controls` (per-key equality) |
| instruction | `params_used.instruction` (`!==`; effective form in `inputs_used.request.effectiveInstruction`) |
| KB slices | `inputs_used.kbSlices` (set difference) |
| **reference** | `inputs_used.upstream` `[{nodeId, versionId}]` (versionId compare) |
| prompt template bumped | `params_used.promptVersion` (`!==`) |

- **No field changed → a "re-roll" marker** (same request, output moved = model **nondeterminism** — itself a signal: unstable prompt).
- **Optional** word-level **text diff** (Myers/`diff`, deterministic) highlights the change *inside* a text field / the text output. **Media outputs compare side by side** (no text diff). **No LLM anywhere in this surface** — LLM only enters the later axial/clustering step, which is by-hand-first regardless.

**Why field-compare, not a blob diff:** because we capture inputs as *structured* fields (`controls` object, `kbSlices` array, `upstream` refs) — not only the flattened `compiledUser` string — the Δ can **name** the changed knob rather than merely show that characters differ. Structure at capture time = explainable diff at read time.

## 5. Data — a query generalization, no migration

The dataset is **a query across nodes** (D4), and `ReviewScreen` is already **source-agnostic** (takes `traces[]`; the page owns the query). Generalize:

- **`src/lib/db/eval.ts` — `listEvalTraces(canvasId)`**: today filters `.eq("type","prompt")` and reads only each node's **active** version. Generalize to (a) include **all generated node types** (§4.2), and (b) return, per node, its **version list** — reusing the shape the `/api/nodes/[id]/versions` route already returns (each version carries `inputs_used` incl. `request`, `params_used`, `generated_output`, `output`, `decision`, `note`).
- **`src/lib/eval/map-traces.ts` — `mapEvalTraces`**: today assembles `{ shotText, prompt }` strings. Generalize `EvalTrace` to typed slots + versions:

```ts
type Modality = "text" | "image" | "video" | "structured";
type NodeAction = "prompt" | "image-gen" | "video-prompt" | "video-gen" | "script";

type TraceVersion = {
  versionId: string;
  input:  { text?: string; images?: string[] };            // A (polymorphic)
  output: { kind: Modality; text?: string; urls?: string[] }; // C (polymorphic)
  request?: ModelRequestRecord;                             // B (from inputs_used.request)
  controls?: unknown; instruction?: string; kbSlices?: string[]; // Δ inputs
  upstream?: { nodeId: string; versionId: string }[]; promptVersion?: string;
  decision: "pass" | "fail" | null; note: string | null;   // D
  createdAt: string;
};
type NodeTrace = {
  nodeId: string; action: NodeAction; evalKey: string; title: string;
  activeVersionId: string | null; versions: TraceVersion[]; // newest→oldest
};
```

- **No migration.** The request capture already added `inputs_used.request`; `decision`/`note`/`generated_output`/`output`/`params_used`/`inputs_used` all exist.

## 6. Reuse

- **`ReviewScreen`** shell (index state, hotkeys, save orchestration) — the list/detail frame wraps it or extends it.
- **`setVersionLabelAction(versionId, {decision, note})`** — the open-coding write, unchanged, now targeting the **viewed** version.
- **`ModelRequestPanel`** (built) — panel **B**.
- Yuvabe design system + focus-view primitives for styling (neutral-led, `.text-eyebrow`, `shadow-card`, purple sparingly, Lucide 1.5).

## 7. Route

`/eval/[canvasId]` generalizes (prompt-only → all generated types, grouped, versioned). The production/client-rollup view is later a **different query** feeding the same screen — no UI change (§3).

## 8. Testing (test-first)

- **`mapEvalTraces` generalization** — mixed node types + multiple versions → `NodeTrace[]` with typed `input`/`output` slots, per-version `request`, versions newest→oldest; **content nodes excluded**.
- **Δ field-compare** — given two versions' `params_used`/`inputs_used`, names **exactly** the changed fields (controls / instruction / kbSlices / upstream / promptVersion); returns **"re-roll"** when none changed.
- **List grouping** — nodes grouped by action; group counts correct.
- **Open-coding write** — Good/Bad + note writes `decision`/`note` on the **viewed** version (reuse `setVersionLabelAction`); re-viewing pre-fills.
- **Polymorphic render** — each `kind` (text/image/video/structured) selects the right renderer; a video output is not text-diffed.
- **Separation** — no tags written; `approval_status` (D29/D34) untouched; only `decision`/`note` move.

## 9. Out of scope

Failure-mode tags / axial clustering, cross-client rollup, LLM-judge scorers, approval — all deferred (§3).

## 10. ADR — D94 (append to §7)

**D94 — Eval viewer generalizes to a per-node, all-action-types, version-aware error-analysis surface** *(recorded 2026-07-02; builds on D4/D18/D22; extends the built eval viewer; consumes the model-request capture; separate axis from D29/D34)*.
**Decision.** The eval viewer becomes a per-canvas surface that lists **all generated nodes grouped by action**, and whose detail focuses on **input → output**, shows the **exact request sent** (actual `inputs_used.request` content, as parts), supports **open coding only** (Good/Bad + note on the viewed version), and lets a reviewer **walk a node's versions** with a **Δ that names what the human changed** — computed by **structured field comparison** (no LLM; optional text-diff for word-level highlight; media side-by-side). **Rejected:** tags/axial clustering in this surface (deferred to a later analyse step, by-hand-first); blob text-diff as the primary Δ (loses the ability to name the changed knob — structured capture avoids it); an LLM to compute the Δ (unnecessary and non-deterministic). **No migration** — a query + mapping generalization over the existing envelope. **Reuses** `ReviewScreen`, `setVersionLabelAction`, `ModelRequestPanel`.
**Originated.** `2026-07-02-eval-viewer-error-analysis-design.md`.
