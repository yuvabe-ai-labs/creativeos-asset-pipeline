# Bug Fixes & UX Improvements — Design Spec

**Date**: 2026-07-06
**Status**: Approved

---

## Overview

Nine issues found during active use of the canvas. Three are critical bugs that break
workflows (duplicate node, usage popover data, KB analysis). Six are UX improvements
(skeleton, upload indicator, unified aspect ratio, shot type, smart param reset, canvas
cost). All are addressed in this spec.

---

## 1. Script Extraction Skeleton

**Problem:** The card-level skeleton during script parsing (4 inline bars, `script-node.tsx`
lines 73-80) doesn't match the real card layout — gives no visual continuity.

**Fix:** Replace inline bars with a shimmer skeleton that mirrors the actual script card
structure:
- One wider bar for the title area
- Two narrower bars for content lines
- Widths and spacing match the rendered card dimensions
- Same `animate-pulse` pattern used elsewhere in the codebase

**Files:** `src/components/nodes/script-node.tsx`

The full `ScriptSkeleton` in the focus view is unchanged.

---

## 2. File Node Upload Loading Indicator

**Problem:** No loading state exists on the canvas node card while a file is being
uploaded or extracted. All loading UI is hidden inside the focus view modal.

**Fix:** Propagate an `isUploading` boolean from `FileFocusView` up to `FileNode` via a
new `onUploadingChange` callback prop. When `isUploading` is true:
- Show a thin animated spinner ring overlaying the file icon area on the card
- Use `animate-spin` on a ring div, same pattern as other loading indicators
- Clear when upload completes or fails

**Files:**
- `src/components/nodes/file-node.tsx` — add `isUploading` display
- `src/components/nodes/file-focus-view.tsx` — call `onUploadingChange` around upload

---

## 3. Usage Popover — Data Bug + Shared Component

### 3a — Data Bug

**Problem:** After an image is edited, some `node_versions` rows have
`paramsUsed.tokensUsed` as null. The usage popover skips those with early `return`
statements (image-gen-usage-popover.tsx lines 50, 53), making `counted === 0` → shows
"No usage data yet" even when versions exist.

**Fix:**
- Remove early returns for missing token data — treat missing `tokensUsed` as zero cost
- Render those versions in the list with `—` for cost instead of hiding them
- Check if edit versions store tokens in a different field shape in the DB and normalise
  before the `useMemo` calculation

**Files:** `src/components/nodes/image-gen-usage-popover.tsx`

### 3b — Shared UI Component

**Problem:** `image-gen-usage-popover.tsx` and `prompt-usage-popover.tsx` have near-identical
UI (receipt icon trigger, per-generation list, total row, "No usage data" empty state).

**Fix:** Extract a shared `UsagePopoverShell` component:

```typescript
type UsageRow = {
  label: string;       // e.g. "v1", "v2"
  tokens?: string;     // formatted token count, omitted for video
  cost: string;        // formatted cost string, "—" if unknown
}

function UsagePopoverShell({
  rows,
  total,
}: {
  rows: UsageRow[];
  total: string;
})
```

Both existing popovers keep their own cost calculation logic and pass computed rows to
the shell. Video gen popover also migrates to this shell.

**New file:** `src/components/nodes/usage-popover-shell.tsx`
**Files updated:** `src/components/nodes/image-gen-usage-popover.tsx`,
`src/components/nodes/prompt-usage-popover.tsx`,
`src/components/nodes/video-gen-usage-popover.tsx`

---

## 4. Duplicate Node with Versions

**Problem:** `duplicateNode` in `canvas-store.ts` (line 175) does a shallow copy of the
node object. The new node gets no DB record, no `active_version_id`, and no version
history — it cannot be used.

**Fix:** Replace client-side shallow copy with a server-side duplicate endpoint.

### New endpoint: `POST /api/nodes/[id]/duplicate`

1. Fetch source node from DB (`nodes` table)
2. Fetch source node's active `node_versions` row
3. `INSERT` new `nodes` row — same `canvas_id`, `type`, `data`; position offset +32/+32
4. `INSERT` new `node_versions` row pointing to new node, copying `inputs_used`,
   `params_used`, `model_used`, `output`, `generated_output` from active version
5. `UPDATE` new node's `active_version_id` to the new version row
6. Return the new node record

### Client-side

`duplicateNode` in `canvas-store.ts` becomes async — calls the endpoint, then adds the
returned node to canvas state. The existing right-click context menu flow is unchanged;
only the store action changes.

**Files:**
- `src/app/api/nodes/[id]/duplicate/route.ts` — new
- `src/lib/canvas-store.ts` — make `duplicateNode` async, call endpoint

---

## 5. Shot Type Field

**Problem:** No `shot_type` field exists on the shot node. Users want a structured
classification alongside the free-text description.

**Fix:**

### Data

Add to `ShotNodeData` in `src/lib/canvas-nodes.ts`:
```typescript
shot_type?: string;
```

### Constants

New file `src/lib/nodes/shot-types.ts`:
```typescript
export const SHOT_TYPES = [
  "Wide Shot", "Medium Shot", "Close-Up", "Extreme Close-Up",
  "Over the Shoulder", "POV", "Two Shot", "Aerial", "Dutch Angle",
] as const;
```

### Auto-derive default

`deriveShotType(shotText: string): string | undefined` — keyword matching similar to
`deriveShotControlDefaults`. Maps "wide" → "Wide Shot", "close" → "Close-Up", etc.
Called when a shot node is first created from a script.

### UI

- **Card:** Small read-only chip below the shot text showing the current shot type (if set)
- **Focus view:** Full select dropdown using `SHOT_TYPES`, auto-populated on creation,
  editable by user, patches `shot_type` on change

**Files:**
- `src/lib/canvas-nodes.ts` — add `shot_type` to `ShotNodeData`
- `src/lib/nodes/shot-types.ts` — new constants + derive function
- `src/components/nodes/shot-node.tsx` — chip display
- `src/components/nodes/shot-focus-view.tsx` — select control

---

## 6. Unified Aspect Ratio Control

**Problem:** OpenAI uses a `size` param with pixel dimensions (`1024x1024`, `1536x1024`,
`1024x1536`). Gemini uses an `aspect_ratio` param with ratio strings (`1:1`, `16:9`,
etc.). Users see inconsistent UI per model.

**Fix:** Use Gemini's aspect ratio set uniformly across all models. Translate internally
before the provider API call.

### Unified param definition

Remove `size` from OpenAI param specs in `src/lib/image-gen/params/openai.ts`. Add
`aspect_ratio` with Gemini's full option set:
```typescript
{
  name: "aspect_ratio",
  options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"],
  defaultValue: "1:1",
  group: "primary",
}
```

### Translation layer

New function `aspectRatioToOpenAISize(ratio: string): string` in
`src/lib/image-gen/providers/openai.ts`:

| Aspect Ratio | OpenAI Size |
|---|---|
| `1:1` | `1024x1024` |
| `16:9` | `1536x1024` |
| `9:16` | `1024x1536` |
| `4:3` | `1536x1024` (nearest) |
| `3:4` | `1024x1536` (nearest) |
| `21:9` | `1536x1024` (nearest wide) |
| `4:1` | `1536x1024` (nearest wide) |
| `1:4` | `1024x1536` (nearest tall) |

Called inside the OpenAI provider before constructing the API request. The `aspect_ratio`
value from node params is translated to `size` only at the provider boundary — never
stored as a pixel string.

### Migration

Existing nodes that have `params.size` set to a pixel value: on load, if `size` is
present and `aspect_ratio` is absent, derive `aspect_ratio` from the size value via a
reverse map and write it back via `onPatch`. This is a one-time migration per node on
focus view open.

**Files:**
- `src/lib/image-gen/params/openai.ts` — replace `size` with `aspect_ratio`
- `src/lib/image-gen/providers/openai.ts` — add `aspectRatioToOpenAISize` translation
- `src/components/nodes/image-gen-focus-view.tsx` — add migration on open

---

## 7. KB Documents >1MB — Fail Fast

**Problem:** Files >1MB upload successfully but fail silently during AI extraction
because OpenAI's `input_file` API rejects them. The user sees a generic error or nothing.

**Fix:** Two guards, fail as early as possible.

### Guard 1 — Upload API

In `src/app/api/clients/[id]/kb/documents/route.ts`, before the cumulative size check:

```typescript
const KB_DOC_PER_FILE_LIMIT = 1 * 1024 * 1024; // 1 MB

if (file.size > KB_DOC_PER_FILE_LIMIT) {
  return apiError(
    400,
    "Document is too large for AI analysis (max 1 MB per file). Please split or compress it."
  );
}
```

### Guard 2 — Extraction provider

In `src/lib/kb/providers/openai.ts`, before sending each binary document to OpenAI:

```typescript
if (doc.size > KB_DOC_PER_FILE_LIMIT) {
  skipped.push({ filename: doc.filename, reason: "exceeds 1 MB per-file limit" });
  continue;
}
```

Return `skipped` from the provider. The KB build task includes skipped files in its
completion payload so the user knows which documents were excluded.

### Constants

Add to `src/lib/kb/constants.ts`:
```typescript
export const KB_DOC_PER_FILE_LIMIT_BYTES = 1 * 1024 * 1024;
```

**Files:**
- `src/lib/kb/constants.ts`
- `src/app/api/clients/[id]/kb/documents/route.ts`
- `src/lib/kb/providers/openai.ts`
- `src/trigger/kb-build.ts` — surface skipped files in completion payload

---

## 8. Canvas & Node Cost Display

### 8a — Wire Prompts into the Generations Pipeline

**Problem:** Prompt generations bypass the `generations` table entirely. No
`credits_consumed` is recorded, and prompts don't appear in the generation tray.

**Fix:** Make `POST /api/nodes/[id]/generate` follow the same pattern as image generation:

1. `insertGeneration({ type: "prompt", status: "running", node_id, model_used, params_snapshot, inputs_snapshot })`
2. Run the OpenAI call (still synchronous — no async path needed)
3. On success: call `succeedGeneration({ creditsConsumed: computeCost(model, tokenUsage).usd, tokens_used: tokenUsage, version_id })`
4. On failure: call `failGeneration({ error: message })`

The generation tray's skip-prompt guard in `src/lib/generation-tray.ts` (line 71) is
removed. Prompt tray items show with label "Prompt" and assetType extended to include
`"prompt"`. Since prompts are synchronous and fast, they typically appear in the tray
already succeeded — no spinner needed, but failure states will be visible.

**Files:**
- `src/app/api/nodes/[id]/generate/route.ts`
- `src/lib/generation-tray.ts` — remove skip guard, add prompt label
- `src/components/canvas/generation-tray-item.tsx` — handle `"prompt"` asset type

### 8b — Node-Level Cost Badge

Each image-gen, prompt, and video-gen node card shows a small cost badge:
- Position: bottom-right corner of the node card
- Content: `₹X.XX` — sum of `credits_consumed` across all `generations` rows for that node
- Fetched on node mount via `GET /api/nodes/[id]/cost` (returns `{ totalUsd: number, totalInr: number }`)
- Updated in real-time: the existing Supabase Realtime subscription on `generations`
  already fires on `UPDATE` — extend the handler to refresh node cost when a generation
  for this node completes

**New endpoint:** `GET /api/nodes/[id]/cost`
```sql
SELECT COALESCE(SUM(credits_consumed), 0) as total_usd
FROM generations
WHERE node_id = $1 AND status = 'succeeded'
```

**Files:**
- `src/app/api/nodes/[id]/cost/route.ts` — new
- `src/components/nodes/image-gen-node.tsx`
- `src/components/nodes/prompt-node.tsx`
- `src/components/nodes/video-gen-node.tsx`

### 8c — Canvas-Level Cost Chip

A cost chip in the canvas toolbar showing total spend for the current canvas session.

- Position: canvas top toolbar, right of existing controls
- Content: `₹X.XX total` — sum across all generations for all nodes on this canvas
- Fetched on canvas load via `GET /api/canvas/[id]/cost`
- Updated via Supabase Realtime: when any generation on any node of this canvas
  completes, re-fetch the total

**New endpoint:** `GET /api/canvas/[id]/cost`
```sql
SELECT COALESCE(SUM(g.credits_consumed), 0) as total_usd
FROM generations g
JOIN nodes n ON n.id = g.node_id
WHERE n.canvas_id = $1 AND g.status = 'succeeded'
```

**Files:**
- `src/app/api/canvas/[id]/cost/route.ts` — new
- The canvas top bar component (confirm exact file during implementation — look under `src/components/canvas/`)

---

## 9. Smart Param Reset on Model Switch

**Problem:** Switching models in `image-gen-focus-view.tsx` (line 225) unconditionally
calls `setParamValues(defaultsForModel(model))`, discarding all user-set params.

**Fix:** Replace the unconditional reset with a smart merge function.

### `smartMergeParams`

New utility in `src/lib/image-gen/params/merge.ts`:

```typescript
export function smartMergeParams(
  currentParams: Record<string, unknown>,
  newModel: ClientModelSpec,
): Record<string, unknown> {
  const newDefaults = defaultsForModel(newModel);
  const result: Record<string, unknown> = {};

  for (const param of newModel.params) {
    const current = currentParams[param.name];

    if (current === undefined) {
      // param didn't exist before — use default
      result[param.name] = newDefaults[param.name];
      continue;
    }

    if (param.options) {
      // select param — keep if value is valid in new model
      result[param.name] = param.options.includes(current as string)
        ? current
        : newDefaults[param.name];
    } else if (param.slider) {
      // slider param — keep if within new model's range
      const val = current as number;
      result[param.name] =
        val >= param.slider.min && val <= param.slider.max
          ? val
          : newDefaults[param.name];
    } else {
      result[param.name] = newDefaults[param.name];
    }
  }

  return result;
}
```

### Usage

In `image-gen-focus-view.tsx`, the `useEffect` at line 221:

```typescript
// Before
const defaults = defaultsForModel(model);
setParamValues(defaults);
onPatch({ params: defaults });

// After
const merged = smartMergeParams(paramValues, model);
setParamValues(merged);
onPatch({ params: merged });
```

**Files:**
- `src/lib/image-gen/params/merge.ts` — new
- `src/components/nodes/image-gen-focus-view.tsx` — use `smartMergeParams`

---

## Implementation Order

Fix critical bugs first, then UX improvements:

| Priority | Issue | Risk |
|---|---|---|
| 1 | Issue 7 — KB per-file size guard | Low — additive validation |
| 2 | Issue 4 — Server-side duplicate node | Medium — new endpoint + async store action |
| 3 | Issue 3a — Usage popover data bug | Low — calculation fix |
| 4 | Issue 9 — Smart param reset | Low — isolated utility |
| 5 | Issue 8a — Wire prompts to generations | Medium — touches generation pipeline |
| 6 | Issue 6 — Unified aspect ratio | Medium — param rename + translation layer + migration |
| 7 | Issue 3b — Shared usage popover shell | Low — UI refactor only |
| 8 | Issue 8b/8c — Node + canvas cost display | Medium — new endpoints + realtime wiring |
| 9 | Issue 1 — Script skeleton | Low — UI only |
| 10 | Issue 2 — File upload indicator | Low — prop threading |
| 11 | Issue 5 — Shot type field | Low — additive data + UI |
