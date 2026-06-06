# Script-parse KB context — design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Area:** Script node → `/api/nodes/:id/parse` → KB

## Problem

Script parsing currently runs with **no client context**. Migration `0003_kb_onboarding.sql`
dropped the `clients.context_notes` column, and [`getNodeClientContext`](../../../src/lib/db/nodes.ts)
was reduced to a stub that always returns `{ contextNotes: "" }`. As a result:

- [`compileScript`](../../../src/lib/nodes/script.ts) always receives an empty context string, so the
  user message is just the raw script.
- The [parse prompt](../../../src/prompts/script-parse.ts) still instructs the model to *"Respect the
  client context provided with the script… never introduce medical/claim words the client avoids"* —
  a guardrail with nothing behind it.
- Every parse logs `inputsUsed.clientContext: "none"`.

The brand/compliance context that the prompt wants now lives in the client's **active KB version**
(`client_kb_versions.output`, typed as `TraceableBrandKB`), reachable via
`clients.active_kb_version_id`. This design wires that back in, with **user-selectable slices**.

## Goals

- Inject real brand context into script parsing, sourced from the client's active KB.
- Let the user choose which KB slices are injected, via toggles on the Script node, defaulting to a
  recommended set.
- Keep the prompt and `compileScript` unchanged — they already accept a context string.

## Non-goals

- No changes to KB extraction, the KB node, or `kb_status` gating logic.
- No edge-based resolution (a KB→Script edge exists on seeded canvases but is intentionally not a
  load-bearing dependency).
- No selection UI beyond the Script node (no canvas/client-level setting).

## Key assumption (validated)

A Script node only exists on a canvas whose client has an **active KB**:
[`clients/[id]/page.tsx`](../../../src/app/clients/[id]/page.tsx) redirects to `/kb` unless
`kb_status === "ready"`, and [`createCanvasAction`](../../../src/lib/actions/canvases.ts) seeds the
Script node only alongside an active KB. So `getNodeActiveKB` returns a real KB on the normal path;
a `null` result is treated defensively (yields `""`) but is not normally reachable.

## Scope of injected context

Parsing is **extraction, not generation** — the model transcribes an already-written script. Context
only matters where the model paraphrases (`execution_refinement`, `qc_notes`, `caption`) or must avoid
introducing banned words. So only the brand-voice and compliance slices are relevant; visual identity,
audience, creative direction, and image analysis are excluded.

## Design

### A. Slice model — `src/lib/kb/parse-context.ts` (new, pure)

Single source of truth for *what is selectable* and *how it renders to text*. No I/O.

| Slice key | KB fields pulled | Default |
|---|---|---|
| `compliance` | whole compliance module: `never_use_words`, `never_use_claims`, `never_use_tone`, `preferred_verbs`, `preferred_phrases`, `disclaimers` | on |
| `tone_of_voice` | `brand_profile.tone_of_voice` | on |
| `personality` | `brand_profile.personality` | on |
| `brand_profile` | remaining brand_profile: `brand_name`, `tagline`, `positioning`, `mission`, `industry` | off |

Exports:

- `type KBSliceKey = "compliance" | "tone_of_voice" | "personality" | "brand_profile"`
- `KB_PARSE_SLICES: { key: KBSliceKey; label: string; default: boolean }[]` — the catalog imported by
  both the UI (toggle labels + default-checked state) and the route (allowed-slice validation).
- `DEFAULT_PARSE_SLICES: KBSliceKey[]` — derived from `KB_PARSE_SLICES` where `default === true`.
- `buildParseContext(kb: TraceableBrandKB, slices: KBSliceKey[]): string` — pure function. Reads only
  the selected slices' `KBField.value`s, skips `null`/empty (same filled-check as
  [`fill-rate.ts`](../../../src/lib/kb/fill-rate.ts)), and formats compact labeled lines, e.g.:

  ```
  Tone of voice: warm, conversational
  Personality: premium, educational
  Avoid words: cure, heal, treat, repair
  Avoid claims: clinically proven to cure
  Preferred verbs: helps, supports, nourishes
  Disclaimers: results may vary
  ```

  Returns `""` when no selected field is filled.

### B. Server flow

1. **Persistence:** `ScriptNodeData` (in [`canvas-nodes.ts`](../../../src/lib/canvas-nodes.ts)) gains
   `kbSlices?: KBSliceKey[]`, stored in the node's `data` jsonb. `undefined` ⇒ use
   `DEFAULT_PARSE_SLICES`. Backward compatible with existing seeded nodes (`{ title: "" }`).
2. **Request:** the Script node POSTs `{ source, slices }` to `/api/nodes/:id/parse`. It already holds
   the selection in `data.kbSlices`; sending it in the body avoids an autosave race.
3. **Resolution:** replace the stubbed `getNodeClientContext` with `getNodeActiveKB(nodeId)` in
   [`src/lib/db/nodes.ts`](../../../src/lib/db/nodes.ts), walking
   **node → canvas → client → `active_kb_version_id` → `client_kb_versions.output`** (explicit hops,
   matching the codebase's query style). Returns `TraceableBrandKB | null`.
4. **Compose:** the [route](../../../src/app/api/nodes/[id]/parse/route.ts) validates `slices` against
   `KB_PARSE_SLICES` (drop unknown keys; empty/absent ⇒ `DEFAULT_PARSE_SLICES`), calls
   `buildParseContext(kb, slices)`, and passes the string into the **unchanged**
   [`compileScript`](../../../src/lib/nodes/script.ts).
5. **Logging:** `insertVersion`'s `inputsUsed` records the real
   `{ kbSlices: KBSliceKey[], kbVersionId: string | null }` instead of today's always-`"none"`.

No `kb_status` gate: presence of `active_kb_version_id` already implies an approved KB.

### C. UI — Script node Sheet

In the existing Sheet panel ([`script-node.tsx`](../../../src/components/nodes/script-node.tsx)), just
above the Extract button, a compact **"Brand context"** group:

- One row of toggle chips built from `KB_PARSE_SLICES`.
- Checked state from `data.kbSlices ?? DEFAULT_PARSE_SLICES`; each toggle calls
  `updateNodeData(id, { kbSlices: nextSelection })`.
- `handleParse` sends the current selection as `slices` in the POST body.
- Replace the now-false caption *"uses the client's context notes"* with
  *"Injects selected brand context into extraction."*
- Design-system compliant: Lucide icons (1.5 stroke), neutral chips, purple only for the active state.

## Data flow

```
Script node (data.kbSlices) ──POST { source, slices }──▶ /api/nodes/:id/parse
  route: validate slices ▶ getNodeActiveKB(nodeId)  [node→canvas→client→active KB]
       ▶ buildParseContext(kb, slices) ──string──▶ compileScript(source, ctx)
       ▶ OpenAI parse ▶ insertVersion(inputsUsed:{ kbSlices, kbVersionId }) ▶ setActiveVersion
```

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/lib/kb/parse-context.ts` | slice catalog + pure KB→string rendering | `schema.ts` types only (no I/O) |
| `getNodeActiveKB` (`db/nodes.ts`) | resolve a node's client's active KB | Supabase |
| parse route | validate slices, orchestrate | `getNodeActiveKB`, `parse-context`, `compileScript`, versions |
| Script node UI | toggle selection, persist, send | `KB_PARSE_SLICES`, `updateNodeData` |

`compileScript` and the parse prompt are unchanged.

## Error handling

- No active KB (not normally reachable) → `getNodeActiveKB` returns `null` → context `""`; parse
  proceeds without brand context (current behavior, now the rare exception not the rule).
- Unknown/garbage `slices` in the body → filtered against `KB_PARSE_SLICES`; empty result falls back to
  `DEFAULT_PARSE_SLICES`.
- KB present but all selected fields null/empty → `buildParseContext` returns `""`; prompt guardrail is
  simply inert, no error.

## Testing

- **`buildParseContext` (pure, unit):** each slice renders expected lines; null/empty fields skipped;
  empty selection and all-null KB both return `""`; unknown keys ignored.
- **Slice validation:** unknown keys dropped; empty/absent ⇒ defaults.
- **`getNodeActiveKB`:** resolves the active KB via the join; returns `null` when no active version.
- **Route integration:** body `slices` flow into `inputsUsed`; context string reaches `compileScript`.

## Files touched

- `src/lib/kb/parse-context.ts` — new
- `src/lib/db/nodes.ts` — replace `getNodeClientContext` with `getNodeActiveKB`
- `src/lib/canvas-nodes.ts` — add `kbSlices?` to `ScriptNodeData`
- `src/app/api/nodes/[id]/parse/route.ts` — resolve KB, validate slices, build context, log slices
- `src/components/nodes/script-node.tsx` — toggle UI, send `slices`
