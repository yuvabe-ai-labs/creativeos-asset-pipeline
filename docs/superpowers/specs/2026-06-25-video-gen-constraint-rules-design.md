# Video-Gen Constraint Rules & Image Source Filtering — Design

**Date:** 2026-06-25  
**Status:** Implemented

## Context

The video-gen focus view had no enforcement of API-level constraints. Users could select duration values that the API rejects (e.g. 4s with end frame), select an end frame without a start frame, or have image-gen node outputs appear as frame input candidates. This caused silent failures after a 3–6 minute generation wait.

Problems solved:
1. **No constraint enforcement** — invalid param+image combos reached the API and failed.
2. **No generate-level guard** — end frame without start frame was allowed by the UI but rejected by the API.
3. **Wrong image sources** — image-gen node outputs appeared in the Connected section via grandparent traversal; direct image-gen parents are valid, grandparent inheritance is not.
4. **No defaults** — newly connected images had no role assigned, requiring manual setup every time.

---

## Constraint Rule Schema (`src/lib/video-gen/types.ts`)

```typescript
type ConditionField = "referenceCount" | "hasEndFrame" | "hasStartFrame";
type ConditionOp = "gt" | "gte" | "eq";

type LeafCondition = { field: ConditionField; op: ConditionOp; value: number | boolean };
type CompoundCondition = { op: "and" | "or"; conditions: Condition[] };
type Condition = LeafCondition | CompoundCondition;

type ConstraintEffect = {
  lockParams?: Array<{ name: string; value: unknown }>;
  disableFrameInputs?: boolean;   // grey out Start/End role buttons
  disableRefs?: boolean;          // grey out Ref role buttons
  disableGenerate?: boolean;      // disable the Generate button
};

type ConstraintRule = {
  id: string;
  when: Condition;
  effect: ConstraintEffect;
  reason: string;                 // shown in tooltip / toast
};

type EvaluatedConstraints = {
  lockedParams: Record<string, unknown>;
  lockedParamReasons: Record<string, string>;
  disableFrameInputs: boolean;
  disableFrameInputsReason?: string;
  disableRefs: boolean;
  disableRefsReason?: string;
  disableGenerate: boolean;
  disableGenerateReason?: string;
};
```

Rules are plain JSON — no functions. DB-ready: the `rules` array can move to a database column later with zero changes to the evaluator.

---

## Evaluator (`src/lib/video-gen/constraints.ts`)

**`buildConstraintState(imageRoles, params)`** — derives `ConstraintState` from the current `imageRoles` map.

**`evaluateConstraints(rules, state)`** — pure function. Loops rules, evaluates `when` condition recursively, merges all firing effects into one `EvaluatedConstraints`. First-rule-wins on `disableFrameInputs`/`disableRefs`/`disableGenerate`; last-rule-wins on `lockParams` conflicts (later rules override earlier ones for the same param name).

---

## Rules per Model (`src/lib/video-gen/client-models.ts`)

### Veo 3.1 Lite
```
Rule 1: hasEndFrame = true
        → lock duration = "8"
        reason: "End frame requires 8s duration"

Rule 2: hasEndFrame = true AND hasStartFrame = false
        → disableGenerate = true
        reason: "End frame requires a start frame"
```

### Veo 3.1 Fast & Veo 3.1 Quality (same rules)
```
Rule 1: referenceCount > 0
        → lock duration = "8", disableFrameInputs = true
        reason: "Reference images require 8s and can't be combined with start/end frame"

Rule 2: hasStartFrame = true OR hasEndFrame = true
        → disableRefs = true
        reason: "Start/end frame can't be combined with reference images"

Rule 3: hasEndFrame = true
        → lock duration = "8"
        reason: "End frame requires 8s duration"

Rule 4: hasEndFrame = true AND hasStartFrame = false
        → disableGenerate = true
        reason: "End frame requires a start frame"
```

### Sora 2
No rules — constraints are structural (`endFrame: false`, `maxReferenceImages: 0`).

---

## UI Behaviour

### `VideoGenFocusView`
- Derives `constraintState` + `constraints` on every render (pure, no cost).
- `effectiveParams = { ...params, ...constraints.lockedParams }` — locked values merged at call time, not stored in state. Passed to `startGeneration` so the API always receives the correct locked value.
- Toast fires when `constraints.lockedParams` content changes (string-keyed effect, stable dep array). Shows `"<param> set to <value> · <reason>"` on lock, `"<param> unlocked"` on release.
- `handleRoleChange` toggles: clicking the active role removes the assignment.
- `handleReset()` calls `onPatch({ imageRoles: {} })`.
- On sheet open (after image fetch): `applyDefaultImageRoles` auto-assigns any unassigned images — all → `reference` if the model supports it, else first → `start_frame` / second → `end_frame`.
- On model change: after removing invalid roles, `applyDefaultImageRoles` fills in defaults for the new model's capabilities.
- Generate button: `disabled={isGenerating || constraints.disableGenerate}`, wrapped in `<Tooltip>` showing `disableGenerateReason` when disabled.
- Mock toggle (localStorage-persisted): amber toggle in header lets devs switch between mock and real API without env var changes. State sent as `mock: boolean` in the generate payload.

### `VideoGenParamsPanel`
- When `spec.name in lockedParams` and `spec.constraints.type === "select"`: renders the select with all options present but non-locked options have `disabled` attribute. Hover tooltip shows the reason (Google AI Studio pattern — user sees the value in context).
- Non-locked params use `ParamControl` as normal.

### `VideoGenConnectedSection`
- "Clear all" button (top-right, `RotateCcw` icon) shown when at least one role is assigned and `onReset` is provided.
- Role buttons only wrapped in `<Tooltip>` when a tooltip string exists — avoids auto-triggering on buttons with no reason.
- Constraint-based disabling takes priority over structural capability checks in `getRoleTooltip`.

---

## Image Source Filtering

**Direct parent image-gen nodes are valid.** Grandparent image-gen nodes (arriving through the video-prompt 2-level traversal) are excluded. This covers the real-world pattern:

- `image-gen → video-gen` (direct): ✅ appears in Connected section, URL from `activeOutput`
- `image-gen → video-prompt → video-gen` (grandparent): ❌ excluded
- `file/draw → video-gen` or `file/draw → video-prompt → video-gen`: ✅ always included

Both `upstream-images/route.ts` and `video-generate/route.ts` track `directIds` and apply this rule.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/video-gen/types.ts` | Added full constraint type system; `disableGenerate` + `disableGenerateReason` in `EvaluatedConstraints` |
| `src/lib/video-gen/constraints.ts` | New — `buildConstraintState`, `evaluateConstraints` |
| `src/lib/video-gen/client-models.ts` | Rules per model; Fast `maxReferenceImages: 3`; `end-frame-requires-start-frame` rule in Lite + Refs |
| `src/lib/video-gen/params/veo.ts` | `veoLiteParams` = `veoParams` (duration `["4","6","8"]`) |
| `src/lib/video-gen/providers/veo.ts` | `veoLite.maxDurationSeconds: 8`; `veoFast` uses `VEO_REFS_IMAGE_INPUTS` + `veoParams` + `maxRefs: 3` |
| `src/components/nodes/video-gen-focus-view.tsx` | Constraint evaluation; `effectiveParams`; toasts; toggle-deselect; defaults; mock toggle; Generate button disabled guard |
| `src/components/nodes/video-gen-params-panel.tsx` | Locked select (disabled options + hover tooltip) |
| `src/components/nodes/video-gen-connected-section.tsx` | "Clear all"; constraint-based role disabling; tooltip only when reason exists |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | image-gen allowed for direct parents only (`directIds` set) |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Same; Zod body validation; image-gen direct-only |
| `src/hooks/use-video-gen-status.ts` | Added `.limit(1)` before `.maybeSingle()` (PGRST116 fix) |
