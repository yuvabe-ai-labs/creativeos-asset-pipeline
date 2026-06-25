# Video-Gen Constraint Rules & Image Source Filtering — Design

**Date:** 2026-06-25

## Context

The video-gen focus view currently has no enforcement of API-level constraints in the form. Users can select duration values that the API will reject (e.g. 4s with end frame), and image-gen nodes are shown as frame input candidates even though the intended flow is to use File nodes for frame images. This causes silent failures after a 3–6 minute generation wait.

Two problems to fix:
1. **No constraint enforcement** — invalid param+image combinations reach the API and fail.
2. **Wrong image sources** — image-gen node outputs appear in the Connected section as frame options; they shouldn't.

---

## Design Goals

- Rules are **JSON-serializable data** — no JavaScript functions in rule definitions. This keeps the system DB-ready: rules can move to a database column later with zero changes to the evaluator.
- Auto-correct silently — when a constraint fires, snap the conflicting param to the valid value and show a small reason; don't ask the user.
- Enforcement happens in the UI, not only at the API.

---

## Section 1 — Constraint Rule Schema

### Types (`src/lib/video-gen/types.ts`)

```typescript
type ConditionField = "referenceCount" | "hasEndFrame" | "hasStartFrame";
type ConditionOp = "gt" | "gte" | "eq";

type LeafCondition = {
  field: ConditionField;
  op: ConditionOp;
  value: number | boolean;
};

type CompoundCondition = {
  op: "and" | "or";
  conditions: Condition[];
};

type Condition = LeafCondition | CompoundCondition;

type ConstraintEffect = {
  lockParams?: Array<{ name: string; value: unknown }>;
  disableFrameInputs?: boolean;  // grey out start frame + end frame roles
  disableRefs?: boolean;         // grey out reference image roles
};

type ConstraintRule = {
  id: string;
  when: Condition;
  effect: ConstraintEffect;
  reason: string;               // shown to user as tooltip or inline note
};

type ConstraintState = {
  params: Record<string, unknown>;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  referenceCount: number;
};

type EvaluatedConstraints = {
  lockedParams: Record<string, unknown>;
  lockedParamReasons: Record<string, string>;
  disableFrameInputs: boolean;
  disableRefs: boolean;
};
```

Add `rules?: ConstraintRule[]` to `VideoGenClientModelSpec`.

---

## Section 2 — Evaluator (`src/lib/video-gen/constraints.ts`)

New file. Two exports:

**`buildConstraintState(imageRoles)`** — derives `ConstraintState` from the current `imageRoles` map:
- `hasStartFrame`: any role === `"start_frame"`
- `hasEndFrame`: any role === `"end_frame"`
- `referenceCount`: count of roles === `"reference"`

**`evaluateConstraints(rules, state)`** — loops all rules, evaluates `when` condition against state, merges all firing effects into one `EvaluatedConstraints` object. Later-defined rules win on `lockParams` conflicts. Pure function, no side effects.

Condition evaluation is recursive: leaf conditions compare `state[field]` with operator; compound conditions reduce with `every` (and) or `some` (or).

---

## Section 3 — Rules per Model

### Veo 3.1 Lite
```
Rule 1: hasEndFrame = true → lock duration = "8"
        reason: "End frame requires 8s duration"
```

### Veo 3.1 Fast & Veo 3.1 Quality (same rules)
```
Rule 1: referenceCount > 0  → lock duration = "8", disableFrameInputs = true
        reason: "Reference images require 8s and can't be combined with start/end frame"

Rule 2: hasStartFrame = true OR hasEndFrame = true → disableRefs = true
        reason: "Start/end frame can't be combined with reference images"

Rule 3: hasEndFrame = true → lock duration = "8"
        reason: "End frame requires 8s duration"
```

### Sora 2
No rules — constraints are already structural (`endFrame: false`, `maxReferenceImages: 0`).

### Data fixes alongside rules
- Veo Lite: duration options `["4","6"]` → `["4","6","8"]` in `veoLiteParams`
- Veo Fast: `maxReferenceImages: 0` → `3` in client-models + provider config

---

## Section 4 — UI Changes

### `VideoGenFocusView`
- On each render: call `buildConstraintState(imageRolesProp)` → call `evaluateConstraints(model.rules, state)` → get `EvaluatedConstraints`
- When `lockedParams` changes (useEffect): auto-call `handleParamChange` for each locked param to snap values silently
- Add `handleReset`: calls `onPatch({ imageRoles: {} })` to clear all role assignments
- Pass `lockedParams`, `lockedParamReasons` → `VideoGenParamsPanel`
- Pass `disableFrameInputs`, `disableRefs`, `onReset` → `VideoGenConnectedSection`

### `VideoGenParamsPanel`
- New props: `lockedParams?: Record<string, unknown>`, `lockedParamReasons?: Record<string, string>`
- When a param name is in `lockedParams`: render the `ParamControl` as `disabled`, show a `Lock` icon (Lucide, 1.5 stroke) next to the label, tooltip on the icon shows the reason string

### `VideoGenConnectedSection`
- New props: `disableFrameInputs: boolean`, `disableRefs: boolean`, `onReset: () => void`
- "Clear all" button at the very top of the section — text style, small, only rendered when at least one role is assigned
- When `disableFrameInputs: true`: start frame and end frame role buttons are `aria-disabled`, visually dimmed, tooltip shows reason
- When `disableRefs: true`: reference role buttons are `aria-disabled`, visually dimmed, tooltip shows reason
- Pass the existing `reason` string from the fired rule as the tooltip (not hardcoded in the component)

---

## Section 5 — Image Source Filtering

Image-gen nodes should not appear as frame input candidates. Only `file` and `draw` nodes are valid image sources for video frames.

### `src/app/api/nodes/[id]/upstream-images/route.ts`
Remove the `image-gen` branch from the node-to-image mapping. Only `file` (with `fileKind === "image"`) and `draw` nodes produce `UpstreamImage` entries.

### `src/app/api/nodes/[id]/video-generate/route.ts`
Remove the `image-gen` branch from the role resolution loop. Only `file` and `draw` nodes contribute `startFrameUrl`, `endFrameUrl`, or `referenceUrls`.

Result: image-gen nodes simply don't appear in the Connected section. No UI change needed — filtering happens at the data layer.

---

## File Map

| File | Action |
|------|--------|
| `src/lib/video-gen/types.ts` | Add `ConstraintRule`, `ConstraintState`, `ConstraintEffect`, `Condition`, `EvaluatedConstraints` |
| `src/lib/video-gen/constraints.ts` | New — `buildConstraintState`, `evaluateConstraints` |
| `src/lib/video-gen/client-models.ts` | Add `rules` per model; fix Fast `maxReferenceImages: 3`; fix Lite duration |
| `src/lib/video-gen/params/veo.ts` | Add `"8"` to `veoLiteParams` duration options |
| `src/components/nodes/video-gen-focus-view.tsx` | Evaluate constraints, auto-apply locked params, add `handleReset`, pass new props |
| `src/components/nodes/video-gen-params-panel.tsx` | Accept `lockedParams` + reasons, render lock state |
| `src/components/nodes/video-gen-connected-section.tsx` | Accept disable flags + `onReset`, add "Clear all" button, grey out disabled roles |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Remove `image-gen` from image source mapping |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Remove `image-gen` from role resolution |

---

## Verification

1. Connect a file node → assign as end frame → duration selector snaps to 8s and shows lock icon with "End frame requires 8s duration"
2. Connect a file node → assign as reference → start/end frame role buttons grey out; duration locks to 8s
3. Switch model to Lite → reference image roles disappear entirely (maxReferenceImages: 0)
4. Click "Clear all" → all role assignments reset, duration unlocks
5. Connect an image-gen node → it does NOT appear in the Connected section
6. `npx tsc --noEmit` passes with zero errors
