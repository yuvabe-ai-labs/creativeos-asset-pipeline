# Every Priced Combination — Full Enumeration

Every model this app can actually generate with, every parameter combination its own UI can
actually produce, and the exact price for each. No ranges, no shorthand — this is the literal
table `IMAGE_ESTIMATE_TABLE`/`KLING_RESOLUTION_PRICING`/`VIDEO_MODEL_PRICING` need to encode.
Companion to `2026-07-24-credit-system-pricing-sources.md` (sources/confidence) and
`2026-07-24-credit-system-design.md` (architecture) — this doc is the exhaustive data dump
those two summarize.

A blank/"—" cell means that combination is not offered by this app's own params (never
reachable, not worth pricing) or, for `kling-2-6`, reachable but genuinely unpriced by the
vendor (flagged explicitly, not blank by omission).

---

## Video

### Veo (Google) — no resolution or audio param exposed; flat rate × duration

| Model | Rate |
|---|---|
| Veo 3.1 Lite | $0.05/s |
| Veo 3.1 Fast | $0.10/s |
| Veo 3.1 Quality | $0.40/s |

### Sora (OpenAI) — one size tier only

| Model | Size | Rate |
|---|---|---|
| Sora 2 | 1280×720 / 720×1280 | $0.10/s |

*(`1792x1024`/`1024x1792` were removed from this app's params 2026-07-24 — those belong to
`sora-2-pro`'s pricing tier, a model this app never calls; found via this audit, not
previously priced correctly either.)*

### Kling — resolution × audio, 5 models

| Model | 720p, no audio | 720p, native/original audio | 1080p, no audio | 1080p, native/original audio | 4K |
|---|---|---|---|---|---|
| Kling 3.0 Turbo | $0.112/s | *(no audio param — always the $0.112/$0.14 rate)* | $0.14/s | *(same)* | — |
| Kling 2.6 | $0.042/s | **not priced — Kling doesn't offer this combination** | $0.07/s | $0.14/s | — |
| Kling 2.5 Turbo | $0.042/s | *(no audio param)* | $0.07/s | *(no audio param)* | — |
| Kling 3.0 | $0.084/s | $0.126/s | $0.112/s | $0.168/s | $0.42/s (audio doesn't change 4K price) |
| Kling O1 | $0.084/s | $0.084/s (audio doesn't change price) | $0.112/s | $0.112/s | — (not offered) |

---

## Image

### OpenAI — quality × size, all 3 models

| Model | Low, 1024×1024 | Low, 1024×1536 | Low, 1536×1024 | Medium, 1024×1024 | Medium, 1024×1536 | Medium, 1536×1024 | High, 1024×1024 | High, 1024×1536 | High, 1536×1024 |
|---|---|---|---|---|---|---|---|---|---|
| GPT Image 2 | $0.006 | $0.005 | $0.005 | $0.053 | $0.041 | $0.041 | $0.211 | $0.165 | $0.165 |
| GPT Image 1 | $0.011 | $0.016 | $0.016 | $0.042 | $0.063 | $0.063 | $0.167 | $0.25 | $0.25 |
| GPT Image 1 Mini | $0.005 | $0.006 | $0.006 | $0.011 | $0.015 | $0.015 | $0.036 | $0.052 | $0.052 |

*(these 3 sizes are the only ones reachable — `ASPECT_RATIO_TO_OPENAI_SIZE` maps every
selectable aspect ratio down to one of these three)*

Output-only. Input tokens (prompt text + reference images for edits) come from a separate
live call per generation — see the design spec §5, not a static lookup, so not tabulated here.

### Gemini — size only (aspect ratio doesn't change price — see design spec §5 for why that's
an inference, not a stated vendor fact)

| Model | Size | Rate |
|---|---|---|
| Gemini 2.5 Flash Image | 1K (only size offered) | $0.039 flat |
| Gemini 3.1 Flash Image | 512px | $0.045 |
| Gemini 3.1 Flash Image | 1024px | $0.067 |
| Gemini 3.1 Flash Image | 2048px | $0.101 |
| Gemini 3.1 Flash Image | 4096px | $0.151 |
| Gemini 3 Pro Image | 1K | $0.134 |
| Gemini 3 Pro Image | 2K | $0.134 (same tier as 1K) |
| Gemini 3 Pro Image | 4K | $0.24 |

Same as OpenAI: output-only, input tokens are a live per-generation call, not tabulated here.

---

## Prompt / Text

Not a lookup table — a formula, since the input is unbounded (any number of attached
upstream nodes, not a fixed set of combinations):

```
credits = 10 (base) + 5 × (number of upstream nodes attached to the prompt node)
```

0 attachments → 10 credits. 3 attachments → 25 credits. Explicitly a starting placeholder
(not sourced the way everything else on this page is) — see the design spec §5.

---

## What changed while compiling this

Two real bugs surfaced doing this audit that weren't visible from the summarized/ranged
versions of this data:

1. **`kling-2-6` at 720p + native audio** — silently mispriced (fell back to the no-audio
   rate) before this session; now returns `null`, never a guessed number. Fixed in
   `video-gen/cost.ts`.
2. **Sora's exposed sizes included two that were never actually priced** — `1792x1024`/
   `1024x1792` belong to `sora-2-pro`, not the `sora-2` model this app calls. Removed from
   `params/sora.ts`.

Every other cell in this document was confirmed reachable by this app's actual params and
priced by a primary vendor source (see the pricing-sources doc for exact citations per row).
