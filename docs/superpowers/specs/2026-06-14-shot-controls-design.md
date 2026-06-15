# Descriptive Shot Controls (Prompt node)

**Date:** 2026-06-14
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Design spec (implements PRD §11.5/§12 descriptive controls; motivated by eval Run 01).

---

## 1. Why

Eval Run 01's dominant failure was **template homogeneity** — `prompt-generate` v2 let the LLM
*invent* lens/lighting on every shot and it collapsed to one recipe (85mm everywhere). Per the
updated PRD §12, the finer image aspects the image **API cannot accept as parameters** are
**descriptive controls** that live on the **Prompt node** and are baked into the prompt. MVP scope:
the **per-shot** tier that wrongly homogenized — **lens · composition · lighting**. (Brand-level
aspects like palette stay consistent via the KB — that consistency is correct, not a bug.)

## 2. Decisions (from the brainstorm)
- **Compose mechanism:** *constraints fed to the LLM* — selected values are injected into the
  prompt as explicit constraints; the LLM weaves them into natural prose (better for Nano Banana).
  The **eval loop is the check** that the model honors them.
- **Control set:** per-shot only — `lens`, `composition`, `lighting`.
- **Defaults:** heuristic keyword map from the shot text (no extra LLM call); fall back to `Auto`
  (no constraint); operator-overridable.
- **Catalog:** a **pre-rendered, curated** TS constant now; "learned later" = refine the option
  lists from eval results (which values pass) — a data change to one constant, no architecture change.
  (No schema version field — YAGNI; add traceability only if the catalog actually starts evolving.)

## 3. Components

### 3.1 Catalog — `src/lib/nodes/shot-controls.ts` (pure, no server-only)
```ts
type ShotControlKey = "lens" | "composition" | "lighting"
type ShotControls = Record<ShotControlKey, string>   // option value per key; default "auto"
SHOT_CONTROLS: { key, label, options: { value, label, prose }[] }[]
DEFAULT_SHOT_CONTROLS = { lens:"auto", composition:"auto", lighting:"auto" }
```
Options (abridged): lens = Auto/Wide 24/Wide 35/Standard 50/Portrait 85/Macro 100; composition =
Auto/Center/Negative space/Flat-lay/Close-crop/Thirds; lighting = Auto/Soft daylight/Golden hour/
Chiaroscuro/Studio softbox/Candlelit. Each non-Auto option carries the **prose** injected.

### 3.2 Pure functions (test-first)
- `deriveShotControlDefaults(shotText): ShotControls` — keyword scan → defaults; `auto` when no match.
- `renderShotControls(controls): string` — the constraint block (`""` when all Auto):
  ```
  Shot controls (use these exactly; do not substitute):
  - Lens: a 24mm wide-angle lens
  - Composition: generous negative space
  - Lighting: warm golden-hour backlighting
  ```

### 3.3 `compilePrompt` (`src/lib/nodes/prompt.ts`)
Gains `controls?: ShotControls`. Inserts `renderShotControls(controls)` as a block **after** upstream,
**before** the instruction. All-Auto → no block (back-compat: existing callers omit it = unchanged).

### 3.4 Prompt template — `src/prompts/prompt-generate.ts`, **bump v2 → v3**
Add one CONSTRAINTS rule: *"If 'Shot controls' are provided, use those exact values for lens /
composition / lighting; only choose your own when a control is absent."* (Keep the vocabulary guidance
for the parts the LLM still authors.) The version bump means the eval harness re-runs the **same 20
shots** and measures homogeneity **v2 → v3**.

### 3.5 Generate route — `src/app/api/nodes/[id]/generate/route.ts`
Read `controls` from the body, pass to `compilePrompt`, snapshot into `params_used.controls`.

### 3.6 UI — Prompt focus view (`prompt-focus-view.tsx`)
A **"Shot controls"** section (3 selects, Lucide-iconed) near the instruction. On open with
`data.controls` unset, pre-fill from `deriveShotControlDefaults(upstream shot text)`; operator
overrides. Persist to `nodes.data.controls` (own-content, D19). Send `controls` with Generate.

## 4. Tests (written first)
- `shot-controls.test.ts`: `deriveShotControlDefaults` keyword mapping (wide→24, macro→100+close-crop,
  golden hour→lighting, no-match→auto); `renderShotControls` (block format; all-Auto → "").
- `prompt.test.ts`: `compilePrompt` with controls inserts the block in order; without/all-Auto → unchanged.

## 5. Scope cuts
- No brand-level tier (palette/film-stock stay KB-driven).
- No Image-Gen node / API-native controls (Stage 3).
- No LLM shot-classification (heuristic only).
- No "learned" catalog yet (curated + versioned; learning is later turns of the flywheel).

## 6. Verification
- New unit tests green; `tsc`/`eslint` clean; existing suite unbroken.
- Manual: open a Prompt node wired to a Shot → controls pre-fill from the shot → Generate →
  compiled prompt shows the constraint block → `params_used.controls` stored.
- Re-run the eval bootstrap (now v3) → compare homogeneity against Run 01.
