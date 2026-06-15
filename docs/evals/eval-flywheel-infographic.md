# Eval Flywheel — Infographic Blueprint

A draw-ready distillation of the eval flywheel (full prose: `2026-06-14-eval-flywheel-rationale.md`).
Each block below = one panel. Icons are Lucide names; accent = brand purple `#5829c7`, sparingly.

---

## TITLE PANEL
**From vibe-checking → measured prompts**
*A self-tightening loop that improves CreativeOS's AI prompts with evidence, not opinion.*
> One line: **capture → accumulate → error-analysis → evals → fix → repeat.**

---

## THE LOOP (center graphic — circular, 4 nodes + a return arrow)

```
        ┌──────────────► ① CAPTURE ──────────────┐
        │            (icon: Camera)               │
        │   store the model's raw output +        ▼
   ④ EVALS                                   ② ACCUMULATE
 (icon: Gauge)                              (icon: Database)
 turn failures into                         real + synthetic
 binary pass/fail tests                     traces pile up
        ▲                                         │
        │            ③ ERROR ANALYSIS ◄───────────┘
        └──────────  (icon: Search)  
                     read · label · cluster
                     "3 issues = 60% of failures"
```
Caption: *each turn the golden set grows, the prompt sharpens, the scorers improve → the loop
spins faster.*

---

## THE 4 STEPS (four cards in a row)

| # | Step | Icon | One-liner | Status |
|---|------|------|-----------|--------|
| ① | **Capture** | `Camera` | Keep the model's *raw* output beside the human-edited one — the diff is the signal. | ✅ shipped (D22) |
| ② | **Accumulate** | `Database` | Let traces build up — or bootstrap them from real scripts. | ✅ 20 traces (Run 01) |
| ③ | **Error analysis** | `Search` | Read each trace, mark pass/fail + note, cluster into failure modes. | 🔵 in progress (viewer built) |
| ④ | **Evals** | `Gauge` | Encode the top failures as binary tests; re-measure after each prompt change. | ⚪ next |

---

## STEP ③ ZOOM — the two coding passes (two stacked bars)

- **OPEN CODING** *(diverge)* — `PenLine` — read a trace, write a *raw* note, no categories. Pair
  with a **binary pass/fail**.
- **AXIAL CODING** *(converge)* — `Layers` — group the notes into a few **named failure modes + counts**
  → the #1 fix.
> Rule: **open before axial** — you discover the categories by labelling (Shankar's catch-22).

---

## THE GOLDEN RULE (callout box, purple)
**Freeze the system, vary the input.**
Hold the prompt + KB + instruction + model constant; vary only the shot. → failures are attributable
to *the prompt*, and the dataset stays a valid yardstick across prompt versions.

---

## ONE NODE = ONE INPUT (small diagram)
```
20 shots → 20 Prompt nodes (one each)
re-run a fixed prompt → +1 version per node  =  per-shot before/after
```

---

## RUN 01 RESULT (stat panel — big numbers)
- **20 / 20** traces generated · **10 VISUAL · 7 VO · 3 TEXT**
- prompt: `prompt-generate v2` · model: `gpt-5.4-mini`
- **Top failure mode: template homogeneity** — every prompt collapses to the same lens (85mm f/1.8),
  lighting, palette + 4 hex codes → images look interchangeable.
- Holding well: no banned tokens, no compliance words, casting rule applied.

---

## METHOD CREDIT (footer)
Hamel Husain & Shreya Shankar — *AI Evals for Engineers & PMs* · field guide + EvalGen.
(See rationale doc for sources.)

---

# CONCRETE EXAMPLE — one shot through the loop

*(Real trace from Run 01 — Reel #22 "This Diwali — Gift Nourishment", shot 2. Draw this as a
vertical flow: each box feeds the next, loop returns at the bottom. Source: the run log.)*

### ▸ INPUT — the source shot *(box, neutral)*
> **Shot 2** — A lit taper candle in the foreground; a Diwali gift arrangement behind it (amber
> glass bottles, cream carton, ceramic bowl of petals on aged linen). **Wide shot.** 6s.

### ① CAPTURE — run the real prompt → store the output *(box, accent)*
`prompt-generate v2` (system frozen) + KB + default instruction → **generated image prompt:**
> "A lit taper candle glows in the foreground while a curated Prakriti Sattva Diwali gift
> arrangement rests behind it… **Center-framed wide shot, low angle, 85mm f/1.8** … golden-hour
> backlighting … muted teal tones, **warm Kodak Portra palette**, warm cream **#F5F0E8**, turmeric
> gold **#C8A000** …"

Stored as → node **`s22-shot0`** · its **active version** · `generated_output` frozen (D22).

### ③ OPEN CODING — a human reads + labels *(box, with a red FAIL chip)*
| decision | note (the open code) |
|---|---|
| **✗ FAIL** | *"shot says **wide**, prompt says **85mm** (a portrait lens) — contradiction. Plus the same Kodak/teal + 4 hex codes as every other trace."* |

### ③ AXIAL CODING — this note rolls up into failure modes *(two tags)*
`#lens-shot-mismatch`  ·  `#template-homogeneity`  → counted across all 20 (homogeneity ≈ 18/20).

### ④ THE FIX — change the prompt *(box, accent)* · *illustrative — not yet run*
`prompt-generate` **v2 → v3**: *"Choose the lens from the shot type — wide → 24–35mm, medium →
50mm, close-up → 85mm. Vary lighting and palette per scene; don't apply every brand hex to every
shot."*

### ↻ RE-RUN (Run 02) — same shot, new prompt *(box) · projected*
> "… **wide-angle 24mm**, deep focus, festival bokeh … warm candle glow, restrained palette …"

| decision | note |
|---|---|
| **✓ PASS** | *"lens matches the wide shot; palette no longer boilerplate."* |

### 📈 MEASURE *(stat strip, projected)*
**Template homogeneity: 18/20 → (target) 4/20** · #22 lens fixed · *and the loop spins again on the
next-biggest failure mode.*

> The point of the panel: **the same shot, the same frozen harness — only the prompt changed — so
> the improvement is provably the prompt's.** That's the flywheel in one trace.
