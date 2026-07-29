# Credit Pricing — Quick Reference

Straight price list. All numbers are in **credits** (already converted, rounded, ready to
read). 1,000 credits = $1.

**Margin:** 0% right now — these are the raw vendor costs, no markup added.
**Rounding:** every price rounds UP to the nearest 5 credits, so you're never charged less
than the real cost.

## At a glance: what 10,000 credits gets you

Prices swing a lot by model/quality, so this is a range (cheapest option → priciest option),
not a single blended average — a single number here would be misleading either way.

| | Cheapest option | Priciest option |
|---|---|---|
| **Images** | ~2,000 images (GPT Image mini/2, low quality) | ~40 images (GPT Image 1, high quality, wide/tall) |
| **Videos** | ~50 clips (Veo Lite, 4s each) | ~3 clips (Veo Quality, 8s — one clip costs 3,200 credits on its own) |

---

## Prompt (Prompt / Video Prompt nodes)

| Setup | Credits |
|---|---|
| No connected nodes | 5 |
| 1 connected node | 7.5 |
| 2 connected nodes | 10 |
| 3 connected nodes | 12.5 |
| 4 connected nodes | 15 |

*(Base 5 + 2.5 per connected node. This is a placeholder shown before generating — the real
charge afterward is based on actual usage and can differ slightly.)*

---

## Image

### GPT Image 2

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 10 | 5 |
| Medium | 55 | 45 |
| High | 215 | 165 |

### GPT Image 1

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 15 | 20 |
| Medium | 45 | 65 |
| High | 170 | 250 |

### GPT Image 1 Mini

| Quality | 1:1 | 16:9, 9:16, 4:3, 3:4, 21:9, 4:1, 1:4 |
|---|---|---|
| Low | 5 | 10 |
| Medium | 15 | 15 |
| High | 40 | 55 |

*(Every non-1:1 aspect ratio prices the same — OpenAI only charges by pixel size, and all 7
of the others map to one of two identically-priced sizes.)*

Gemini models price by resolution only — aspect ratio (1:1, 16:9, 9:16, etc.) doesn't change
the price, whichever one you pick.

### Nano Banana (`gemini-2.5-flash-image`)

| Resolution | Credits |
|---|---|
| 1K (only option) | 40 |

### Nano Banana 2 (`gemini-3.1-flash-image`)

| Resolution | Credits |
|---|---|
| 512 | 45 |
| 1K | 70 |
| 2K | 105 |
| 4K | 155 |

### Nano Banana Pro (`gemini-3-pro-image`)

| Resolution | Credits |
|---|---|
| 1K | 135 |
| 2K | 135 |
| 4K | 240 |

*(A few extra credits get added on top depending on your prompt length and how many
reference images you attach — usually small, a handful of credits at most.)*

---

## Video

### Veo (Google)

| Model | 4s | 6s | 8s |
|---|---|---|---|
| Veo Lite | 200 | 300 | 400 |
| Veo Fast | 400 | 600 | 800 |
| Veo Quality | 1,600 | 2,400 | 3,200 |

### Sora 2 (OpenAI)

| Model | 4s | 6s | 8s |
|---|---|---|---|
| Sora 2 | 400 | 600 | 800 |

### Kling — credits per second (multiply by clip length)

| Model | Resolution | Audio off | Audio on |
|---|---|---|---|
| Kling 3.0 | 720p | 84/s | 126/s |
| Kling 3.0 | 1080p | 112/s | 168/s |
| Kling 3.0 | 4K | 420/s | 420/s |
| Kling O1 | 720p | 84/s | 84/s |
| Kling O1 | 1080p | 112/s | 112/s |

Examples: Kling 3.0, 1080p, audio on → a 5s clip = 840 credits, a 10s clip = 1,680 credits.
Kling O1, 720p → a 5s clip = 420 credits, a 10s clip = 840 credits.
