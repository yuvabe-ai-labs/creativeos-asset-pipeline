# How Other AI SaaS Platforms Handle Credit Estimation & Deduction

**Date:** 2026-07-24
**Purpose:** Research requested to sanity-check the Stage 3 credit system design
(`2026-07-24-credit-system-design.md`) against how Replicate, OpenArt, Leonardo.Ai, and the
broader AI-SaaS-billing literature actually do this. Not a design doc itself — a reference
for what's industry-standard vs. what we're doing differently, and why.

---

## 1. The headline pattern: reserve/deduct *before* generating, settle after

This is the one pattern that shows up everywhere, independent of platform:

> "If you deduct credits after, users could fire off hundreds of concurrent requests before
> their balance hits zero. By deducting upfront, you ensure they can never exceed their paid
> limit." — [Dodo Payments, *How to Add Credits-Based Billing to Your AI App*](https://dodopayments.com/blogs/add-credits-billing-ai-app)

> "An AI credit system works by checking a customer's pre-funded credit balance before each
> model call, debiting the cost of the action if the balance covers it, and declining the
> call if it does not." — [Credyt, *How do AI credit systems work?*](https://credyt.ai/blog/ai-credit-system)

**This directly matches our design**: `reserveCredits()` runs before the provider is ever
called, row-locking the org and checking the cap *before* committing to spend. Nothing found
in this research suggests deduct-after-the-fact is an accepted alternative — it's uniformly
treated as the naive approach that lets concurrent requests blow past a limit, which is
exactly the race condition D77 named as the reason for moving off derived-on-read summing in
the first place.

---

## 2. Two genuinely different cost models, and every platform researched uses both

**Fixed-cost-per-action** (known exactly before generating, no estimation needed):
- **OpenArt** charges a flat credit cost per action regardless of actual compute — "1 credit
  for a standard image, 500 for a 5-second Kling video... you know the cost before
  generating." [Source](https://flowith.io/blog/openart-pricing-2026-free-credits-vs-pro-vs-starter/)
- **Replicate's "Official Models"** (curated, includes FLUX, Veo, Kling) bill **output-based**
  — per token/image/video-second, a fixed rate per unit of output, not variable compute time.
  [Source](https://dodopayments.com/blogs/replicate-billing-model)

**Metered/variable cost** (genuinely unknown until the job runs):
- **Replicate's community models & custom deployments** bill **hardware-per-second** — GPU
  uptime × the hardware tier's rate, which varies with how long the actual inference takes.
  [Source](https://dodopayments.com/blogs/replicate-billing-model)
- **Leonardo.Ai** uses a token-per-inference-step model that scales with resolution, model
  choice, and enabled features — "SDXL consumes approximately 2× more tokens than Leonardo
  Diffusion... generating 4 images in one batch costs approximately 3.5× token cost compared
  to generating them individually." Notably, **even third-party premium models (Veo 3,
  Kling, Sora 2, Nano Banana Pro) get folded into Leonardo's own token unit** — they don't
  expose the provider's raw pricing structure to the user at all.
  [Source](https://intercom.help/leonardo-ai/en/articles/8044033-token-usage)

**How this maps to our own split:** this is exactly the same fork our design already made,
just for different reasons per model rather than per platform. Video and image-with-known-
quality/size are the "fixed-cost" case (Replicate's Official Models, OpenArt's flat rates) —
exact, no estimation needed. Prompt/text generation is the "metered, unknowable until it
runs" case (closer to Replicate's per-second billing, where actual usage determines actual
cost) — which is why that's the one type we treat as approximate, not the others.

---

## 3. Pre-generation cost display is standard, not a differentiator

> "Users can calculate exactly what any job will cost before running it. Replicate shows
> cost estimates on each model's page." — [Dodo Payments, *How Replicate Handles Billing*](https://dodopayments.com/blogs/replicate-billing-model)

> OpenArt: "you know the cost before generating" — same claim, same platform category.

Confirms the premise of this whole stage (§1 of the design spec: "every other AI image/video
SaaS shows this, its absence is a real gap") wasn't an assumption — it's the norm across the
platforms checked.

---

## 4. Where the research came up short — worth naming honestly

Two sources ([Stigg's engineering post](https://www.stigg.io/blog-posts/weve-built-ai-credits-and-it-was-harder-than-we-expected)
on building AI credits, and the same Dodo Payments Replicate piece) were fetched
specifically hoping for **reconciliation mechanics** — what happens when actual cost differs
from the estimate that was reserved. Neither had it:
- Stigg's post covers granting/consuming/expiring/enforcing credits at an architectural
  level, but explicitly doesn't describe pre-generation estimation, reservation/hold
  mechanics, or actual-vs-estimated reconciliation.
- The Replicate piece confirms estimates are shown but says nothing about whether a
  hold/reservation is placed, or how a prediction that runs longer than estimated is
  resolved.

**So the "reserve exact estimate, settle to actual after" approach in our own design
(§4 of the credit-system spec) doesn't have a directly-confirmed industry precedent from
this research** — it's a reasonable inference from the general "deduct before, not after"
principle (§1 above), not something any source spelled out mechanically. Two adjacent ideas
did surface that are worth naming even though we haven't adopted them:
- One general AI-credits guide suggested **estimating with a buffer** — "multiplying images
  needed by model cost and adding a 20% buffer for revisions" — as a way to avoid
  under-reserving. [Source](https://schematichq.com/blog/ai-credits) We don't currently pad
  the reservation amount; given our own already-flagged gap (reference-image input tokens
  excluded from the image estimate, spec §5), a small buffer would reduce — not eliminate —
  the chance that settlement lands slightly above what was reserved for edit-heavy
  generations. Worth considering, not adopted here.
- The general literature also names **hard limits vs. soft limits/overage** as a real fork
  (deny at zero balance vs. allow overage and bill later). Our design is a hard limit (reject
  at the cap) — consistent with D77's original scope, just noting it's a named choice among
  real alternatives, not the only option.

---

## 5. Platform-by-platform summary

| Platform | Cost model | Estimate shown pre-gen? | Deduct timing | Rollover |
|---|---|---|---|---|
| **Replicate** — Official Models | Fixed, per output unit | Yes | Not documented | N/A (pay-as-you-go, not credits) |
| **Replicate** — community/custom | Metered, per-second GPU time | Yes (rate is known, duration isn't always) | Not documented | N/A |
| **OpenArt** | Fixed, per action | Yes, explicitly | Not documented, but flat-cost model makes pre/post moot — no estimation gap to reconcile | Subscription credits: no rollover, expire monthly. Add-on credits: carry over. |
| **Leonardo.Ai** | Metered, token-per-step, scales with model/resolution/batch/features | Implied by token cost tables, not confirmed as a live pre-gen UI estimate | Not documented | Not researched |
| **This app (proposed)** | Fixed for video/image (deterministic per model+params), metered/approximate for prompt/text | Yes, all 3 types | Before generation (reservation), settles to actual after | Monthly reset (UTC), matches OpenArt's subscription-credit pattern |

---

## 6. Sources

- [Dodo Payments — How Replicate Handles Billing: A Complete Breakdown](https://dodopayments.com/blogs/replicate-billing-model)
- [Flowith — OpenArt Pricing 2026: Free Credits vs. Pro vs. Starter](https://flowith.io/blog/openart-pricing-2026-free-credits-vs-pro-vs-starter/)
- [Leonardo.Ai Help Center — Token Usage](https://intercom.help/leonardo-ai/en/articles/8044033-token-usage)
- [Dodo Payments — How to Add Credits-Based Billing to Your AI App](https://dodopayments.com/blogs/add-credits-billing-ai-app)
- [Credyt — How do AI credit systems work?](https://credyt.ai/blog/ai-credit-system)
- [Schematic — AI Credits: How They Work, Pricing Models, and Implementation](https://schematichq.com/blog/ai-credits)
- [Stigg — We've built AI Credits. And it was harder than we expected.](https://www.stigg.io/blog-posts/weve-built-ai-credits-and-it-was-harder-than-we-expected) (fetched directly — confirmed it does *not* cover estimation/reservation mechanics, noted in §4 rather than cited as a positive source)

All fetched/searched 2026-07-24. Search-engine results (not directly fetched pages) are
third-party summaries of these platforms' actual pricing pages, not the platforms' own
documentation — treat with the same "not independently re-verified" caveat used for 🟡-tier
entries in the pricing-sources doc, one tier below the primary-source pastes used for our
own model pricing.
