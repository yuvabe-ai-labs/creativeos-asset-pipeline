# Video-Gen Constraint Rules & Image Source Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JSON-serializable constraint rule system to video-gen model configs that auto-corrects invalid param+image combinations in the UI, plus filter image-gen nodes out of the Connected section so only File/Draw nodes can be used as frame inputs.

**Architecture:** Each model config carries a `rules` array of declarative JSON objects (no functions — DB-ready). A pure `evaluateConstraints(rules, state)` function merges firing rule effects into locked params and disabled image mode flags. The focus view calls this per render, auto-snaps locked params, and threads disable flags down to the params panel and connected section.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind v4, Lucide icons, Base UI Tooltip pattern

---

## File Map

| File | Action |
|------|--------|
| `src/lib/video-gen/types.ts` | Add `Condition`, `ConstraintEffect`, `ConstraintRule`, `ConstraintState`, `EvaluatedConstraints` types; add `rules?` to `VideoGenModelSpec` |
| `src/lib/video-gen/constraints.ts` | **New** — `buildConstraintState`, `evaluateCondition`, `evaluateConstraints` |
| `src/lib/video-gen/params/veo.ts` | Fix `veoLiteParams` duration to include `"8"` |
| `src/lib/video-gen/client-models.ts` | Add `rules` per model; fix Fast `maxReferenceImages: 3` and params |
| `src/lib/video-gen/providers/veo.ts` | Fix `veoFast` — `maxReferenceImages: 3`, `generate` arg `0 → 3`, use `veoParams` |
| `src/components/nodes/video-gen-params-panel.tsx` | Accept `lockedParams` + `lockedParamReasons`; show lock icon + read-only value |
| `src/components/nodes/video-gen-connected-section.tsx` | Accept `disableFrameInputs`, `disableRefs`, reasons, `onReset`; add "Clear all" button |
| `src/components/nodes/video-gen-focus-view.tsx` | Evaluate constraints, auto-apply locked params, add `handleReset`, pass new props |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Remove `image-gen` from image source filter |
| `src/app/api/nodes/[id]/video-generate/route.ts` | Remove `image-gen` from role resolution loop |

---

## Task 1 — Add constraint types to `types.ts`

**Files:**
- Modify: `src/lib/video-gen/types.ts`

- [ ] **Step 1: Add the types**

Open `src/lib/video-gen/types.ts`. The file currently ends at line 35 (`export type VideoGenClientModelSpec = Omit<VideoGenModelSpec, "generate">`). Add the following types and extend `VideoGenModelSpec`:

```typescript
import type { ParamSpec } from "@/lib/image-gen/types";

export type { ParamSpec };

export type ImageInputCapabilities = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number; // 0 = none supported
};

export type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
};

// ── Constraint rule system (JSON-serializable, DB-ready) ──────────────────────

export type ConditionField = "referenceCount" | "hasEndFrame" | "hasStartFrame";
export type ConditionOp = "gt" | "gte" | "eq";

export type LeafCondition = {
  field: ConditionField;
  op: ConditionOp;
  value: number | boolean;
};

export type CompoundCondition = {
  op: "and" | "or";
  conditions: Condition[];
};

export type Condition = LeafCondition | CompoundCondition;

export type ConstraintEffect = {
  lockParams?: Array<{ name: string; value: unknown }>;
  disableFrameInputs?: boolean;
  disableRefs?: boolean;
};

export type ConstraintRule = {
  id: string;
  when: Condition;
  effect: ConstraintEffect;
  reason: string;
};

export type ConstraintState = {
  params: Record<string, unknown>;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  referenceCount: number;
};

export type EvaluatedConstraints = {
  lockedParams: Record<string, unknown>;
  lockedParamReasons: Record<string, string>;
  disableFrameInputs: boolean;
  disableFrameInputsReason?: string;
  disableRefs: boolean;
  disableRefsReason?: string;
};

// ── Model specs ───────────────────────────────────────────────────────────────

export type VideoGenModelSpec = {
  id: string;
  provider: "veo" | "openai";
  label: string;
  providerLabel: string;
  maxDurationSeconds: number;
  imageInputs: ImageInputCapabilities;
  params: ParamSpec[];
  rules?: ConstraintRule[];
  generate: (input: VideoGenInput) => Promise<VideoGenResult>;
};

export type VideoGenClientModelSpec = Omit<VideoGenModelSpec, "generate">;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd e:\CreativeOS\creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors on `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/types.ts
git commit -m "feat(video-gen): add constraint rule types"
```

---

## Task 2 — Create `constraints.ts` evaluator

**Files:**
- Create: `src/lib/video-gen/constraints.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/video-gen/constraints.ts
import type {
  Condition,
  ConstraintRule,
  ConstraintState,
  EvaluatedConstraints,
} from "./types";

type ImageRole = "start_frame" | "end_frame" | "reference";

export function buildConstraintState(
  imageRoles: Record<string, ImageRole>,
  params: Record<string, unknown>,
): ConstraintState {
  const roles = Object.values(imageRoles);
  return {
    params,
    hasStartFrame: roles.includes("start_frame"),
    hasEndFrame: roles.includes("end_frame"),
    referenceCount: roles.filter((r) => r === "reference").length,
  };
}

function evaluateCondition(condition: Condition, state: ConstraintState): boolean {
  if ("field" in condition) {
    const fieldValue = state[condition.field as keyof ConstraintState];
    switch (condition.op) {
      case "eq":  return fieldValue === condition.value;
      case "gt":  return (fieldValue as number) > (condition.value as number);
      case "gte": return (fieldValue as number) >= (condition.value as number);
    }
  }
  if (condition.op === "and")
    return condition.conditions.every((c) => evaluateCondition(c, state));
  if (condition.op === "or")
    return condition.conditions.some((c) => evaluateCondition(c, state));
  return false;
}

export function evaluateConstraints(
  rules: ConstraintRule[] | undefined,
  state: ConstraintState,
): EvaluatedConstraints {
  const result: EvaluatedConstraints = {
    lockedParams: {},
    lockedParamReasons: {},
    disableFrameInputs: false,
    disableRefs: false,
  };

  if (!rules) return result;

  for (const rule of rules) {
    if (!evaluateCondition(rule.when, state)) continue;

    if (rule.effect.disableFrameInputs && !result.disableFrameInputs) {
      result.disableFrameInputs = true;
      result.disableFrameInputsReason = rule.reason;
    }
    if (rule.effect.disableRefs && !result.disableRefs) {
      result.disableRefs = true;
      result.disableRefsReason = rule.reason;
    }
    for (const { name, value } of rule.effect.lockParams ?? []) {
      result.lockedParams[name] = value;
      result.lockedParamReasons[name] = rule.reason;
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-gen/constraints.ts
git commit -m "feat(video-gen): add constraint evaluator"
```

---

## Task 3 — Fix model configs and add rules

**Files:**
- Modify: `src/lib/video-gen/params/veo.ts`
- Modify: `src/lib/video-gen/client-models.ts`
- Modify: `src/lib/video-gen/providers/veo.ts`

- [ ] **Step 1: Fix `veoLiteParams` duration in `params/veo.ts`**

Replace the entire file:

```typescript
// src/lib/video-gen/params/veo.ts
import type { ParamSpec } from "@/lib/image-gen/types";

// Valid Veo durationSeconds values: 4, 6, 8 (API only accepts these three)
export const veoParams: ParamSpec[] = [
  {
    name: "aspect_ratio",
    label: "Aspect Ratio",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "16:9",
    constraints: { type: "select", options: ["16:9", "9:16"] },
  },
  {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: "6",
    constraints: { type: "select", options: ["4", "6", "8"] },
  },
];

// Lite: same duration options as Quality (4/6/8 all supported)
// Kept as a separate export for future differentiation (e.g. resolution options differ)
export const veoLiteParams: ParamSpec[] = veoParams;
```

- [ ] **Step 2: Add rules and fix Fast in `client-models.ts`**

Replace the entire file:

```typescript
// src/lib/video-gen/client-models.ts
import type { VideoGenClientModelSpec, ConstraintRule } from "./types";
import { veoParams, veoLiteParams } from "./params/veo";
import { soraParams } from "./params/sora";

// ── Shared image input capability shapes ──────────────────────────────────────

const VEO_LITE_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

const VEO_REFS_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 3,
} as const;

// ── Constraint rules ──────────────────────────────────────────────────────────

const VEO_LITE_RULES: ConstraintRule[] = [
  {
    id: "lite-end-frame-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame requires 8s duration",
  },
];

const VEO_REFS_RULES: ConstraintRule[] = [
  {
    id: "refs-lock-duration-disable-frames",
    when: { field: "referenceCount", op: "gt", value: 0 },
    effect: {
      lockParams: [{ name: "duration", value: "8" }],
      disableFrameInputs: true,
    },
    reason: "Reference images require 8s and can't be combined with start/end frame",
  },
  {
    id: "frames-disable-refs",
    when: {
      op: "or",
      conditions: [
        { field: "hasStartFrame", op: "eq", value: true },
        { field: "hasEndFrame", op: "eq", value: true },
      ],
    },
    effect: { disableRefs: true },
    reason: "Start/end frame can't be combined with reference images",
  },
  {
    id: "end-frame-lock-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame requires 8s duration",
  },
];

// ── Model map ─────────────────────────────────────────────────────────────────

export const videoGenClientModelMap: Record<string, VideoGenClientModelSpec> = {
  "veo:veo-3.1-lite": {
    id: "veo:veo-3.1-lite",
    provider: "veo",
    label: "Veo 3.1 Lite",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_LITE_IMAGE_INPUTS,
    params: veoLiteParams,
    rules: VEO_LITE_RULES,
  },
  "veo:veo-3.1-fast": {
    id: "veo:veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "veo:veo-3.1": {
    id: "veo:veo-3.1",
    provider: "veo",
    label: "Veo 3.1 Quality",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "openai:sora-2": {
    id: "openai:sora-2",
    provider: "openai",
    label: "Sora 2",
    providerLabel: "OpenAI",
    maxDurationSeconds: 12,
    imageInputs: { startFrame: true, endFrame: false, maxReferenceImages: 0 },
    params: soraParams,
  },
};

export const DEFAULT_VIDEO_CLIENT_MODEL_ID = "veo:veo-3.1-fast";

export function defaultsForVideoModel(modelId: string): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}
```

- [ ] **Step 3: Fix `veoFast` in `providers/veo.ts`**

In `src/lib/video-gen/providers/veo.ts`, update the `veoFast` export (lines 130–139) to use `veoParams`, `VEO_QUALITY_IMAGE_INPUTS`, and `maxReferenceImages: 3`:

```typescript
export const veoFast: VideoGenModelSpec = {
  id: "veo:veo-3.1-fast",
  provider: "veo",
  label: "Veo 3.1 Fast",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_QUALITY_IMAGE_INPUTS,
  params: veoParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.fast, input, 3),
};
```

Also update `veoLite` `maxDurationSeconds` from `6` to `8`:

```typescript
export const veoLite: VideoGenModelSpec = {
  id: "veo:veo-3.1-lite",
  provider: "veo",
  label: "Veo 3.1 Lite",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_LITE_IMAGE_INPUTS,
  params: veoLiteParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.lite, input, 0),
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-gen/params/veo.ts src/lib/video-gen/client-models.ts src/lib/video-gen/providers/veo.ts
git commit -m "feat(video-gen): add constraint rules to model configs, fix Fast ref image support"
```

---

## Task 4 — Update `VideoGenParamsPanel` to show locked param state

**Files:**
- Modify: `src/components/nodes/video-gen-params-panel.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// src/components/nodes/video-gen-params-panel.tsx
"use client";

import {
  Cpu,
  Crop,
  LayoutGrid,
  Lock,
  Settings2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";

const PARAM_ICONS: Record<string, LucideIcon> = {
  aspect_ratio: Crop,
  duration:     Timer,
  seconds:      Timer,
  size:         LayoutGrid,
};

type Props = {
  modelId: string;
  params: Record<string, unknown>;
  onModelChange: (modelId: string) => void;
  onParamChange: (name: string, value: unknown) => void;
  lockedParams?: Record<string, unknown>;
  lockedParamReasons?: Record<string, string>;
};

export function VideoGenParamsPanel({
  modelId,
  params,
  onModelChange,
  onParamChange,
  lockedParams = {},
  lockedParamReasons = {},
}: Props) {
  const model = videoGenClientModelMap[modelId];
  const visibleParams = model?.params.filter((p) => p.visible) ?? [];

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Model row */}
        <ImageGenParamRow icon={Cpu} label="Model">
          <select
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Object.values(videoGenClientModelMap).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.providerLabel})
              </option>
            ))}
          </select>
        </ImageGenParamRow>

        {/* Param rows */}
        {visibleParams.map((spec) => {
          const isLocked = spec.name in lockedParams;
          return (
            <ImageGenParamRow
              key={spec.name}
              icon={PARAM_ICONS[spec.name] ?? Settings2}
              label={spec.label}
            >
              {isLocked ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="flex-1 text-xs text-foreground">
                    {String(lockedParams[spec.name])}s
                  </span>
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Lock
                        className="size-3 shrink-0 text-muted-foreground/50"
                        strokeWidth={1.5}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {lockedParamReasons[spec.name]}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <ParamControl
                  spec={spec}
                  value={params[spec.name] ?? spec.defaultValue}
                  onChange={(v) => onParamChange(spec.name, v)}
                />
              )}
            </ImageGenParamRow>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
```

Note: the `{String(lockedParams[spec.name])}s` adds an "s" suffix for duration display. If other params get locked in the future that aren't durations, remove the `s`. For now only `duration` gets locked.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-gen-params-panel.tsx
git commit -m "feat(video-gen): show lock icon on constrained params"
```

---

## Task 5 — Update `VideoGenConnectedSection` with "Clear all" + constraint disable

**Files:**
- Modify: `src/components/nodes/video-gen-connected-section.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// src/components/nodes/video-gen-connected-section.tsx
"use client";

import { useState } from "react";
import { ChevronRight, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";

type ImageRole = "start_frame" | "end_frame" | "reference";

type ImageInputs = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number;
};

type Props = {
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: ImageInputs;
  onRoleChange: (imageId: string, role: ImageRole) => void;
  onOpenDetail?: (id: string, type: "prompt" | "image") => void;
  disableFrameInputs?: boolean;
  disableFrameInputsReason?: string;
  disableRefs?: boolean;
  disableRefsReason?: string;
  onReset?: () => void;
};

export function VideoGenConnectedSection({
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
  onOpenDetail,
  disableFrameInputs = false,
  disableFrameInputsReason,
  disableRefs = false,
  disableRefsReason,
  onReset,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);

  const hasContent = promptNode !== null || images.length > 0;
  const hasAnyAssignment = Object.keys(imageRoles).length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs italic text-muted-foreground/60">
        Connect a File node with an image to use as start frame, end frame, or reference.
      </p>
    );
  }

  const referenceCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  function getRoleTooltip(imageId: string, role: ImageRole): string | null {
    // Constraint-based disabling (takes priority — has specific reason from the rule)
    if ((role === "start_frame" || role === "end_frame") && disableFrameInputs)
      return disableFrameInputsReason ?? "Not available with current settings";
    if (role === "reference" && disableRefs)
      return disableRefsReason ?? "Not available with current settings";

    // Structural capability check (model doesn't support this input type)
    if (role === "start_frame" && !imageInputs.startFrame)
      return "Not supported by this model";
    if (role === "end_frame" && !imageInputs.endFrame)
      return "Not supported by this model";
    if (role === "reference") {
      if (imageInputs.maxReferenceImages === 0) return "Not supported by this model";
      if (
        referenceCount >= imageInputs.maxReferenceImages &&
        imageRoles[imageId] !== "reference"
      )
        return `Max ${imageInputs.maxReferenceImages} reference image${imageInputs.maxReferenceImages === 1 ? "" : "s"}`;
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Clear all button — only shown when at least one role is assigned */}
      {hasAnyAssignment && onReset && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" strokeWidth={1.5} />
            Clear all
          </button>
        </div>
      )}

      {promptNode && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setPromptOpen((p) => !p)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
                  promptOpen && "rotate-90",
                )}
              />
              <span className="truncate text-xs font-semibold text-foreground">
                Video prompt
              </span>
            </button>
            {onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail(promptNode.id, "prompt")}
                title="View full prompt"
                className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
          {promptOpen && (
            <div className="px-3 pb-2.5">
              {promptNode.text ? (
                <p className="text-xs leading-relaxed text-foreground/70">
                  {promptNode.text}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  No motion prompt generated yet — generate from the video-prompt node first.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {images.length > 0 && (
        <TooltipProvider>
          <div className="grid grid-cols-2 gap-2">
            {images.map((image) => {
              const activeRole = imageRoles[image.id];
              return (
                <div
                  key={image.id}
                  className="group relative overflow-hidden rounded-lg border border-border"
                >
                  <div className="aspect-video">
                    <img
                      src={image.imageUrl}
                      alt={`Image input (${image.type})`}
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  {onOpenDetail && (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(image.id, "image")}
                      title="View full image"
                      className="absolute right-1.5 top-1.5 flex items-center justify-center rounded bg-black/60 p-1 text-white/80 opacity-0 backdrop-blur-sm transition-opacity hover:text-white group-hover:opacity-100"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 bg-black/60 p-1.5 backdrop-blur-sm">
                    {(["start_frame", "end_frame", "reference"] as const).map((role) => {
                      const label =
                        role === "start_frame" ? "Start" : role === "end_frame" ? "End" : "Ref";
                      const tooltip = getRoleTooltip(image.id, role);
                      const disabled = tooltip !== null;
                      const active = activeRole === role;
                      return (
                        <Tooltip key={role}>
                          <TooltipTrigger render={<span className="inline-flex" />}>
                            <button
                              type="button"
                              aria-disabled={disabled}
                              aria-label={`Set as ${role.replace(/_/g, " ")}`}
                              onClick={() => !disabled && onRoleChange(image.id, role)}
                              className={cn(
                                "rounded px-2 py-0.5 text-[0.65rem] font-semibold transition-colors",
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-white/20 text-white/80 hover:bg-white/30",
                                disabled && "cursor-not-allowed opacity-40",
                              )}
                            >
                              {label}
                            </button>
                          </TooltipTrigger>
                          {tooltip && (
                            <TooltipContent side="top">{tooltip}</TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/video-gen-connected-section.tsx
git commit -m "feat(video-gen): add Clear all button and constraint-based role disabling"
```

---

## Task 6 — Wire constraints in `VideoGenFocusView`

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add these two imports alongside the existing ones:

```typescript
import {
  buildConstraintState,
  evaluateConstraints,
} from "@/lib/video-gen/constraints";
```

- [ ] **Step 2: Add constraint evaluation after the state declarations (around line 338)**

After the `[detailItem, setDetailItem]` state declaration, add:

```typescript
// ── Constraint evaluation ──────────────────────────────────────────────────

const constraintState = buildConstraintState(
  imageRolesProp as Record<string, "start_frame" | "end_frame" | "reference">,
  params,
);
const currentModel = videoGenClientModelMap[modelId];
const constraints = evaluateConstraints(currentModel?.rules, constraintState);
```

- [ ] **Step 3: Auto-apply locked params when constraints change**

Add this effect after the existing `wasGeneratingRef` effect (around line 427):

```typescript
// Auto-snap params to locked values when constraints fire
useEffect(() => {
  const entries = Object.entries(constraints.lockedParams);
  if (entries.length === 0) return;

  let changed = false;
  const updated = { ...params };
  for (const [name, value] of entries) {
    if (params[name] !== value) {
      updated[name] = value;
      changed = true;
    }
  }
  if (!changed) return;
  setParams(updated);
  onPatchRef.current({ params: updated });
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [imageRolesProp, modelId]);
```

- [ ] **Step 4: Add `handleReset`**

After the `handleRoleChange` function (around line 492), add:

```typescript
function handleReset() {
  onPatch({ imageRoles: {} });
}
```

- [ ] **Step 5: Pass `lockedParams` and `lockedParamReasons` to `VideoGenParamsPanel`**

Find the `<VideoGenParamsPanel` usage (around line 675) and add the two new props:

```tsx
<VideoGenParamsPanel
  modelId={modelId}
  params={params}
  onModelChange={handleModelChange}
  onParamChange={handleParamChange}
  lockedParams={constraints.lockedParams}
  lockedParamReasons={constraints.lockedParamReasons}
/>
```

- [ ] **Step 6: Pass constraint flags and `onReset` to `VideoGenConnectedSection`**

Find the `<VideoGenConnectedSection` usage (around line 696) and add the new props:

```tsx
<VideoGenConnectedSection
  promptNode={promptNode}
  images={upstreamImages}
  imageRoles={imageRolesProp}
  imageInputs={imageInputs}
  onRoleChange={handleRoleChange}
  onOpenDetail={(id, type) => setDetailItem({ id, type })}
  disableFrameInputs={constraints.disableFrameInputs}
  disableFrameInputsReason={constraints.disableFrameInputsReason}
  disableRefs={constraints.disableRefs}
  disableRefsReason={constraints.disableRefsReason}
  onReset={handleReset}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(video-gen): evaluate constraints and auto-apply locked params in focus view"
```

---

## Task 7 — Filter image-gen nodes from image sources

**Files:**
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`

- [ ] **Step 1: Remove image-gen from `upstream-images/route.ts`**

Replace lines 29–45 (the `images` filter + map) with:

```typescript
const images = allUpstream
  .filter((u) => {
    if (u.type === "file" || u.type === "draw") {
      const d = u.data as Record<string, unknown>;
      return d.fileKind === "image" && typeof d.fileUrl === "string";
    }
    return false;
  })
  .map((u) => ({
    id: u.nodeId,
    type: u.type,
    imageUrl: (u.data as Record<string, unknown>).fileUrl as string,
  }));
```

The full updated file:

```typescript
// src/app/api/nodes/[id]/upstream-images/route.ts
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  try {
    const direct = await getUpstreamOutputs(nodeId);

    // Also collect upstream of any video-prompt nodes (2-level traversal).
    // Surfaces file/draw nodes in pattern: node → video-prompt → video-gen.
    const videoPromptUpstream = await Promise.all(
      direct
        .filter((u) => u.type === "video-prompt")
        .map((u) => getUpstreamOutputs(u.nodeId)),
    );

    // Merge and deduplicate; direct edges take precedence.
    const seen = new Map(direct.map((u) => [u.nodeId, u]));
    for (const batch of videoPromptUpstream) {
      for (const u of batch) {
        if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
      }
    }
    const allUpstream = Array.from(seen.values());

    // Only file and draw nodes with fileKind === "image" are valid frame sources.
    // Image-gen node outputs are excluded — users must connect a File node instead.
    const images = allUpstream
      .filter((u) => {
        if (u.type === "file" || u.type === "draw") {
          const d = u.data as Record<string, unknown>;
          return d.fileKind === "image" && typeof d.fileUrl === "string";
        }
        return false;
      })
      .map((u) => ({
        id: u.nodeId,
        type: u.type,
        imageUrl: (u.data as Record<string, unknown>).fileUrl as string,
      }));

    const videoPromptNode = direct.find((u) => u.type === "video-prompt");
    const promptNode = videoPromptNode
      ? {
          id: videoPromptNode.nodeId,
          text: typeof videoPromptNode.activeOutput === "string" ? videoPromptNode.activeOutput : null,
        }
      : null;

    return apiOk({ images, promptNode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve upstream images";
    return apiError(message, 500);
  }
}
```

- [ ] **Step 2: Remove image-gen from `video-generate/route.ts`**

Find the role resolution loop (around lines 61–79) and replace it so only `file` and `draw` nodes are processed:

```typescript
for (const node of allUpstream) {
  if (node.type === "file" || node.type === "draw") {
    const data = node.data as Record<string, unknown>;
    if (data.fileKind !== "image") continue;
    const url = typeof data.fileUrl === "string" ? data.fileUrl : undefined;
    if (!url) continue;
    const role = imageRoles[node.nodeId] ?? "reference";
    if (role === "start_frame" && !startFrameUrl) startFrameUrl = url;
    else if (role === "end_frame" && !endFrameUrl) endFrameUrl = url;
    else if (role === "reference") referenceUrls.push(url);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/nodes/[id]/upstream-images/route.ts src/app/api/nodes/[id]/video-generate/route.ts
git commit -m "feat(video-gen): restrict image sources to file/draw nodes only"
```

---

## Verification

After all tasks are complete, test end-to-end:

1. **End frame → duration locks**: Connect a File node (image) to a video-gen node. Open focus view. Set the file node as "End" frame. Duration selector disappears and shows "8s 🔒" with tooltip "End frame requires 8s duration".

2. **Reference images → frames disabled**: Assign the file node as "Ref". Start/End buttons on all images grey out with tooltip "Reference images require 8s and can't be combined with start/end frame". Duration shows "8s 🔒".

3. **Clear all resets**: Click "Clear all" at top of Connected section. All role assignments reset. Duration selector unlocks.

4. **Image-gen node hidden**: Connect an image-gen node to a video-gen node. Open focus view. The image-gen node does NOT appear in the Connected section. Only File/Draw nodes appear.

5. **Lite has no ref option**: Switch model to Veo 3.1 Lite. Ref buttons are structurally disabled ("Not supported by this model"). Duration options include 4, 6, 8.

6. **Fast has refs**: Switch to Veo 3.1 Fast. Up to 3 Ref assignments are available.

7. **TypeScript clean**: `npx tsc --noEmit` exits with 0 errors.
