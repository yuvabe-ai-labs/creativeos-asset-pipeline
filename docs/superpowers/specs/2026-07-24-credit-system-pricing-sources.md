# Credit System — Cost Estimate Reference & Sources

**Date:** 2026-07-24
**Companion to:** `2026-07-24-credit-system-design.md` (architecture) — this doc is the
pricing data itself: what each model costs, where every number came from, and exactly how
confident each figure is. Read this before touching `video-gen/cost.ts` or
`image-gen/cost.ts` again.

---

## 1. The unit

**1 credit = $0.001 USD** (today's rate — a named constant, `USD_TO_CREDITS`, meant to be
bumped by hand later for margin, same pattern as `USD_TO_INR` in `pricing.ts`; see the
design spec's "credit definition" discussion for why).

Two separate stored facts, not one value with a live formula:
- `generations.credits_consumed` — pre-existing column, stores the **raw USD** actual cost.
  Despite the name, it's dollars, unchanged by this work.
- `credit_transactions.amount` (the new ledger) — stores **credits**, computed **once**, at
  the moment each row is written, using whatever `USD_TO_CREDITS` is *at that moment*. Once
  written, it's a plain stored number — nothing re-reads `credits_consumed` and re-multiplies
  it later. A future rate change only affects new rows; past ones keep the credit amount they
  were given when they were written.

---

## 2. Confidence key

- 🟢 **Verified this session** — sourced from a primary vendor page, fetched or pasted
  directly by the user or cross-checked against independently-known figures before being
  trusted.
- 🟡 **Inherited, cited, not re-verified** — has a source comment in the code, predates this
  session's research, not independently re-checked.
- 🔴 **Known gap or explicit assumption** — flagged in the code or spec as approximate/missing,
  not silently treated as exact.

---

## 3. Video — `src/lib/video-gen/cost.ts`

| Model | Rate | Confidence | Source |
|---|---|---|---|
| `veo:veo-3.1-lite` | $0.05/s (720p) / $0.08/s (1080p) | 🟢 | `ai.google.dev/gemini-api/docs/pricing`, fetched 2026-08-08; 720p figure originally pasted by the user 2026-07-24 |
| `veo:veo-3.1-fast` | $0.10/s (720p) / $0.12/s (1080p) | 🟢 | same |
| `veo:veo-3.1` (Quality) | $0.40/s (720p and 1080p — flat) | 🟢 | same — corrected 2026-07-24, was $0.2667/s (a stale "base rate" a 1.5× audio multiplier never actually applied, since Veo has no audio toggle in this app) |
| `openai:sora-2` | $0.10/s (720p) | 🟢 | `developers.openai.com/api/docs/pricing`, "Video generation models" table, pasted directly by the user 2026-07-24 — exact match. (That page also lists `sora-2-pro` at $0.30–$0.70/s by resolution — a real model, just not one this app's registry offers.) |
| `kling:kling-3-0-turbo` | $0.112/s (720p, native audio only) / $0.14/s (1080p) | 🟢 | `kling.ai/document-api/pricing/base/video`, full table pasted directly by the user 2026-07-24 |
| `kling:kling-2-6` | $0.042/s (720p, off only) / $0.07–$0.14/s (1080p) | 🟢 | same — 720p+native audio has no priced tier at all (real table shows "-" for that cell); `computeVideoCost` returns `null` for that combination rather than silently substituting the off rate, a real bug found and fixed this session |
| `kling:kling-2-5-turbo` | $0.042/s (720p) / $0.07/s (1080p) | 🟢 | same |
| `kling:kling-3-0` | $0.084–$0.126/s (720p) / $0.112–$0.168/s (1080p) / $0.42/s (4k) | 🟢 | same — **corrected this session**: the with-audio rate was $0.112/$0.14, a flat +$0.028/s guess; the real table's delta is +$0.042 (720p) / +$0.056 (1080p), a consistent +50%, not a flat step |
| `kling:kling-o1` | $0.084/s (720p) / $0.112/s (1080p), flat regardless of audio | 🟢 | same — **corrected this session, structurally**: the old $0.112/$0.14 "with audio" tier was wrong on two counts — it reused kling-3-0's now-also-corrected flawed delta, and more fundamentally the real table splits O1's price by *video input* (a reference video clip), not audio — a dimension this app never sends (image-to-video via start frame only, same as every other Kling model here). Audio doesn't move O1's price at all; every O1 generation with audio enabled had been silently overcharged |

**Why Veo stops at 1080p, not 4k:** `params/veo.ts`'s resolution select (added 2026-08-08)
only offers 720p/1080p — Google's page also lists 4k for Quality ($0.60/s) and Fast
($0.30/s), but the `@google/genai` SDK's `GenerateVideosConfig.resolution` field documents
only "720p" and "1080p" as supported, so 4k was left unpriced as unreachable rather than
dead weight in the table.

**Why Veo has no real audio multiplier:** confirmed directly against the pasted page — every
Veo 3.1 price is labeled "with audio price (default)," no separate cheaper no-audio tier
exists. This app never toggles Veo's audio either way, so there's nothing to multiply.

---

## 4. Image — actual/settlement cost, `src/lib/image-gen/cost.ts`

Computed from real token usage the provider returns *after* generation (`tokensUsed` on the
API response) — this is what actually gets written to `credits_consumed`.

| Model | textIn | imgIn | imgOut | Confidence | Source |
|---|---|---|---|---|---|
| `openai:gpt-image-2` | $5.00/1M | $8.00/1M | $30.00/1M | 🟢 | `developers.openai.com/api/docs/pricing`, "Image generation models" table, pasted directly by the user 2026-07-24 — exact match |
| `openai:gpt-image-1` | $5.00/1M | $10.00/1M | $40.00/1M | 🟢 | cross-checked: `gpt-image-1` Medium/1024×1024 = 1056 tokens × $40/1M = $0.0422, matching the estimate table's $0.042 (§5). Not in the pricing-table paste above — that table lists `gpt-image-2`/`gpt-image-1.5`/`gpt-image-1-mini` only; `gpt-image-1` (this app's model, not `1.5`) isn't shown there, only in the "Calculating costs" comparison table (§5's source) |
| `openai:gpt-image-1-mini` | $2.00/1M | $2.50/1M | $8.00/1M | 🟢 | same pricing-table paste as `gpt-image-2` above — exact match |
| `gemini:gemini-2.5-flash-image` | $0.30/1M | $0.30/1M | $30.00/1M | 🟢 | `ai.google.dev/gemini-api/docs/pricing`, pasted by the user 2026-07-24 |
| `gemini:gemini-3.1-flash-image` | $0.50/1M | $0.50/1M | $60.00/1M | 🟢 | same — **corrected this session**, textIn/imgIn were $0.30/$0.30 (Google prices combined text+image input as one $0.50 rate, not split) |
| `gemini:gemini-3-pro-image` | $2.00/1M | $2.00/1M | $120.00/1M | 🟢 | same — **corrected this session**, imgOut was $80.00 (marked "estimated — update when Google publishes"; Google has published it) and textIn/imgIn were $1.25/$1.25 (same combined-rate fix as 3.1-flash-image) |

Both `gemini-3-pro-image` corrections apply **going forward only** — past `credits_consumed`
values are not backfilled.

---

## 5. Image — pre-generation estimate

Different from §4: this is what's shown to the user *before* they click Generate, computed
from request params alone (quality/size), not real usage. Lives in a new
`IMAGE_ESTIMATE_TABLE` (not built yet — see the design spec §5), sourced directly:

| Model | Low | Medium | High | Confidence |
|---|---|---|---|---|
| `gpt-image-2` | $0.005–$0.006 | $0.041–$0.053 | $0.165–$0.211 | 🟢 |
| `gpt-image-1` | $0.011–$0.016 | $0.042–$0.063 | $0.167–$0.25 | 🟢 |
| `gpt-image-1-mini` | $0.005–$0.006 | $0.011–$0.015 | $0.036–$0.052 | 🟢 |

(ranges = across the app's 3 reachable sizes: 1024×1024 / 1024×1536 / 1536×1024 — the only
sizes `ASPECT_RATIO_TO_OPENAI_SIZE` ever produces)

Source: `developers.openai.com/api/docs/guides/image-generation`, "Calculating costs"
section — pasted directly by the user 2026-07-24, after two earlier automated-fetch attempts
gave inconsistent/wrong results (one mislabeled the model, one claimed the table didn't
exist) — **do not trust an automated fetch for this table again; get it pasted directly.**

| Model | Estimate | Confidence |
|---|---|---|
| `gemini-2.5-flash-image` | flat $0.039/image | 🟢 — genuinely fixed at 1K, confirmed via Google's model docs (pre-dates the "Gemini 3 image models" generation that introduced multi-resolution output); `params/gemini.ts` corrected this session to stop offering 512/2K/4K for this model, since it never supported them |
| `gemini-3.1-flash-image` | $0.045 (512px) / $0.067 (1024px) / $0.101 (2048px) / $0.151 (4096px) | 🟢 |
| `gemini-3-pro-image` | $0.134 (1K/2K) / $0.24 (4K) | 🟢 |

Source: same Gemini pricing page as §3/§4.

### Input tokens: one official pre-flight counting call per provider

The output table above is **output-only**. OpenAI's own docs state final cost sums input
text tokens + input image tokens (edits) + output tokens. For both providers, input
(text-only, or text+reference-images together) is covered by **one official API call each**
— no separate local-tokenizer library needed for the text-only case, since both official
endpoints already handle plain text as their simplest input shape.

- **Gemini — text and reference images, one call:** 🟢 closed. `ai.models.countTokens()`
  (`@google/genai`, already a dependency) accepts the exact same `contents` shape
  `generateWithGemini()` already builds for a real generation — a text-only array for
  prompt-only requests, or text + `inlineData` image parts for edits — call it before
  generating for an exact pre-flight count either way. Source:
  `ai.google.dev/gemini-api/docs/generate-content/tokens` — the `generateContent`-API
  version of the docs, matching what `gemini.ts` actually calls (not the newer Interactions
  API) — pasted directly by the user, with a worked multimodal example matching this app's
  request shape. Google also publishes the underlying image-token formula (≤384px = 258
  tokens; larger images tile into 768×768 sections, 258 tokens each) — usable as a local
  computation from `imageWidth`/`imageHeight` (already tracked in `image-generate/route.ts`)
  instead of a live call, if preferred at implementation time.
- **OpenAI — text and reference images, one call:** 🟢 closable, one inference away from
  fully confirmed. `client.responses.input_tokens.count()` (`POST /v1/responses/input_tokens`)
  handles both — its first documented example is plain text input, and it "explicitly
  handles images... no guesswork" per its own docs. Source:
  `developers.openai.com/api/docs/guides/token-counting`, pasted directly by the user,
  worked image example uses `image_url` (this app's reference images are already public
  Supabase URLs — same shape). **The one open inference:** this endpoint counts tokens for a
  **Responses API** request; GPT Image models go through the separate **Images API**
  (`images.generate`/`images.edit`). The earlier "Calculating costs" guide explicitly
  pointed to this same vision-token machinery for GPT Image's input costs, strongly
  suggesting shared tokenization — not directly confirmed as "this is exactly what
  `images.edit()` bills." Worth a real-world sanity check against
  `usage.input_tokens_details.image_tokens` on an actual response once implemented.

---

## 6. Prompt/text generation — approximate by design

No vendor can predict an LLM's output length before generating it (checked directly —
OpenAI's "Predicted Outputs" feature requires *you* to already know the output; it doesn't
forecast an unknown one). Estimate formula: `fixed_base + (per_attached_node_multiplier ×
count of upstream nodes attached to the prompt node)`, both constants derived from this
app's own historical `credits_consumed` data once enough exists (this app has zero
prompt-type generation history on staging today — starts on a placeholder, self-corrects as
real usage accumulates). Labeled "~estimated" in the UI, unlike video/image.

---

## 7. Full source list

- `ai.google.dev/gemini-api/docs/pricing` — Gemini image models (§4/§5), Veo 3.1 (§3). Pasted
  directly by the user, 2026-07-24.
- `developers.openai.com/api/docs/guides/image-generation` ("Calculating costs" section) —
  OpenAI image models' estimate table (§5). Pasted directly by the user, 2026-07-24, after
  automated fetches proved unreliable for this specific table.
- `developers.openai.com/api/docs/pricing` — two different things live on this page, don't
  conflate them: the quality/size-tiered **estimate** breakdown (§5) genuinely isn't here
  (correctly sourced from the guide above instead) — but the flat per-1M-token **actual-cost**
  rates for `gpt-image-2`/`gpt-image-1-mini` (§4) and `sora-2` (§3) *are* here, in the "Image
  generation models" / "Video generation models" tables. An earlier automated fetch of this
  page missed that distinction and wrongly reported no usable table at all; the user pasted
  the real tables directly 2026-07-24, which is what upgraded those three rows from 🟡 to 🟢.
- `kling.ai/document-api/pricing/base/video` — Kling's 5 current models (§3). Originally
  fetched 2026-07-23 as part of the D90 Kling rewrite; **the full table was re-pasted
  directly by the user 2026-07-24**, which is what caught and corrected the `kling-3-0` /
  `kling-o1` audio-pricing bugs — the 2026-07-23 fetch had gotten those two wrong.
