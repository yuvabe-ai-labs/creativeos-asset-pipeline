# Why We Detoured into Evals Before Stage 3

**Date:** 2026-06-14
**Status:** Rationale / education (frames the Step 1–4 eval flywheel; companion to
`2026-06-14-raw-generation-capture-design.md`)
**Type:** Decision rationale — justifies inserting an eval-capability detour into the
staging roadmap (`2026-05-30-creativeos-staging-roadmap.md`) ahead of Stage 3 (Image Gen).

> This document is educational on purpose. It exists so that a future reader (or a
> teammate) can understand **what evals are, why they matter for CreativeOS specifically,
> and why we paused the Stage-3 march to lay one rail now** — with sources to read.

---

## 1. Where this sits in the plan

The roadmap's next shipped stage is **Stage 3 — Image Gen**. Before adding it, we are
inserting a small, mostly-passive detour: the **eval flywheel**. Only **Step 1** is a
build right now (one column — see the capture spec); Steps 2–4 follow later as their own
specs. This document explains why that detour is worth a pause.

## 2. The problem the detour solves: we are flying blind on prompt quality

Every node in CreativeOS that calls a model (Script parse, Prompt generate, File extract,
and soon Image/Video gen) is steered by a **prompt we hand-wrote** (`src/prompts/*.ts`).
Today we improve those prompts by **vibe-checking** — tweak the wording, eyeball a few
outputs, hope it's better. That breaks down exactly as we scale:

- **Stage 3 and 4 multiply the prompt surface.** Image gen and video gen add more
  model-steered steps. More prompts, more ways to silently regress, zero instrumentation.
- **We can't tell improvement from luck.** Without measurement, "v2 of the image prompt
  is better than v1" is an opinion. We literally already shipped `prompt-generate` v1→v2
  (the Nano Banana rewrite) on instinct, with no evidence it helped.
- **Quality is the product.** This is a creative tool; the output *is* the deliverable.
  A prompt that quietly drifts produces worse assets for every designer, every reel.

Evals replace "I think it's better" with "pass-rate went 78% → 89% without regressions."

## 3. What "evals" actually are (the 4 nouns)

Tool-agnostic — every framework (Braintrust, Promptfoo, OpenAI Evals) is the same four:

| Concept | Plain meaning | In CreativeOS |
|---|---|---|
| **Dataset** | a list of `{input, expected?}` cases | rows from `node_versions` (real runs) or hand-written briefs |
| **Task** | the function under test | `compilePrompt` + the model call in a route |
| **Scorer** | `(output, expected) → 0..1` | "did it obey the brand rules in the system prompt?" |
| **Experiment** | one run of task × dataset × scorers, versioned to compare | "`prompt-generate` v2 vs v3" |

You **improve a prompt** by freezing a dataset, scoring the current prompt, changing it,
re-scoring, and comparing. That loop is the whole game.

## 4. The method we're adopting — and why this order

We follow the **Hamel Husain + Shreya Shankar** school (their joint *AI Evals for
Engineers & PMs* course), which inverts the naive "build a metrics dashboard first"
instinct:

1. **Error analysis first, not metrics.** Hamel: error analysis is *"the single most
   valuable activity in AI development and consistently the highest-ROI activity."* You
   **look at your data** — read real outputs, write free-text notes, let failure
   categories emerge **bottom-up**. At NurtureBoss this revealed **3 issues = 60%+ of all
   failures**, telling the team exactly which fix mattered most.
2. **A simple data viewer is the key investment** — *"not a fancy evaluation dashboard –
   it's building a customized interface that lets anyone examine what their AI is actually
   doing."* Teams with good viewers *"iterate 10x faster."*
3. **Binary pass/fail, bespoke metrics.** *"A 10% increase in passing outputs is
   immediately meaningful"*; *"generic metrics are worse than useless."* Our scorers come
   from *our* failure modes (banned words, missing camera/lens, missing brand hex), not an
   off-the-shelf rubric.
4. **Validate the validators.** Shankar et al. show LLM-as-judge graders *"inherit all the
   problems of the LLMs they evaluate"* and must be aligned to human grades (target >90%
   agreement). And the **catch-22**: *"to grade outputs, people need to define their
   criteria; however, the process of grading outputs helps them define that very
   criteria"* — which is *why* you must look at data before writing scorers.

This is why the build order is **capture → accumulate → error analysis → evals**, not
"install an eval tool."

## 5. Why CreativeOS is unusually well-positioned

The detour is cheap here because the architecture was already (accidentally) eval-ready:

- **Prompts are versioned records.** `src/prompts/*.ts` carry `{id, version, model,
  system, …}` — the comment literally calls each *"a single, evaluable, versioned
  record."* A prompt template is exactly the unit an experiment iterates on, and the
  `params_used.promptVersion` breadcrumb already tags every attempt with the prompt that
  made it.
- **`node_versions` is a trace log.** Every run already records `inputs_used`,
  `params_used`, `model_used`, `output` — a dataset of real production runs most teams
  have to build from scratch.
- **Editable outputs are built-in corrections.** Designers edit generated outputs in
  place (D18). That edit is a free *human correction* — the single strongest learning
  signal (the literature on *learning latent preferences from user edits*). **The one gap:
  the edit currently overwrites the model's original (D18/D19), so we lose the "before."
  Closing that gap is Step 1** — the only time-sensitive piece, because lost signal is
  unrecoverable.
- **The reviewer's "request inspector" we wanted is the viewer's context panel.** The
  earlier ask — *"show exactly what was sent to the model"* — is the same surface as the
  error-analysis viewer with the labelling controls removed. One build, two features.
- **We can build the viewer fast.** Hamel's #1 artifact is a custom data viewer; this is a
  React/Next canvas app built by a frontend engineer — our home turf.

## 6. Why now (the timing argument)

- **Step 1 is perishable.** Every designer edit before it ships is a correction we can
  never recover. Nothing else in the detour is urgent; this one column is.
- **Do it before the prompt surface grows.** Instrumenting 2 LLM nodes now is cheaper than
  retrofitting 4–5 after Stage 3/4, and it means image/video prompts are measurable from
  day one instead of accruing un-evaluated debt.
- **Value is front-loaded, cost is not.** Step 3 (error analysis) pays off the moment we
  read 30 traces — we'll fix the top failure by hand before Step 4 even exists. Step 4 just
  automates that judgment so the loop is cheap to repeat. So a small Step-1 investment now
  unlocks compounding returns later (the flywheel tightens each turn: bigger golden set,
  better prompt, sharper scorers).

## 7. What we are explicitly NOT doing (scope discipline)

- **No eval platform yet.** No Braintrust/Promptfoo account, no hosted dashboard. A local
  loop (the viewer + `autoevals` in our existing vitest) is right for one internal team;
  a SaaS platform is premature (revisit when results need org-wide sharing or CI gating).
- **No automatic prompt optimization.** The frontier (an LLM proposing prompt edits from
  feedback — Arize "prompt learning", OpenAI's evaluation-flywheel cookbook) needs a golden
  dataset to exist first. Premature.
- **No full edit-history trail.** Two points (raw generation, shipped output) is what error
  analysis consumes; a per-keystroke trail serves none of the goal (see D22 scope cuts).
- **No new stage.** This is a capability detour, not a sixth stage. Stage 3 (Image Gen) is
  still next; the flywheel rail just gets laid first.

---

## 8. Bootstrapping the dataset with synthetic data (Step 2, accelerated)

Step 2 as originally framed is *passive* — wait for real designer usage to accumulate
corrections. Hamel's field guide offers a way to **skip the wait**: his section
*"Bootstrapping Your AI With Synthetic Data Is Effective (Even With Zero Users)"*. We can
manufacture a dataset now and reach error analysis (Step 3) immediately.

### The one hard rule
> **"Generate user inputs, not outputs — use LLMs to generate realistic user queries or
> inputs, not the expected AI responses."**

Generating the *outputs* would inherit the generating model's biases (you'd grade the model
against its own assumptions). **For us:** synthesize the **reel scripts / shots** (the *input*
to the Prompt node); the image prompts (the *output*) must come from running our **real**
Prompt node on those inputs.

### Real-first, synthetic-to-fill
We are **not** at zero users — the **53 Prakriti Sattva reel scripts** are real, authentic
*inputs* (exactly what the rule says to prioritise). So Step 2 is: **fan out shots from the
53 real scripts → run them through the Prompt node** (already ~100+ real traces), and
**synthesise extra scripts only to fill gaps** the 53 don't cover.

### The three axes (field guide) → CreativeOS
Hamel structures generation as **Features × Scenarios × Personas**:

| Axis | CreativeOS meaning | Example values |
|---|---|---|
| **Features** | shot/asset types the Prompt node must handle | product hero close-up · lifestyle-with-person · hands-on-product · flatlay/environment · text-overlay reel · VO-driven reel |
| **Scenarios** | the situation the script presents | clean · **claims-heavy (baits banned "cure/heal/treat")** · missing visual detail · brand-hex specified vs not · single vs multi-shot |
| **Personas** | subject/audience the reel depicts | wellness seeker · new mother · ayurveda enthusiast · skincare-routine buyer (drives casting + tone) |

The **claims-heavy** scenario is the highest-value synthetic case: deliberately bait the
compliance never-use list to stress-test whether the prompt holds.

### The procedure
1. **Hand-write ~20 tuples first** — `(Feature, Scenario, Persona)` combinations, turned into
   20 concrete synthetic shot inputs (or 20 hand-picked diverse shots from the 53 real
   scripts). The manual 20 is **not** busywork — it builds intuition about the problem space
   *before* automating.
2. **Scale with two-step LLM generation:** (a) generate more tuples, then (b) a *separate*
   prompt turns each tuple into a natural-language reel-script input (two steps so phrasing
   isn't repetitive). Ground generation in real constraints; verify a generated script
   actually triggers its intended scenario before keeping it.
3. **Run every input through the real Prompt node** → traces land in `node_versions`
   (carrying `generated_output` from Step 1).
4. **Sample ~100 traces** — *"enough to manually review and identify failure patterns without
   being overwhelming"* — and hand to Step 3's error-analysis viewer.

### Caveats (field guide + EvalGen)
- Synthetic data yields *outputs to grade*, **not** the *human-correction* signal (the
  designer-edit diff still needs real humans). The two coexist; synthetic doesn't replace
  real-usage accumulation.
- Synthetic can **mask** real edge cases — hence real-first.
- *"Fix obvious problems first. Don't generate synthetic data for issues you can fix
  immediately."*

### What this builds (own spec)
A **dataset bootstrapper**: a real-script shot sampler + a synthetic input generator (the two
axes/tuple steps) + a **batch runner** that calls the existing compile→generate path N times.
This is a real build — its own design pass — and it is the gate to Step 3.

> **Run 01 (2026-06-14):** executed a first pass of this — 20 traces from the 53 real Prakriti
> scripts, real parse→narrow→generate, system held static. Config, controlled-experiment
> reasoning, results, and the open-coding observations are recorded in
> `2026-06-14-run-01-prakriti-image-prompt-bootstrap.md`.

---

## 9. Step 3 — error analysis: open coding & axial coding

Step 3 turns a pile of traces into a *ranked list of failure modes* through Hamel/Shankar's
two coding passes (terms borrowed from qualitative research). The order is mandatory.

### Open coding (diverge) — *generate* raw labels
Read each trace and write a **free-form note** about what you see — **no predefined
categories**. Bottom-up: let observations come out raw ("used 8K", "no lens spec", "slipped
'heals'", "ignored brand hex"). Paired with a **binary pass/fail** judgment per trace (Hamel:
binary, never a 1–5 scale — *"a 10% increase in passing outputs is immediately meaningful"*).
- pass/fail → the **`decision`** column · note → the **`note`** column (both already exist).

### Axial coding (converge) — *consolidate* labels into a taxonomy
Take all the open-coded notes and **group them into a few named failure modes with counts**
(`banned tokens ×9`, `missing camera ×4`, `ignored hex ×3`). The frequency ranking points at
the #1 prompt fix. Can be done **by hand**, or LLM-assisted (Hamel: *"we used an LLM to build
a taxonomy of common failure modes"* — run *after* human open coding, on the notes, not the raw
outputs).

> **Why open must precede axial (Shreya's catch-22):** *"to grade outputs, people need to
> define their criteria; however, the process of grading outputs helps them define that very
> criteria."* You discover the categories by labelling — so you cannot start with the buckets.

### The three build-parts of Step 3
| Part | What | Coding pass | Build? |
|---|---|---|---|
| **1. Batch runner** | run N shots → N traces in `node_versions` | — (data prep) | throwaway script |
| **2. Review UI** | per-trace: context-in + output, pass/fail toggle, note box, prev/next + hotkeys | **open coding** | **build now** |
| **3. Cluster view** | group notes → ranked failure modes | **axial coding** | **by hand first**; automate only when re-clustering hundreds |

The Part-2 **context-in panel** doubles as the *request inspector* (turn-1 ask) — same surface,
labelling controls removed. A "list all traces" read endpoint is new (today's versions route is
per-node). Then the loop closes: **fix the #1 failure in `prompt-generate` → re-run Part 1 →
re-review**, and the taxonomy/pass-rate moves with evidence.

---

## 10. How this works in production — the diff and the golden set feed each other

Sections 8–9 describe the *bootstrap* loop (a throwaway script generates 20 traces on an
isolated eval canvas; a human annotates them). The fair question is: once real designers are
using the tool, what produces the data, and how do the two signals — the **generated-vs-shipped
diff** and the **hand-annotated golden set** — relate? They are the *implicit* and *explicit*
forms of the same act ("attach a good/bad + why to a trace"), and they hand off to each other.

### Capture is not a separate system — it rides on the normal Generate flow
There is no "production eval pipeline" to stand up. The node's own action route already does it:
every designer click of **Generate** runs `insertVersion(...)` (`src/app/api/nodes/[id]/generate/route.ts`),
writing one `node_versions` row — the same call the bootstrap script made. The eval-bootstrap
route was just a script *impersonating a designer*; in production the designer **is** the
trigger. So traces accumulate as a byproduct of normal use (rationale §5: "`node_versions` is a
trace log"). Failed attempts are logged too (the route inserts a version with `error` set).

### Signal A — the diff (implicit, free, production-only)
In production a designer **generates, then edits, then ships**. The two-write trick in
`src/lib/db/versions.ts` keeps both halves: `insertVersion` writes `generated_output` **and**
`output` to the raw model text; the later edit (`updateActiveVersionOutput`) touches **only
`output`** and never `generated_output`. So one real row holds:

```
generated_output = "…Center-framed wide shot, 85mm f/1.8…"   ← the "before" (frozen, D22)
output           = "…wide-angle 24mm, deep focus…"            ← the "after" (designer fixed it)
```

The designer never clicked "fail" — but **by editing they labelled it anyway**. A large diff ≈
"the model got this wrong"; no edit ≈ "good enough to ship." And unlike a pass/fail toggle, the
diff also encodes the *correction* ("dropped 85mm → wide 24mm"), which half-writes the open-coding
`note` for free. This is the *human-correction* signal from §5 — the strongest one, and the only
label you get at scale without paying for annotation.

### Signal B — annotation (explicit, manual, the golden set)
The golden fixture (the eval-harness canvas) has **no diff** — the bootstrap script generates but
never edits, so `generated_output === output`. The only way to label it is by hand: a human reads
input + output in the viewer and writes the binary **`decision`** + free **`note`** (§9 open
coding). This is what makes the golden set a *yardstick*: a frozen system + diverse inputs +
explicit human pass/fail, re-runnable to measure `prompt-generate` v2 → v3 (§3, the golden rule).

### How they feed each other
The diff is the **radar**; the golden set is the **yardstick**. They are not competitors:

```
Production traces (have diffs)                  Golden fixture (annotated by hand)
   │  diff = free implicit label                        ▲  explicit decision/note
   │                                                     │
   └─► sort by diff size → read the heavily- ────────────┘
       edited traces first (error analysis            promote the interesting
       aimed at real failures, not random)            failures into the golden set
```

- **The diff *prioritises* annotation.** At scale you can't read every trace blind; you sort by
  "how much did the designer change it" and spend annotation effort on the big-diff rows — those
  are the failures. Error analysis (§9) thus starts from real corrections, not random sampling.
- **The diff *sources* the golden set.** A heavily-corrected trace that shows a failure mode worth
  guarding against gets pulled into the controlled fixture, then annotated with a formal
  pass/fail so future prompt versions are measured against it.
- **The golden set *proves* the fix; the diff *discovers* the next one.** You re-run the frozen
  fixture to show v3 > v2 with evidence; meanwhile fresh production diffs surface the
  next-biggest failure mode to add to the fixture. That hand-off is the flywheel tightening (§6).

### Current state vs. the gap (honest scope)

| Capability | Status | Where |
|---|---|---|
| Raw-output capture (two-write, frozen `generated_output`) | ✅ **available today** | `insertVersion` / `updateActiveVersionOutput` in `src/lib/db/versions.ts` |
| Annotation loop on the golden set (`decision`/`note`, cross-node read) | ✅ **available today** | `src/lib/db/eval.ts` → `mapEvalTraces` + the review viewer |
| Bootstrap dataset (20 controlled traces) | ✅ **available today** | Run 01, eval-harness canvas |
| Diff as a *consumed* signal (surface before+after, `edited`/diff-size flag) | 🔲 **TBD** | `mapEvalTraces` returns a single string today |
| Production trace source (filter by real client canvas, not the eval canvas) | 🔲 **TBD** | `listEvalTraces` is pinned to one canvas — *"production swaps the filter"* (`eval.ts`) |
| Axial clustering / Step-4 scorers in vitest | 🔲 **TBD** | by hand first (§9); automate later |

**In one line:** *today* we capture the before/after and can hand-annotate the golden set; *TBD*
is wiring the diff in as a usable signal and pointing the reader at real client traffic — the next
build is `mapEvalTraces` carrying **both** `generated_output` and `output` (+ an `edited`/diff-size
flag) and `listEvalTraces` filtering by client canvas, which turns on Signal A end to end.

**One line:** in production the diff is the tool's *automatic first-pass label* — it points at
which traces failed and how the designer fixed them; annotation is the *explicit pass/fail* you
record on the golden fixture to measure one prompt version against the next; and the diff feeds
annotation by deciding what is worth annotating and what to promote into the golden set.

---

## Sources

- Hamel Husain — *A Field Guide to Rapidly Improving AI Products* — https://hamel.dev/blog/posts/field-guide/
- Hamel Husain & Shreya Shankar — *LLM Evals FAQ* (synthetic data: dimensions → tuples → queries) — https://hamel.dev/blog/posts/evals-faq/
- Shreya Shankar & Hamel Husain — *Evals for AI Engineers* (book) — https://www.amazon.com/Evals-Engineers-Systematically-Measuring-Applications/dp/B0GTYQTYDP
- Hamel Husain & Shreya Shankar — *AI Evals for Engineers & PMs* (course) — https://hamelhusain.substack.com/p/ai-evals-for-engineers-and-product
- Shankar, Zamfirescu-Pereira, Hartmann, Parameswaran, Arawjo — *Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences* (UIST '24 / EvalGen) — https://arxiv.org/abs/2404.12272
- *Aligning LLM Agents by Learning Latent Preference from User Edits* — https://arxiv.org/pdf/2404.15269
- Braintrust — *Evaluation quickstart* — https://www.braintrust.dev/docs/evaluation · *Human review → golden datasets* — https://www.braintrust.dev/blog/human-review-golden-datasets
- Promptfoo — *Getting started* — https://www.promptfoo.dev/docs/getting-started/
- Arize — *Prompt Learning: using English feedback to optimize LLM systems* — https://arize.com/blog/prompt-learning-using-english-feedback-to-optimize-llm-systems/
- OpenAI Cookbook — *Building resilient prompts using an evaluation flywheel* — https://developers.openai.com/cookbook/examples/evaluation/building_resilient_prompts_using_an_evaluation_flywheel
- Lenny's Newsletter — *Evals, error analysis, and better prompts (with Hamel Husain)* — https://www.lennysnewsletter.com/p/evals-error-analysis-and-better-prompts
