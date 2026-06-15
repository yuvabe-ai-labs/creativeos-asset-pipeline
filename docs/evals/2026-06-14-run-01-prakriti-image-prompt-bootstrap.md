# Eval Run 01 — Prakriti image-prompt bootstrap (Step 2)

**Date:** 2026-06-14
**Type:** Experiment record / run log (companion to `2026-06-14-eval-flywheel-rationale.md`).
**Purpose:** Produce the **first 20 image-prompt traces** so error analysis (Step 3) can begin
without waiting for organic usage — Step 2 of the eval flywheel, executed against real data.

> Read this to understand *how Run 01 was done and why* — the config, the controlled-experiment
> reasoning, where the data lives, and how to reproduce it. The conceptual *why evals* lives in
> the rationale doc; this is the lab notebook for one run.

---

## 1. What we evaluated

The **Prompt node's image-prompt generation** (`prompt-generate` v2) — the model-steered step
that turns a reel shot into an image-generation prompt. We ran the **real** pipeline end to end,
not a stub, so the traces are representative.

## 2. The pipeline (faithful to production)

Source → 20 traces, per the live path (`Script-parse → fan-out → Shot carries the narrowed
script (D21) → Prompt → generate`):

```
docs/context-refs/Prakriti - satva/Prakriti Sattva Reel 52 Scripts.md
  → split on `## **\#N Title [TYPE]**` headers
  → DEDUP (the .md contains TWO copies of each script; #1 at line 42 AND 3394) → 53 unique
  → stratified-select 20 (even stride across #1–#53, varied shot index 0–4)
  → per selected shot:
      real Script-parse (scriptParsePrompt v1, json_schema, gpt-5.4-mini)   → ReelScript
      narrow to one shot  { ...reel, visual_script.shots: [shot[i]] }  (D21)
      renderScriptAsText(narrowed)                                     → shot text
      compilePrompt({ clientContext: KB slices, upstream:[shot], instruction }) (prompt.ts)
      OpenAI generate (promptGeneratePrompt v2, gpt-5.4-mini)          → image prompt
      find-or-create THIS shot's own Prompt node (idempotent by `evalKey`)
      insertVersion(...) on that node  (generated_output captured by Step 1 / D22)
```

> **Revision (2026-06-14, same day): one-node → 20-node.** The first execution parked all 20
> traces as 20 *versions of one* eval node. That was wrong: a `node_versions` row means an
> *attempt at that node's task* (D4), so 20 different shots = **20 different nodes**, one version
> each. Corrected to **one Prompt node per shot** (keyed by `evalKey = s<num>-shot<idx>`), which
> (a) is semantically correct, (b) makes the viewer read the **real cross-node query** production
> needs, and (c) gives per-shot before/after for free — a re-run with a fixed prompt appends a
> *new version to the same node*. The legacy single node was deleted (cascading its versions).
> The run also now persists the **`shotText` + `compiledUser`** in `inputs_used` (the viewer's
> "source shot" + request-inspector data), which the first execution omitted.

**How it was executed:** a *temporary* internal route `POST /api/eval-bootstrap` (created so every
real module — `compileScript`, `compilePrompt`, `buildParseContext`, `renderScriptAsText`, the real
prompt definitions, `insertVersion`, `createOpenAI` — runs natively inside Next, with zero risk of
the prompt-under-eval drifting from a copy). `?dry=1` printed the selection for approval before any
LLM call. **This route is throwaway and should be deleted after the run** (the logic is recorded
here for reproducibility).

## 3. Controlled-experiment design — what was held STATIC vs VARIED

The core hygiene: **freeze the system, vary only the input**, so any failure is attributable to
the prompt (not a confound) and the dataset stays a valid yardstick for the next prompt version.

**Held STATIC (the system under test):**

| Frozen | Value |
|---|---|
| Prompt template | `prompt-generate` **v2** (same system prompt for all 20) |
| Instruction | `DEFAULT_INSTRUCTION` (the blank→default sentence, not per-shot instructions) |
| Brand context | Prakriti active KB version, `DEFAULT_IMAGE_PROMPT_SLICES` → identical KB string every time |
| Model | `gpt-5.4-mini` (parse and generate) |
| Parse config | `script-parse` v1, same strict schema |

**VARIED (the input — along the field-guide axes):**

| Varied | Across |
|---|---|
| Feature (shot/asset type) | product hero · hands-on-product · flatlay · gift arrangement … |
| Scenario / reel type | VISUAL · VO · TEXT |
| Shot position | index 0–4 |

**Theory (field guide + experiment concept).** Error analysis = observe a *fixed* system against
*diverse* inputs; the dimensions (Features × Scenarios × Personas) exist to vary the input *for
coverage*, while the system is held still so observed failures are properties of the **prompt**.
This also makes the 20 a reusable **controlled fixture**: when `prompt-generate` → v3, re-running
the *same* 20 shots with the *same* frozen config isolates the prompt as the only change → a clean
before/after ("homogeneity 18/20 → 4/20"). Vary the prompt *and* the input together and attribution
is impossible (back to vibe-checking).

## 4. Where the data lives

- **Client:** `prakriti-satva` (`db50e206-…`), active KB `56fc5a07-…`
- **Eval canvas:** `6508a73f-…` (slug `eval-harness`, isolated from real canvases)
- **20 Prompt nodes on that canvas** — *one per shot*, keyed `data.evalKey = s<num>-shot<idx>`; each
  node holds its generation as its **active version**. Step 3 reads them via a **cross-node query**
  (prompt nodes on the eval canvas + each node's active version) — the same shape production needs.
- Each version's `inputs_used` records `{ eval, scriptNum, scriptTitle, reelType, shotIndex,
  kbVersionId, shotText, compiledUser }`; the image prompt is in both `output` and frozen
  `generated_output`. Labels (open coding) write `decision` + `note` on the active version.

Dump for reading: `scripts/peek.mjs` (temp) — reads the prompt nodes on the eval canvas, joins each
node's active version, prints `#num [type] title [evalKey]` + label + the generated prompt.

## 5. Result — Run 01

**20/20 generated, 0 failures**, ~2 min. Mix: **10 VISUAL · 7 VO · 3 TEXT**, strided #1→#51,
shot positions 0–4.

### First-pass observations (open-coding hypotheses — to be confirmed by human labelling)
- **Dominant failure mode: template homogeneity.** Nearly all 20 converge on the *same* recipe —
  `85mm f/1.8, shallow DoF`, `warm afternoon window + soft side + rim light`, `editorial analog
  film`, `muted teal / Kodak Portra`, and the **same four hex codes** (`#C8A000 #3D6B1A #8B3A1A
  #F5F0E8`) — regardless of shot. Across a 53-reel campaign every image would look interchangeable.
- **Lens contradiction:** #22 = *"Center-framed **wide shot** … **85mm f/1.8**"* (85mm isn't wide) —
  the model defaults to 85mm even when the shot calls for wide.
- **Palette over-application:** brand hex appended even where it can't apply (#16, a leaf on a
  charcoal void, still lists turmeric gold + Ayurvedic green).
- **Holding well:** no banned junk tokens (`8K/ultra/masterpiece`), no compliance words
  (`cure/heal/treat`) even on VO reels, casting rule (`mature woman 35+`) consistently applied.

The dominant signal is **monotony**, not compliance — a property of `prompt-generate` v2, and the
candidate for the first prompt fix (force shot-appropriate lens/lighting/palette variation).

## 6. How to reproduce
1. Recreate the route logic at `POST /api/eval-bootstrap` (see §2; or restore from git history of
   `src/app/api/eval-bootstrap/route.ts`).
2. `next dev`, then `curl -X POST 'localhost:3000/api/eval-bootstrap?dry=1'` → review the 20 picked.
3. `curl -X POST 'localhost:3000/api/eval-bootstrap'` → generates onto the eval node (idempotent
   client/canvas/node; appends a fresh batch of versions each run).
4. `node scripts/peek.mjs` → read the outputs.

## 7. Status / next
- **Step 2: done** (this run). Dataset of 20 exists.
- **Step 3 next:** human **open coding** (pass/fail + note per trace → `decision`/`note`), then
  **axial coding** (cluster notes → ranked failure modes), then fix `prompt-generate` and re-run
  this exact harness to measure the change. See rationale §9.
