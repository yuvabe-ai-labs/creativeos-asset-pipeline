# Credit Pricing — Quick Reference

Straight price list. All numbers are in **credits**, with an estimated **₹ (INR)** in
parentheses next to each (already converted, rounded, ready to read).

**Conversion:** 1,000 credits = $1 ≈ **₹95.77** (so 1 credit ≈ ₹0.0958). ₹ figures are
estimates — the real conversion moves with the $/₹ exchange rate; credits are what's actually
charged.

**Margin:** 0% right now — these are the raw vendor costs, no markup added.
**Rounding:** every price rounds UP to the nearest 5 credits, so you're never charged less
than the real cost.

## At a glance: what 10,000 credits (≈₹957.70) gets you

Prices swing a lot by model/quality, so this is a range (cheapest option → priciest option),
not a single blended average — a single number here would be misleading either way.

| | Cheapest option | Priciest option |
|---|---|---|
| **Images** | ~2,000 images (GPT Image mini/2, low quality) | ~40 images (GPT Image 1, high quality, wide/tall) |
| **Videos** | ~50 clips (Veo Lite, 720p, 4s each) | ~3 clips (Veo Quality, 8s — one clip costs 3,200 credits / ₹306.46 on its own) |

---

## Prompt (Prompt / Video Prompt nodes)

| Setup | Credits (≈ ₹) |
|---|---|
| No connected nodes | 5 (₹0.48) |
| 1 connected node | 7.5 (₹0.72) |
| 2 connected nodes | 10 (₹0.96) |
| 3 connected nodes | 12.5 (₹1.20) |
| 4 connected nodes | 15 (₹1.44) |

*(Base 5 + 2.5 per connected node. This is a placeholder shown before generating — the real
charge afterward is based on actual usage and can differ slightly.)*

---

## Image

### GPT Image 2

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 10 (₹0.96) | 5 (₹0.48) |
| Medium | 55 (₹5.27) | 45 (₹4.31) |
| High | 215 (₹20.59) | 165 (₹15.80) |

### GPT Image 1

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 15 (₹1.44) | 20 (₹1.92) |
| Medium | 45 (₹4.31) | 65 (₹6.23) |
| High | 170 (₹16.28) | 250 (₹23.94) |

### GPT Image 1 Mini

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 5 (₹0.48) | 10 (₹0.96) |
| Medium | 15 (₹1.44) | 15 (₹1.44) |
| High | 40 (₹3.83) | 55 (₹5.27) |

*(Every non-1:1 aspect ratio prices the same — OpenAI only charges by pixel size, and all 7
of the others map to one of two identically-priced sizes.)*

Gemini models price by resolution only — aspect ratio (1:1, 16:9, 9:16, etc.) doesn't change
the price, whichever one you pick.

### Nano Banana (`gemini-2.5-flash-image`)

| Resolution | Credits (≈ ₹) |
|---|---|
| 1K (only option) | 40 (₹3.83) |

### Nano Banana 2 (`gemini-3.1-flash-image`)

| Resolution | Credits (≈ ₹) |
|---|---|
| 512 | 45 (₹4.31) |
| 1K | 70 (₹6.70) |
| 2K | 105 (₹10.06) |
| 4K | 155 (₹14.84) |

### Nano Banana Pro (`gemini-3-pro-image`)

| Resolution | Credits (≈ ₹) |
|---|---|
| 1K | 135 (₹12.93) |
| 2K | 135 (₹12.93) |
| 4K | 240 (₹22.98) |

*(A few extra credits get added on top depending on your prompt length and how many
reference images you attach — usually small, a handful of credits at most.)*

---

## Video

### Veo (Google)

| Model | Resolution | 4s | 6s | 8s |
|---|---|---|---|---|
| Veo Lite | 720p | 200 (₹19.15) | 300 (₹28.73) | 400 (₹38.31) |
| Veo Lite | 1080p | 320 (₹30.65) | 480 (₹45.97) | 640 (₹61.29) |
| Veo Fast | 720p | 400 (₹38.31) | 600 (₹57.46) | 800 (₹76.62) |
| Veo Fast | 1080p | 480 (₹45.97) | 720 (₹68.95) | 960 (₹91.94) |
| Veo Quality | 720p / 1080p (same price either way) | 1,600 (₹153.23) | 2,400 (₹229.85) | 3,200 (₹306.46) |

*(Resolution picker added 2026-08-08 — previously every Veo generation ran at 720p with no
way to choose 1080p. Quality is priced the same at both resolutions; Lite and 1080p cost
more.)*

### Sora 2 (OpenAI)

| Model | 4s | 6s | 8s |
|---|---|---|---|
| Sora 2 | 400 (₹38.31) | 600 (₹57.46) | 800 (₹76.62) |

### Kling — credits per second (multiply by clip length)

| Model | Resolution | Audio off | Audio on |
|---|---|---|---|
| Kling 3.0 | 720p | 84/s (₹8.04/s) | 126/s (₹12.07/s) |
| Kling 3.0 | 1080p | 112/s (₹10.73/s) | 168/s (₹16.09/s) |
| Kling 3.0 | 4K | 420/s (₹40.22/s) | 420/s (₹40.22/s) |
| Kling O1 | 720p | 84/s (₹8.04/s) | 84/s (₹8.04/s) |
| Kling O1 | 1080p | 112/s (₹10.73/s) | 112/s (₹10.73/s) |

Examples: Kling 3.0, 1080p, audio on → a 5s clip = 840 credits (₹80.45), a 10s clip = 1,680
credits (₹160.89). Kling O1, 720p → a 5s clip = 420 credits (₹40.22), a 10s clip = 840
credits (₹80.45).

---

## Benchmark: CreativeOS vs. OpenArt (video)

Simple comparison, real money — OpenArt's credit costs (manually logged from their own app,
2026-08-08) converted at their own $1 ≈ 400-credit rate, both sides shown in ₹.
CreativeOS's price here is our raw vendor cost with **no markup** — this isn't "we're
cheaper because we're padding less," it's "OpenArt prices close to what we pay Google/Kling
directly, subsidized by their subscription rather than the per-clip price."

| Model | Resolution | Audio | CreativeOS ₹/s | OpenArt ₹/s | Cheaper |
|---|---|---|---|---|---|
| Veo Lite | 720p | — | ₹4.79 | ₹4.79 | Tie |
| Veo Lite | 1080p | — | ₹7.66 | ₹7.18 | OpenArt |
| Veo Fast | 720p | — | ₹9.58 | ₹8.38 | OpenArt |
| Veo Fast | 1080p | — | ₹11.49 | ₹9.58 | OpenArt |
| Veo Quality | 720p / 1080p | — | ₹38.31 | ₹32.32 | OpenArt |
| Kling 3.0 | 720p | off | ₹8.04 | ₹5.99 | OpenArt |
| Kling 3.0 | 720p | on | ₹12.07 | ₹8.38 | OpenArt |
| Kling 3.0 | 1080p | off | ₹10.73 | ₹8.38 | OpenArt |
| Kling 3.0 | 1080p | on | ₹16.09 | ₹9.58 | OpenArt |
| Kling O1 | 720p | off | ₹8.04 | ₹4.79 | OpenArt |
| Kling O1 | 1080p | off | ₹10.73 | ₹7.18 | OpenArt |

**Takeaway:** OpenArt's video pricing runs at or below our raw vendor cost on every model we
checked — nowhere close to 2–3x markup, which was our first (wrong, third-party-sourced)
guess. They can do this because the credit price isn't where they make money; the
subscription is. Full sourcing and per-second math: `docs/superpowers/specs/2026-07-24-credit-system-pricing-sources.md`.
