# AI model catalog and provider-cost billing — design

Recorded 2026-11-21. Decisions D528–D533 in the ADR log (roadmap §7).

## Goal

Every AI model the app can run, with its parameters, rules, capabilities and prices, lives in
the database instead of TypeScript. A run is charged what the provider charged for it. The super
admin can hide or retire a model and enter a provider's new price from the date it takes effect,
without a deploy. The schema leaves room for per-agency model access, per-model or per-provider
spending limits and a run markup, none of which are built now.

## Decisions

| | Decision |
|---|---|
| Credits | 1,000 credits = $1 of what the provider charged. Fixed. |
| Margin | Stays on the price of credits (plan and top-up margins in `billing_settings`). A run markup (global, per provider or per model, from a date) is added later and is 0% until then. |
| Access | Every agency gets every live model. Per-agency or per-plan access comes later as its own table. |
| Failed runs | The user is refunded. The provider's charge, if any, is still recorded on the generation. |
| Features with no credit charge today | Script writer, KB extraction and website research, image analysis, avatar brief, Copilot, compose, parse, split scene, file extract, Apify imports. Their cost is recorded; no credits are deducted. |
| Phase 1 | Catalog in the database, prices and provider bills drive the estimate and the charge, basic super-admin screens. Adding a model from Admin comes later. |

## What the provider tells us after a run

| Provider | After a run | How it becomes USD |
|---|---|---|
| Gemini, OpenAI, BytePlus (Seedance, Seedream) | tokens or images used | usage × the model's price lines |
| Kling | `billing[].amount`, the units deducted | units × the price per unit |
| ElevenLabs | `character-cost` header (credits); speech to text also sends `fiat-cost-before-overages` in USD | credits × the price per credit; speech to text's `fiat-cost-before-overages` is kept in the bill but not charged |
| Apify | `usageTotalUsd` | read as is |
| fal (Kling on fal, lip sync), Sarvam | nothing | seconds or minutes from the request × the price |

Every case is "a quantity per meter, times a price per meter". Kling units, ElevenLabs credits and
Apify dollars are meters like any other, with the price we pay per unit on the model's price row.

## Tables

Two new tables and new columns on `generations`.

### `ai_models`

One row per model. The id is today's string id, so stored generations and nodes keep resolving.

| Column | Type | Notes |
|---|---|---|
| `id` | text primary key | e.g. `gemini:gemini-omni-1.2-flash` |
| `provider` | text | `gemini`, `openai`, `byteplus`, `kling`, `fal`, `elevenlabs`, `sarvam`, `apify` |
| `kind` | text | `image`, `video`, `edit`, `voice`, `dub`, `lipsync`, `transcribe`, `text`, `scrape` |
| `label`, `picker_label`, `provider_label`, `description` | text | what the UI shows |
| `status` | text | `draft` (admin only), `live`, `hidden` (out of pickers, existing nodes still run), `retired` (cannot run) |
| `replaced_by` | text references `ai_models(id)` | offered when a node's model is retired |
| `sort_order` | integer | order in pickers |
| `adapter_key` | text | the code that calls the provider, e.g. `gemini-interactions-video`, `kling-tasks`, `fal-queue` |
| `provider_model_id` | text | the provider's own name, e.g. `gemini-omni-1.2-flash`, `dreamina-seedance-2-5-260628` |
| `params` | jsonb | today's `ParamSpec[]` |
| `rules` | jsonb | today's `ConstraintRule[]` |
| `capabilities` | jsonb | image inputs, reference limits, size limits, max duration, tokens per second by resolution |
| `created_at`, `updated_at`, `updated_by` | | |

`params`, `rules` and `capabilities` are checked against their TypeScript types (Zod) when the
catalog loads. A row that fails the check is logged and left out of the catalog, never half used.

### `ai_model_prices`

One row per model per start date. A row is never edited. A price change is a new row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid primary key | |
| `model_id` | text references `ai_models(id)` | |
| `effective_from` | timestamptz | the provider's date for this price |
| `lines` | jsonb | the price lines, below |
| `estimate` | jsonb | allowances for the estimate, below |
| `source_url`, `note` | text | where the price came from |
| `created_by`, `created_at` | | |

Unique on `(model_id, effective_from)`. Updates are refused. A row may be deleted only while its
`effective_from` is still in the future (cancelling a scheduled price).

The price for a run is the row with the latest `effective_from` at or before the run's start
(`generations.created_at`).

**Lines.** A list of `{ meter, unit_usd, when? }`:

```json
[
  { "meter": "input_token",        "unit_usd": 0.0000015 },
  { "meter": "video_output_token", "unit_usd": 0.000012 },
  { "meter": "thought_token",      "unit_usd": 0.000009 },
  { "meter": "text_output_token",  "unit_usd": 0.000009 }
]
```

`when` holds request parameters that must all match, e.g. `{ "resolution": "1080p" }` or
`{ "resolution": "720p", "audio": "native" }`. For each meter, the first line whose `when`
matches the run's parameters is used; a line with no `when` matches any run.

**Meters.** `input_token`, `cached_input_token`, `text_output_token`, `thought_token`,
`image_output_token`, `video_output_token`, `output_image`, `input_image`, `video_second`,
`audio_second`, `character`, `provider_unit`, `provider_credit`, `usd`, `request`.

**Estimate.** Quantities the request alone cannot predict, added to the estimate only:
`{ "thought_token": 1500, "input_token_per_image": 1100 }`.

### New columns on `generations`

| Column | Type | Notes |
|---|---|---|
| `model_price_id` | uuid references `ai_model_prices(id)` | the price row used |
| `provider_bill` | jsonb | the bill, below |
| `record_only` | boolean not null default false | true for features that record cost and deduct no credits |

Indexes: `generations (model_price_id)`, and `generations (org_id, record_only, created_at)` for
usage reports. Record-only calls (Copilot, compose, parse) are far more frequent than media
runs; canvas and history queries filter by node and never read them, and every usage report
filters on `record_only`.

`cost_usd` holds what the provider charged us. `credits_charged` holds what the agency was
charged. A record-only row has a `provider_bill` and `cost_usd`, `credits_charged` 0 and no ledger
rows. It may have no node (`node_id` is already nullable).

## The provider bill

Every adapter returns the same shape after a run:

```ts
type ProviderBill = {
  source: "provider_charge" | "provider_usage" | "request";
  meters: Partial<Record<Meter, number>>;   // e.g. { video_output_token: 5793, thought_token: 549 }
  raw: unknown;                             // the provider's own usage or billing block, verbatim
};
```

- `provider_charge`: the provider said what it deducted (Kling, ElevenLabs, Apify).
- `provider_usage`: the provider said what was used (Gemini, OpenAI, BytePlus).
- `request`: the provider said nothing, so the meters come from the request (fal, Sarvam).

## Pricing

One module, used for the estimate and the charge:

```
usd      = Σ over meters: quantity × unit_usd of the matching line
estimate = predicted meters (adapter, from the request) + the price row's estimate allowances
charge   = the provider bill's meters
credits  = ceil_to_5(usd × 1000 × (1 + markup))      markup = 0 until model_markups exists
```

The estimate and the charge read the same price row, so they cannot use different prices.

A bill meter with no matching line is priced at 0, the generation is flagged (`provider_bill.unpriced`),
and the admin models list shows the count. A model whose adapter can report a meter that its
current price row does not price cannot be set live.

## Code

**Adapters stay in code.** An adapter turns checked parameters into the provider's request,
waits for the result, and returns the output plus a `ProviderBill`. It also predicts meters from a
request for the estimate. Adapters register under their `adapter_key`. A model whose
`adapter_key` is not registered in the running build cannot be set live.

**The registries become a seed.** `client-models.ts`, `params/*`, the image and video registries,
`cost.ts` and the other price tables generate the first rows of `ai_models` and
`ai_model_prices` (migration 0076 onward). A test fails if the seed and the registries differ.
Once every caller reads the catalog, the registries and price tables are deleted.

**Loading the catalog.**
- Server: one query reads every model and its current and future prices. It is cached in the
  process for 60 seconds, and an admin change clears the cache in the instance that made it.
- Browser: `GET /api/ai-models`, through `src/services/ai-models.service.ts` and
  `src/hooks/queries/ai-models.ts` (`aiModelKeys.catalog()`), with a 5-minute stale time.
- Nothing is loaded per node or per card. Pickers and focus views select from the cached catalog.

**A run.**
1. The route reads the model from the catalog and refuses a model that is not `live`, or
   `hidden` with an existing node.
2. It checks the request against the model's `params` and `rules`.
3. It finds the price row for now, builds the estimate and reserves it.
4. The adapter runs and returns the output and the bill.
5. Completion prices the bill with the same price row, settles, and stores `model_price_id`,
   `provider_bill`, `cost_usd` and `credits_charged`.
6. On failure the reservation is refunded and any bill the provider returned is stored.

**Record-only features** call the same pricing module after their provider call and insert a
`generations` row with `record_only = true`. They make no reservation.

## Super admin (phase 1)

- **Models**: every model with provider, kind, status, current price, runs and provider cost this
  month, and unpriced runs.
- **A model**: change status, label, sort order and replacement. See its price rows in date order.
  Add a price row: the lines, the estimate allowances, the start date (today or later), the source
  and a note. Cancel a price row that has not started.
- Price rows are their own history (who added each, when, from which source). A model edit
  records who made it and when (`updated_by`, `updated_at`).

## Edge cases

- A node whose model is retired keeps its history and shows "This model was retired. Pick
  another.", with `replaced_by` chosen.
- A price row added for today applies to runs that start after it is saved. A run already
  reserved keeps the row it reserved with.
- Staging and production each keep their own catalog. The seed reaches both through migrations;
  admin changes stay where they are made.
- A run that starts before a price change and finishes after it is charged at the price it
  started with.

## Later (no change to the two tables)

- `model_access`: plan or agency, provider or model, allow or deny.
- `spend_limits`: plan or agency, provider or model, monthly USD. The check before a run reads a
  running total (one row per agency, model and month, updated in the same step as the charge),
  never a sum over `generations`.
- `model_markups`: global, provider or model, percentage, from a date.
- `feature_models`: which model each built-in feature uses.
- Adding a model of an existing provider from Admin (params and rules editor).
- Telling agency owners about a price change.
- One model sold through two providers, with fallback.

## Testing

- Provider responses captured on 2026-11-19 and 2026-11-21 as fixtures: Omni generate, reference
  and edit; Nano Banana 2.1; Kling task billing; ElevenLabs speech-to-speech and speech-to-text
  headers; fal pricing.
- Pricing: each meter, `when` matching, the default line, effective dates, unpriced meters.
- Estimate against charge: the estimate is never below the charge for the fixtures' requests by
  more than one rounding step.
- Seed against registries.
- One mock-mode run per adapter through reserve, complete and settle.
- A record-only call writes a row and no ledger rows.

## Seed values (21 Nov)

- Kling: $0.1508 per unit (`provider_unit`).
- ElevenLabs: Creator plan, $22 for 121,000 credits a month, so $0.000182 per credit
  (`provider_credit`). Checked against a 3-second voice change: 30 credits ≈ $0.11 a minute.
- `veo:*` and `openai:gpt-image-1` are seeded as `retired`. Google shut Veo 3.1 down on 22 Oct and
  OpenAI shut gpt-image-1 down on 23 Oct.
