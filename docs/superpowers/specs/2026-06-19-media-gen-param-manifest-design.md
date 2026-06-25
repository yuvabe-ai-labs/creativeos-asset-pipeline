# Media Gen Parameter Manifest — Design Spec

**Date:** 2026-06-19
**Scope:** Image generation + Video generation (Veo 3.1+)
**Status:** Approved — ready for implementation

---

## Problem

The current image gen system defines model parameters as raw Zod schemas — duplicated between `providers/*.ts` (server) and `client-models.ts` (client). There is no metadata for:
- Which parameters appear first vs. in an advanced/collapsed section
- Whether a parameter is visible in the UI at all
- What UI component type to render (dropdown, slider, toggle, etc.)

Adding a new parameter requires four edits (server schema + client schema + UI branching + utils). Video generation is coming and will have fundamentally different params (duration, resolution) — the current hardcoded-branching approach doesn't scale.

---

## Decision: Unified `ParamSpec[]` Manifest (Approach B)

Each model carries a `ParamSpec[]` array instead of a Zod schema. The Zod schema is derived automatically via `buildZodFromParams()`. The `ParamSpec[]` maps 1:1 to a future `media_gen_params` DB table — zero migration work when models move to the database.

**Rejected alternatives:**
- *Parallel manifest object alongside Zod* — still two things to maintain, duplication persists
- *JSON Schema with x- extensions* — diverges from existing Zod-based stack, loses TypeScript type safety

---

## Core Types

```typescript
// src/lib/image-gen/types.ts

type ParamComponent = "select" | "slider" | "toggle" | "number" | "textarea";
type ParamGroup     = "primary" | "advanced";

type ParamConstraints =
  | { type: "select";   options: string[] }
  | { type: "slider";   min: number; max: number; step?: number }
  | { type: "toggle" }
  | { type: "number";   min?: number; max?: number; step?: number }
  | { type: "textarea"; maxLength?: number };

type ParamSpec = {
  name:         string;           // field name in params object — also the DB column name
  label:        string;           // display label in UI
  component:    ParamComponent;   // which control to render
  group:        ParamGroup;       // "primary" = always visible, "advanced" = collapsed accordion
  order:        number;           // sort order within group (lower = first, resets per group)
  visible:      boolean;          // false = sent to API with defaultValue, never shown in UI
  defaultValue: unknown;          // JSON-serializable — DB column default_value (jsonb)
  constraints:  ParamConstraints; // DB column constraints (jsonb)
  description?: string;           // tooltip text
};

type MediaType = "image" | "video";

type MediaGenModelSpec = {
  id:                    string;      // "openai:gpt-image-2" — composite provider:apiModelId key
  provider:              string;
  mediaType:             MediaType;
  label:                 string;
  providerLabel:         string;
  maxReferenceImages:    number;
  maxReferenceSizeBytes: number;
  params:                ParamSpec[];
  generate?: (input: ImageGenInput) => Promise<ImageGenResult>; // server-only, omitted in client
};
```

---

## Schema Builder

```typescript
// src/lib/image-gen/schema-builder.ts
export function buildZodFromParams(params: ParamSpec[]): z.ZodObject<z.ZodRawShape>
```

Derives a Zod validation schema from the `ParamSpec[]`. Called once at registry registration time on the server, and on-demand in the client where needed. Replaces all hand-written `z.object(...)` schemas.

---

## Model Specs

### Ordering convention
- `order` resets to 0 within each group — `primary` and `advanced` are sorted independently
- Lower `order` = appears first in that section
- `visible: false` params are still sent to the API with their `defaultValue` — they exist for API correctness, not UI display

### GPT Image 2 (reference example)

| name | label | component | group | order | visible | defaultValue |
|---|---|---|---|---|---|---|
| size | Size | select | primary | 0 | true | "auto" |
| quality | Quality | select | primary | 1 | true | "auto" |
| background | Background | select | advanced | 0 | true | "auto" |
| output_format | Output format | select | advanced | 1 | true | "png" |
| output_compression | Compression | slider | advanced | 2 | false | 80 |

### Gemini Flash Image

| name | label | component | group | order | visible | defaultValue |
|---|---|---|---|---|---|---|
| aspect_ratio | Aspect ratio | select | primary | 0 | true | "1:1" |
| image_size | Resolution | select | primary | 1 | true | "1K" |
| safety_filter_level | Safety filter | select | advanced | 0 | true | "block_some" |
| person_generation | Person generation | select | advanced | 1 | true | "allow_adult" |

### Veo 3.1 (video — pattern)

| name | label | component | group | order | visible | defaultValue |
|---|---|---|---|---|---|---|
| aspect_ratio | Aspect ratio | select | primary | 0 | true | "16:9" |
| duration_seconds | Duration | select | primary | 1 | true | "8" |
| resolution | Resolution | select | primary | 2 | true | "720p" |
| person_generation | People | select | advanced | 0 | true | "allow_adult" |

---

## UI Architecture

`image-gen-output-settings.tsx` replaces manual `if (model.provider === "openai")` branching with a generic renderer:

```
model.params
  ├── filter(group === "primary"  && visible) → sorted by order → renders inline
  └── filter(group === "advanced" && visible) → sorted by order → renders in Accordion
```

Each param renders via a `ParamControl` dispatcher component that switches on `spec.component`:

```
ParamControl
  ├── "select"   → SelectControl   (enum dropdown)
  ├── "slider"   → SliderControl   (shadcn Slider + value label)
  ├── "toggle"   → ToggleControl   (shadcn Switch)
  ├── "number"   → NumberControl   (number input with optional min/max)
  └── "textarea" → TextareaControl (textarea with optional maxLength)
```

Icons (`PARAM_ICONS` map) live in the output-settings component, not in `ParamSpec`. The param spec carries data concerns; the component carries presentation concerns.

---

## Client / Server Split

| Layer | What it has |
|---|---|
| Server (`providers/*.ts`, `registry.ts`) | `ParamSpec[]` + `generate()` function + derived Zod schema |
| Client (`client-models.ts`) | `ParamSpec[]` only (re-exported from providers) — no `generate()`, no Zod |

`client-models.ts` becomes a thin re-export file. No more duplicate schema maintenance.

`defaultsForModel(model)` replaces `defaultsForSchema(schema)` — reads `param.defaultValue` directly instead of introspecting Zod internals.

`enumOptions()` in `utils.ts` replaces Zod `_def` introspection with a direct `params.find(p => p.name === field)?.constraints.options` lookup.

---

## Files Changed

**Modified:**
- `src/lib/image-gen/types.ts` — add `ParamSpec`, `ParamConstraints`, `MediaGenModelSpec`, `MediaType`
- `src/lib/image-gen/providers/openai.ts` — replace Zod schemas with `ParamSpec[]`
- `src/lib/image-gen/providers/gemini.ts` — same
- `src/lib/image-gen/client-models.ts` — thin re-export, remove Zod duplication
- `src/lib/image-gen/registry.ts` — derive schema via `buildZodFromParams()`
- `src/lib/image-gen/utils.ts` — replace `enumOptions()` introspection
- `src/components/nodes/image-gen-output-settings.tsx` — generic renderer

**New:**
- `src/lib/image-gen/schema-builder.ts`
- `src/components/nodes/param-controls/select-control.tsx`
- `src/components/nodes/param-controls/slider-control.tsx`
- `src/components/nodes/param-controls/toggle-control.tsx`
- `src/components/nodes/param-controls/number-control.tsx`
- `src/components/nodes/param-controls/textarea-control.tsx`
- `src/components/nodes/param-controls/index.tsx`

**Unchanged:**
- `src/lib/image-gen/cost.ts` — uses model ID strings only
- `src/app/api/nodes/[id]/image-generate/route.ts` — reads `params: Record<string, unknown>`
- `src/components/nodes/image-gen-param-row.tsx` — stays as row wrapper

---

## Future: DB Migration

When models move to Supabase, create two tables:

```sql
create table media_gen_models (
  id text primary key,
  provider text not null, media_type text not null,
  label text not null, provider_label text not null,
  max_reference_images int not null default 0,
  max_reference_size_bytes bigint,
  is_default boolean default false, is_active boolean default true,
  display_order int, created_at timestamptz default now()
);

create table media_gen_params (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references media_gen_models(id),
  name text not null, label text not null, component text not null,
  display_group text not null, display_order int not null,
  visible boolean not null default true,
  default_value jsonb, constraints jsonb not null, description text,
  unique(model_id, name)
);
```

Migration = `INSERT INTO ...` from the in-code `ParamSpec[]` arrays. The registry loader function changes from reading a module import to a Supabase query. All consumer code stays identical.

---

## Future: Credit System

Add to `MediaGenModelSpec`:
```typescript
creditBaseCost?: number;  // base credits per generation
```

Add to `ParamSpec`:
```typescript
creditMultiplier?: Record<string, number>;  // { "low": 0.5, "high": 2.0 }
```

Formula: `credits = model.creditBaseCost * (param.creditMultiplier[selectedValue] ?? 1.0)`

The `constraints.options` array already carries the key set for the multiplier map.

---

## Verification

1. `npx tsc --noEmit` — zero type errors
2. Image gen focus view opens → model selector works → params render in correct group/order
3. Advanced accordion collapses and expands
4. Switch between OpenAI ↔ Gemini models → params update, no stale state
5. Generate an image → check network tab that all params (including `visible: false` ones) are sent
6. Check `node_versions.params_used` in Supabase → all param values present
