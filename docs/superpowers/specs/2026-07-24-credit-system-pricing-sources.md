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

All ₹ figures use `USD_TO_INR = 95.77` (`src/lib/pricing.ts`) — CreativeOS's own constant,
not a separate assumption.

| Model | Rate ($/s) | ≈ Rate (₹/s) | Confidence | Source |
|---|---|---|---|---|
| `veo:veo-3.1-lite` | $0.05 (720p) / $0.08 (1080p) | ₹4.79 (720p) / ₹7.66 (1080p) | 🟢 | `ai.google.dev/gemini-api/docs/pricing`, fetched 2026-08-08; 720p figure originally pasted by the user 2026-07-24 |
| `veo:veo-3.1-fast` | $0.10 (720p) / $0.12 (1080p) | ₹9.58 (720p) / ₹11.49 (1080p) | 🟢 | same |
| `veo:veo-3.1` (Quality) | $0.40 (720p and 1080p — flat) | ₹38.31 (flat) | 🟢 | same — corrected 2026-07-24, was $0.2667/s (a stale "base rate" a 1.5× audio multiplier never actually applied, since Veo has no audio toggle in this app) |
| `openai:sora-2` | $0.10 (720p) | ₹9.58 | 🟢 | `developers.openai.com/api/docs/pricing`, "Video generation models" table, pasted directly by the user 2026-07-24 — exact match. (That page also lists `sora-2-pro` at $0.30–$0.70/s by resolution — a real model, just not one this app's registry offers.) |
| `kling:kling-3-0-turbo` | $0.112 (720p, native audio only) / $0.14 (1080p) | ₹10.73 (720p) / ₹13.41 (1080p) | 🟢 | `kling.ai/document-api/pricing/base/video`, full table pasted directly by the user 2026-07-24 |
| `kling:kling-2-6` | $0.042 (720p, off only) / $0.07–$0.14 (1080p) | ₹4.02 (720p) / ₹6.70–₹13.41 (1080p) | 🟢 | same — 720p+native audio has no priced tier at all (real table shows "-" for that cell); `computeVideoCost` returns `null` for that combination rather than silently substituting the off rate, a real bug found and fixed this session |
| `kling:kling-2-5-turbo` | $0.042 (720p) / $0.07 (1080p) | ₹4.02 (720p) / ₹6.70 (1080p) | 🟢 | same |
| `kling:kling-3-0` | $0.084–$0.126 (720p) / $0.112–$0.168 (1080p) / $0.42 (4k) | ₹8.04–₹12.07 (720p) / ₹10.73–₹16.09 (1080p) / ₹40.22 (4k) | 🟢 | same — **corrected this session**: the with-audio rate was $0.112/$0.14, a flat +$0.028/s guess; the real table's delta is +$0.042 (720p) / +$0.056 (1080p), a consistent +50%, not a flat step |
| `kling:kling-o1` | $0.084 (720p) / $0.112 (1080p), flat regardless of audio | ₹8.04 (720p) / ₹10.73 (1080p) | 🟢 | same — **corrected this session, structurally**: the old $0.112/$0.14 "with audio" tier was wrong on two counts — it reused kling-3-0's now-also-corrected flawed delta, and more fundamentally the real table splits O1's price by *video input* (a reference video clip), not audio — a dimension this app never sends (image-to-video via start frame only, same as every other Kling model here). Audio doesn't move O1's price at all; every O1 generation with audio enabled had been silently overcharged |

**Why Veo stops at 1080p, not 4k:** `params/veo.ts`'s resolution select (added 2026-08-08)
only offers 720p/1080p — Google's page also lists 4k for Quality ($0.60/s) and Fast
($0.30/s), but the `@google/genai` SDK's `GenerateVideosConfig.resolution` field documents
only "720p" and "1080p" as supported, so 4k was left unpriced as unreachable rather than
dead weight in the table.

**Why Veo has no real audio multiplier:** confirmed directly against the pasted page — every
Veo 3.1 price is labeled "with audio price (default)," no separate cheaper no-audio tier
exists. This app never toggles Veo's audio either way, so there's nothing to multiply.

### OpenArt's own credit pricing (their system — not the same unit as CreativeOS's credits)

🟢 Manually logged by the user directly from OpenArt's own generation UI (not a third-party
blog estimate — see the correction note below). Revises the first pass of this table, which
didn't separate Kling's audio-on/audio-off credit costs; the user re-logged Kling 3.0 and
Kling O1 with the audio dimension split out.

**OpenArt credits and CreativeOS credits are two unrelated units, not a shared currency** —
OpenArt's credit is worth $0.0025 (at the conversion basis below), CreativeOS's credit is
worth $0.001 fixed (`USD_TO_CREDITS`, §1). A raw credit-count-to-credit-count comparison
between the two platforms would be meaningless; only the real-money (₹/$) conversion of each
is comparable, which is what the benchmark table further down does.

**Conversion basis: ~400 OpenArt credits per $1.** Not an OpenArt-published flat rate —
OpenArt's own subscription plans each imply a different credits-per-dollar figure (Starter
$14/4,000cr ≈ 286/$1; Plus $34/12,000cr ≈ 353/$1; Pro $56/24,000cr ≈ 429/$1; Wonder
$240/106,000cr ≈ 442/$1 — cheaper credits at higher tiers). The simple average across those
four plans is ≈377/$1; 400/$1 is used here as a round, representative approximation of that
average (per the user's instruction), not an exact per-plan figure. → $0.0025/credit →
₹0.2394/credit at `USD_TO_INR = 95.77`.

| Model | Resolution | Audio | OpenArt credits/s | ≈ ₹/s | ≈ $/s |
|---|---|---|---|---|---|
| Veo 3.1 Lite | 720p | flat (incl. audio) | 20 | ₹4.79 | $0.050 |
| Veo 3.1 Lite | 1080p | flat (incl. audio) | 30 | ₹7.18 | $0.075 |
| Veo 3.1 Fast | 720p | flat (incl. audio) | 35 | ₹8.38 | $0.0875 |
| Veo 3.1 Fast | 1080p | flat (incl. audio) | 40 | ₹9.58 | $0.100 |
| Veo 3.1 Quality | 720p / 1080p (flat) | flat (incl. audio) | 135 | ₹32.32 | $0.3375 |
| Kling 3.0 | 720p | off | 25 | ₹5.99 | $0.0625 |
| Kling 3.0 | 720p | native | 35 | ₹8.38 | $0.0875 |
| Kling 3.0 | 1080p | off | 35 | ₹8.38 | $0.0875 |
| Kling 3.0 | 1080p | native | 40 | ₹9.58 | $0.100 |
| Kling O1 | 720p | off | 20 | ₹4.79 | $0.050 |
| Kling O1 | 1080p | off | 30 | ₹7.18 | $0.075 |

**Two rows flagged, not included above — logged values don't hold together internally:**

- **Kling 3.0, 720p, off:** the 3s/4s/5s/6s readings (75/100/125/150) are a clean 25 credits/s
  — used above — but the 15s reading (350) doesn't fit that rate (25×15 = 375, not 350). Every
  *other* row in this data (including 720p **native**, and both 1080p rows) holds a consistent
  rate all the way to 15s. Could be a real per-tier price break at the top of the duration
  range, or a transcription slip on one cell — flagging rather than silently trusting either
  the 25/s rate or the 350 endpoint.
- **Kling O1, audio:** doesn't reduce to a per-second rate at all. 720p: 5s = 125 credits
  (25/s) but 10s = 175 credits (17.5/s) — and 175 is *less* than the 720p **no-audio** 10s
  price (200), i.e. turning audio on would be cheaper than leaving it off, which isn't
  plausible for a real pricing table. 1080p has the same shape: 5s = 250 (50/s), 10s = 350
  (35/s), no consistent rate. Worth re-checking directly in OpenArt's UI before this goes in
  as a trusted figure — as logged, it reads like a transcription error rather than real
  pricing.

### Benchmark — price comparison, ₹/s (real money, not credits either side)

The one table that actually answers "who's more expensive": both sides converted to rupees,
credits dropped entirely (OpenArt's and CreativeOS's are different units — see above; putting
credit counts side by side would compare units, not prices). CreativeOS's ₹ figure is its raw
vendor pass-through cost (`MARGIN_PERCENT = 0`, §1 — no markup applied today).

| Model | Resolution | Audio | OpenArt ≈ ₹/s | CreativeOS ≈ ₹/s | Cheaper | Ratio (OpenArt ÷ CreativeOS) |
|---|---|---|---|---|---|---|
| Veo 3.1 Lite | 720p | flat | ₹4.79 | ₹4.79 | tie | 1.00× |
| Veo 3.1 Lite | 1080p | flat | ₹7.18 | ₹7.66 | OpenArt | 0.94× |
| Veo 3.1 Fast | 720p | flat | ₹8.38 | ₹9.58 | OpenArt | 0.88× |
| Veo 3.1 Fast | 1080p | flat | ₹9.58 | ₹11.49 | OpenArt | 0.83× |
| Veo 3.1 Quality | 720p / 1080p | flat | ₹32.32 | ₹38.31 | OpenArt | 0.84× |
| Kling 3.0 | 720p | off | ₹5.99 | ₹8.04 | OpenArt | 0.74× |
| Kling 3.0 | 720p | native | ₹8.38 | ₹12.07 | OpenArt | 0.69× |
| Kling 3.0 | 1080p | off | ₹8.38 | ₹10.73 | OpenArt | 0.78× |
| Kling 3.0 | 1080p | native | ₹9.58 | ₹16.09 | OpenArt | 0.60× |
| Kling O1 | 720p | off | ₹4.79 | ₹8.04 | OpenArt | 0.60× |
| Kling O1 | 1080p | off | ₹7.18 | ₹10.73 | OpenArt | 0.67× |

**Every one of the 11 matched rows is OpenArt-at-or-cheaper than CreativeOS's raw vendor
cost** — range 0.60×–1.00×, median ≈0.78×. In plain terms: right now, OpenArt is selling
video generations to its subscribers for close to (Lite 720p: exactly) what CreativeOS itself
pays Google/Kling to produce one — before CreativeOS adds any margin at all. That's only
possible because OpenArt's real revenue is the monthly subscription, not the per-generation
credit; a per-generation credit price alone, compared to a pure pass-through cost, was never
going to look profitable for either platform.

**Correction to an earlier estimate in this doc's history:** a prior pass (same session,
before either round of real data existed) used third-party blog aggregators as a stand-in for
OpenArt's pricing and concluded OpenArt ran ~2–3× over raw vendor cost on video — built on a
stale, unconfirmed Kling 2.1 figure from a review site, not OpenArt's actual rates. The real,
logged numbers say the opposite: OpenArt prices video at or under what CreativeOS pays the
vendor directly in every measured case, most likely subsidized by the subscription/bundle
model rather than margined per generation. Lesson: don't trust third-party pricing
aggregators for a competitor's credit costs when the real number is one logged-in screenshot
away.

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
