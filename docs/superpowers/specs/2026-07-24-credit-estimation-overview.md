# Credit Estimation Overview

How CreativeOS estimates and charges credits for AI generation — by type, by provider, with
sources. Every generation shows its estimated cost before the user clicks Generate, and
settles to the real cost once it completes.

**The unit:** 1 credit = $0.001 USD today (a plain constant we can adjust later, e.g. for
margin — changing it only affects new generations, never past ones).

---

## Image Generation

Cost depends on the model and the resolution/quality requested. Shown per-generation below;
a "generation" = one image at that setting.

### OpenAI

| Model | Low | Medium | High |
|---|---|---|---|
| GPT Image 2 | $0.005–$0.006 | $0.041–$0.053 | $0.165–$0.211 |
| GPT Image 1 | $0.011–$0.016 | $0.042–$0.063 | $0.167–$0.25 |
| GPT Image 1 Mini | $0.005–$0.006 | $0.011–$0.015 | $0.036–$0.052 |

*(ranges span the 3 sizes CreativeOS supports; source: OpenAI's [image generation
guide](https://developers.openai.com/api/docs/guides/image-generation) and [pricing
page](https://developers.openai.com/api/docs/pricing))*

**How the estimate is built:** the numbers above cover output — a direct lookup by
quality/size, no guessing. On top of that, input is added: OpenAI's official
[token-counting API](https://developers.openai.com/api/docs/guides/token-counting) counts
prompt text and reference images together in one call — no separate tool needed for
text-only vs. text+image requests.

### Gemini

| Model | Estimate |
|---|---|
| Gemini 2.5 Flash Image | $0.039 flat (fixed resolution, doesn't scale) |
| Gemini 3.1 Flash Image | $0.045 (512px) → $0.067 (1024px) → $0.101 (2048px) → $0.151 (4096px) |
| Gemini 3 Pro Image | $0.134 (1K/2K) → $0.24 (4K) |

*(source: Google's [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing))*

**How the estimate is built:** output scales by resolution, all a direct lookup. Input
(prompt text *and* reference images together) is counted exactly via Gemini's
[`countTokens`](https://ai.google.dev/gemini-api/docs/generate-content/tokens) — it accepts
the same request shape as generation, so we can check the size before committing to
generate.

---

## Video Generation

All three providers price per second — duration, resolution, and audio are all known before
generating, so these estimates are exact, not approximations.

| Provider | Model | Rate |
|---|---|---|
| Google | Veo 3.1 Lite | $0.05/s (720p) → $0.08/s at 1080p |
| Google | Veo 3.1 Fast | $0.10/s (720p) → $0.12/s at 1080p |
| Google | Veo 3.1 Quality | $0.40/s (flat — same rate at 720p and 1080p) |
| OpenAI | Sora 2 | $0.10/s |
| Kling | 3.0 Turbo | $0.112/s (native audio) → $0.14/s at 1080p |
| Kling | 2.6 | $0.042/s → up to $0.14/s with audio at 1080p |
| Kling | 2.5 Turbo | $0.042/s → $0.07/s at 1080p |
| Kling | 3.0 | $0.084–$0.126/s → up to $0.168/s at 1080p → $0.42/s at 4K |
| Kling | O1 | $0.084/s → $0.112/s at 1080p (flat — audio doesn't change price for this model) |

*(sources: Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) for Veo,
OpenAI's [pricing page](https://developers.openai.com/api/docs/pricing) for Sora, Kling's
[pricing docs](https://kling.ai/document-api/pricing/base/video))*

**How the estimate is built:** exact, no tooling required beyond a lookup table — the app
already knows the requested duration, resolution, and audio setting before firing the
generation.

---

## Prompt / Text Generation

The one type that can't be estimated exactly, by nature: no AI provider can predict how long
a text response will be before generating it (OpenAI's own "Predicted Outputs" feature
requires *you* to already know the output — it doesn't forecast an unknown one).

**How the estimate is built:** a fixed base cost plus a per-attached-input multiplier (more
connected files/images → a longer prompt → typically a longer response), calibrated from
this app's own real usage over time. Clearly labeled as an estimate in the UI, unlike
image/video — and like everything else, it settles to the real cost once the generation
completes.

---

## The one constant across all three

Every estimate shown before generating is just that — an estimate to inform the user. The
actual credits charged always come from the real cost the provider reports back afterward.
Nothing here risks over- or under-charging based on a wrong guess; the estimate only affects
what's shown *before* you click Generate.

---

## Sources

- [OpenAI — Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) — GPT Image output cost by quality/size
- [OpenAI — Pricing](https://developers.openai.com/api/docs/pricing) — GPT Image/Sora per-token and per-second rates
- [OpenAI — Token counting](https://developers.openai.com/api/docs/guides/token-counting) — official pre-flight input-token counting (text and images, one call)
- [Google — Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — Gemini image models and Veo
- [Google — Counting tokens](https://ai.google.dev/gemini-api/docs/generate-content/tokens) — official pre-flight `countTokens` (text and images, one call)
- [Kling — Video pricing](https://kling.ai/document-api/pricing/base/video) — all 5 current Kling models
