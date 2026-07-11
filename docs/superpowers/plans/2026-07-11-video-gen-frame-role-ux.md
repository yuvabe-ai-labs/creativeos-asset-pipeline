# Video Gen Frame & Role UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image role assignment in the video gen focus view intentional and transparent — remove silent auto-assign on open, surface active constraint rules in an amber card, replace silent conflict handling with confirmation dialogs, and add Kling start-frame guard.

**Architecture:** Changes are confined to the video gen focus view and its connected-section child. A new `ActiveRulesCard` component reads from `EvaluatedConstraints` (already computed). Dialog state is managed via a `pendingDialog` union type in the focus view; all dialogs render from a single `AlertDialog` at the bottom of the JSX. The constraint reason strings in `client-models.ts` are rewritten to user-friendly language first, so the card inherits them automatically.

**Tech Stack:** React, shadcn/ui (`AlertDialog`, `Tooltip`), Lucide icons, Sonner toasts, TypeScript.

---

## File map

| File | What changes |
|---|---|
| `src/lib/video-gen/api.ts` | Add `filename?: string` to `UpstreamImage` type |
| `src/app/api/nodes/[id]/upstream-images/route.ts` | Return `filename` per image |
| `src/lib/video-gen/client-models.ts` | Rewrite all `reason` strings to user-friendly language |
| `src/components/ui/alert-dialog.tsx` | New — add shadcn AlertDialog via CLI |
| `src/components/nodes/video-gen-active-rules-card.tsx` | New — `ActiveRulesCard` component |
| `src/components/nodes/video-gen-focus-view.tsx` | Remove auto-assign on mount; add `pendingDialog` state; add generate-click guards (C0, C2, C3); add conflict dialog (§D); add replace-singleton dialog (§G); add model-switch toast (§E); render `ActiveRulesCard` and `AlertDialog` |
| `src/components/nodes/video-gen-connected-section.tsx` | Add `onConflictingRoleRequest` prop; change conflict-disabled buttons to clickable-with-opacity; keep structural-capability `disabled`; relabel "Clear all" → "Clear roles" |

---

## Task 0 — Add `filename` to `UpstreamImage` type and route

**Files:**
- Modify: `src/lib/video-gen/api.ts`
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts`

The replace-singleton dialog (§G) and model-switch toasts (§E) display the filename of the affected image. `UpstreamImage` doesn't carry `filename` today — add it.

- [ ] **Step 1: In `src/lib/video-gen/api.ts`, add `filename` to `UpstreamImage`**

```ts
export type UpstreamImage = {
  id: string;
  type: string;
  imageUrl: string;
  filename?: string;
};
```

- [ ] **Step 2: In `src/app/api/nodes/[id]/upstream-images/route.ts`, return `filename` in the image map**

Find the `.map((u) => { ... })` block (around line 44). The current return object ends with `imageHeight`. Add `filename`:

```ts
.map((u) => {
  const d = u.data as Record<string, unknown>;
  return {
    id: u.nodeId,
    type: u.type,
    imageUrl: u.type === "image-gen"
      ? (u.activeOutput as string)
      : (d.fileUrl as string),
    filename: typeof d.filename === "string" ? d.filename : undefined,
    fileSizeBytes: d.fileSizeBytes as number | undefined,
    imageWidth: d.imageWidth as number | undefined,
    imageHeight: d.imageHeight as number | undefined,
  };
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/lib/video-gen/api.ts src/app/api/nodes/[id]/upstream-images/route.ts
git commit -m "feat(video-gen): add filename to UpstreamImage type and upstream-images route"
```

---

## Task 1 — Rewrite constraint reason strings

**Files:**
- Modify: `src/lib/video-gen/client-models.ts`

The reason strings are the single source of truth used by the `ActiveRulesCard` (§B) and tooltips. Rewrite them now so all downstream tasks inherit the friendly language automatically.

- [ ] **Step 1: Open `src/lib/video-gen/client-models.ts` and replace all six reason strings**

Replace the entire `VEO_LITE_RULES`, `VEO_REFS_RULES`, and `SORA_RULES` blocks with:

```ts
const VEO_LITE_RULES: ConstraintRule[] = [
  {
    id: "lite-end-frame-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame selected → duration locked to 8s",
  },
  {
    id: "end-frame-requires-start-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    reason: "End frame needs a start frame before you can generate",
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
    reason: "Reference images selected → duration locked to 8s, start/end frames unavailable",
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
    reason: "Start/end frame selected → reference images unavailable",
  },
  {
    id: "end-frame-lock-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame selected → duration locked to 8s",
  },
  {
    id: "end-frame-requires-start-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    reason: "End frame needs a start frame before you can generate",
  },
];

const SORA_RULES: ConstraintRule[] = [
  {
    id: "sora-start-frame-locks-size",
    when: { field: "hasStartFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "size", value: "1280x720" }] },
    reason: "Start frame selected → output size locked to match your image",
  },
];
```

- [ ] **Step 2: Verify TypeScript still compiles**

```
cd e:\CreativeOS\creativeos-mvp
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/lib/video-gen/client-models.ts
git commit -m "feat(video-gen): rewrite constraint reason strings to user-friendly language"
```

---

## Task 2 — Add shadcn AlertDialog component

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`

`AlertDialog` doesn't exist yet in `src/components/ui/`. Add it via the shadcn CLI.

- [ ] **Step 1: Add the component**

```
cd e:\CreativeOS\creativeos-mvp
npx shadcn@latest add alert-dialog
```

Expected: `src/components/ui/alert-dialog.tsx` is created.

- [ ] **Step 2: Verify the file exists and exports the expected named exports**

Open `src/components/ui/alert-dialog.tsx` and confirm it exports:
`AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`.

- [ ] **Step 3: Verify TypeScript still compiles**

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/components/ui/alert-dialog.tsx
git commit -m "feat: add shadcn AlertDialog component"
```

---

## Task 3 — Create `ActiveRulesCard` component

**Files:**
- Create: `src/components/nodes/video-gen-active-rules-card.tsx`

This component reads from `EvaluatedConstraints` and renders an amber card listing every active constraint as a user-friendly note. It returns `null` when nothing is active.

Context on `EvaluatedConstraints` (from `src/lib/video-gen/types.ts`):
```ts
type EvaluatedConstraints = {
  lockedParams: Record<string, unknown>;
  lockedParamReasons: Record<string, string>;   // param name → reason string
  disableFrameInputs: boolean;
  disableFrameInputsReason?: string;
  disableRefs: boolean;
  disableRefsReason?: string;
  disableGenerate: boolean;
  disableGenerateReason?: string;
};
```

- [ ] **Step 1: Create `src/components/nodes/video-gen-active-rules-card.tsx`**

```tsx
import { Info } from "lucide-react";
import type { EvaluatedConstraints } from "@/lib/video-gen/types";

type Props = {
  constraints: EvaluatedConstraints;
};

export function ActiveRulesCard({ constraints }: Props) {
  // Collect all active reason strings, deduplicating identical messages
  const reasons = new Set<string>();

  if (constraints.disableFrameInputsReason) {
    reasons.add(constraints.disableFrameInputsReason);
  }
  if (constraints.disableRefsReason) {
    reasons.add(constraints.disableRefsReason);
  }
  if (constraints.disableGenerateReason) {
    reasons.add(constraints.disableGenerateReason);
  }
  for (const reason of Object.values(constraints.lockedParamReasons)) {
    reasons.add(reason);
  }

  if (reasons.size === 0) return null;

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-md px-3 py-2.5 flex flex-col gap-1.5">
      {Array.from(reasons).map((reason) => (
        <div key={reason} className="flex items-start gap-1.5">
          <Info className="size-3 shrink-0 mt-0.5 text-amber-600" strokeWidth={1.5} />
          <span className="text-xs text-amber-800 leading-snug">{reason}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/nodes/video-gen-active-rules-card.tsx
git commit -m "feat(video-gen): add ActiveRulesCard component"
```

---

## Task 4 — Remove auto-assign on mount in focus view

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx` (lines 458–473)

Currently, when `fetchUpstreamImages` resolves on mount it calls `applyDefaultImageRoles` and patches the node. We remove that call so the focus view opens with roles exactly as stored — unassigned images stay unassigned.

The `applyDefaultImageRoles` function itself is kept (it's still used in `handleModelChange`).

- [ ] **Step 1: In `video-gen-focus-view.tsx`, find the `.then()` callback inside the `fetchUpstreamImages` call (around line 460)**

The current block inside `.then()` is:

```ts
.then(({ images, promptNode: pn }) => {
  setUpstreamImages(images);
  setPromptNode(pn);
  // Auto-assign default roles for any unassigned images
  const inputs = videoGenClientModelMap[modelId]?.imageInputs;
  if (inputs && images.length > 0) {
    const withDefaults = applyDefaultImageRoles(images, inputs, imageRolesProp);
    if (images.some((img) => img.id in withDefaults && !(img.id in imageRolesProp))) {
      onPatchRef.current({ imageRoles: withDefaults });
    }
  }
})
```

Replace it with:

```ts
.then(({ images, promptNode: pn }) => {
  setUpstreamImages(images);
  setPromptNode(pn);
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke test** — Open the video gen focus view with an image connected. Confirm the image shows no role pre-selected (all three role buttons are available and none is highlighted).

- [ ] **Step 4: Commit**

```
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(video-gen): remove silent auto-assign of image roles on mount"
```

---

## Task 5 — Add `pendingDialog` state and `DialogState` type to focus view

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

Add the `DialogState` union and `pendingDialog` / `setPendingDialog` state. Also add `hasExplicitlySkippedEndFrame` ref (for C3 suppression). No dialog UI yet — that's Task 8.

- [ ] **Step 1: Add the `DialogState` type near the top of the file, after the existing `ImageRole` and `ImageInputs` types (around line 58)**

```ts
type DialogState =
  | null
  | { type: "no-roles" }
  | { type: "missing-end-frame" }
  | { type: "role-conflict"; imageId: string; role: ImageRole; conflictingRole: "start_frame" | "end_frame" | "reference" }
  | { type: "replace-singleton"; imageId: string; role: "start_frame" | "end_frame"; incumbentId: string; incumbentName: string };
```

- [ ] **Step 2: Add the state and ref inside the `VideoGenFocusView` component body, after the existing `useState` calls (around line 382)**

```ts
const [pendingDialog, setPendingDialog] = useState<DialogState>(null);
const hasExplicitlySkippedEndFrameRef = useRef(false);
```

- [ ] **Step 3: Clear `hasExplicitlySkippedEndFrameRef` when `upstreamImages` changes**

In the `.then(({ images, promptNode: pn }) => { ... })` callback (the one we edited in Task 4), add:

```ts
.then(({ images, promptNode: pn }) => {
  setUpstreamImages(images);
  setPromptNode(pn);
  hasExplicitlySkippedEndFrameRef.current = false;
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(video-gen): add pendingDialog state and DialogState type"
```

---

## Task 6 — Update `handleRoleChange` for conflict and singleton dialogs

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx` — `handleRoleChange` function (lines 548–575)

Instead of silently demoting the incumbent when a singleton role is taken, and instead of ignoring constraint-blocked clicks (those buttons will be made clickable in Task 7), we now open the appropriate dialog.

**Two cases to handle:**

**Case A — singleton replacement (§G):** User clicks `start_frame` or `end_frame`, and another image already holds that role. Open `replace-singleton` dialog instead of silently demoting.

**Case B — constraint conflict (§D):** User clicks a role that is currently constraint-blocked (`disableFrameInputs` or `disableRefs`). Open `role-conflict` dialog.

**Toggle (no dialog):** User clicks the role already active on their own image → clear it. No dialog.

- [ ] **Step 1: Replace the entire `handleRoleChange` function**

```ts
function handleRoleChange(imageId: string, newRole: ImageRole) {
  const updated = { ...effectiveImageRoles };

  // Toggle: clicking the role already assigned to this image clears it
  if (updated[imageId] === newRole) {
    delete updated[imageId];
    onPatch({ imageRoles: updated });
    return;
  }

  // Conflict check (§D): role is blocked by an active constraint
  const isFrameRole = newRole === "start_frame" || newRole === "end_frame";
  const isRefRole = newRole === "reference";
  if (isFrameRole && constraints.disableFrameInputs) {
    // Frames are blocked because refs are active
    const conflictingRole: ImageRole = "reference";
    setPendingDialog({ type: "role-conflict", imageId, role: newRole, conflictingRole });
    return;
  }
  if (isRefRole && constraints.disableRefs) {
    // Refs are blocked because frames are active
    const hasStart = Object.values(updated).includes("start_frame");
    const conflictingRole: ImageRole = hasStart ? "start_frame" : "end_frame";
    setPendingDialog({ type: "role-conflict", imageId, role: newRole, conflictingRole });
    return;
  }

  // Singleton replacement check (§G): start_frame or end_frame already held by another image
  if (newRole === "start_frame" || newRole === "end_frame") {
    const incumbentId = Object.entries(updated).find(
      ([id, r]) => id !== imageId && r === newRole,
    )?.[0];
    if (incumbentId) {
      const incumbentImage = upstreamImages.find((img) => img.id === incumbentId);
      const incumbentName = incumbentImage?.filename ?? "";
      setPendingDialog({
        type: "replace-singleton",
        imageId,
        role: newRole,
        incumbentId,
        incumbentName,
      });
      return;
    }
  }

  // No conflict, no replacement needed — apply directly
  updated[imageId] = newRole;
  commitRoleChange(updated);
}

function commitRoleChange(updated: Record<string, ImageRole>) {
  const nextConstraints = evaluateConstraints(
    currentModel?.rules,
    buildConstraintState(updated, params),
  );
  const lockedEntries = Object.entries(nextConstraints.lockedParams);
  const changedLocked = lockedEntries.some(([k, v]) => params[k] !== v);
  if (changedLocked) {
    const nextParams = { ...params, ...nextConstraints.lockedParams };
    setParams(nextParams);
    onPatch({ imageRoles: updated, params: nextParams });
  } else {
    onPatch({ imageRoles: updated });
  }
}
```

Note: `commitRoleChange` is a new helper extracted from the old `handleRoleChange` tail — reused in dialog confirm handlers (Task 8).

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(video-gen): update handleRoleChange to open conflict/replace-singleton dialogs"
```

---

## Task 7 — Update `VideoGenConnectedSection`: conflict buttons clickable, relabel Clear

**Files:**
- Modify: `src/components/nodes/video-gen-connected-section.tsx`

Two changes:
1. Add `onConflictingRoleRequest` prop — called when a user clicks a constraint-blocked role button (instead of silently ignoring via `aria-disabled`).
2. Relabel "Clear all" button to "Clear roles".

Structural capability checks (model doesn't support the role type) remain `disabled`. Only constraint-driven disabled buttons become clickable-with-opacity.

- [ ] **Step 1: Update the `Props` type to add the new prop**

Find the `type Props = { ... }` block (around line 22) and add:

```ts
type Props = {
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: ImageInputs;
  onRoleChange: (imageId: string, role: ImageRole) => void;
  onConflictingRoleRequest: (imageId: string, role: ImageRole) => void;
  onOpenDetail?: (id: string, type: "prompt" | "image") => void;
  disableFrameInputs?: boolean;
  disableFrameInputsReason?: string;
  disableRefs?: boolean;
  disableRefsReason?: string;
  onReset?: () => void;
};
```

- [ ] **Step 2: Destructure the new prop in the component function signature**

```ts
export function VideoGenConnectedSection({
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
  onConflictingRoleRequest,
  onOpenDetail,
  disableFrameInputs = false,
  disableFrameInputsReason,
  disableRefs = false,
  disableRefsReason,
  onReset,
}: Props) {
```

- [ ] **Step 3: Update `getRoleTooltip` — constraint-blocked roles return `null` (clickable), structural mismatches keep tooltip**

Replace the entire `getRoleTooltip` function:

```ts
function getRoleTooltip(imageId: string, role: ImageRole): string | null {
  // Structural capability check (model doesn't support this role type) — keep disabled
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
  // Constraint-based disabling is now handled via onConflictingRoleRequest — no tooltip here
  return null;
}
```

- [ ] **Step 4: Update the button rendering logic in the image grid**

Find the role button render block (around line 178). Replace the click handler and class logic:

```tsx
{(["start_frame", "end_frame", "reference"] as const).map((role) => {
  const label =
    role === "start_frame" ? "Start" : role === "end_frame" ? "End" : "Ref";
  const tooltip = getRoleTooltip(image.id, role);
  const structurallyDisabled = tooltip !== null;
  const active = activeRole === role;

  // Constraint-blocked: clickable but visually dimmed
  const isConstraintBlocked =
    ((role === "start_frame" || role === "end_frame") && disableFrameInputs) ||
    (role === "reference" && disableRefs);

  function handleClick() {
    if (structurallyDisabled) return;
    if (isConstraintBlocked) {
      onConflictingRoleRequest(image.id, role);
      return;
    }
    onRoleChange(image.id, role);
  }

  const btn = (
    <button
      key={role}
      type="button"
      aria-disabled={structurallyDisabled}
      aria-label={`Set as ${role.replace(/_/g, " ")}`}
      onClick={handleClick}
      className={cn(
        "rounded px-2 py-0.5 text-[0.65rem] font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-white/20 text-white/80 hover:bg-white/30",
        structurallyDisabled && "cursor-not-allowed opacity-40",
        isConstraintBlocked && !active && "opacity-60 cursor-pointer",
      )}
    >
      {label}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip key={role}>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {btn}
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
})}
```

- [ ] **Step 5: Relabel "Clear all" to "Clear roles"**

Find the clear button (around line 91):

```tsx
<button
  type="button"
  onClick={onReset}
  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
>
  <RotateCcw className="size-3" strokeWidth={1.5} />
  Clear roles
</button>
```

- [ ] **Step 6: Verify TypeScript compiles**

```
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
git add src/components/nodes/video-gen-connected-section.tsx
git commit -m "feat(video-gen): make constraint-blocked role buttons clickable, relabel clear button"
```

---

## Task 8 — Wire up `onConflictingRoleRequest`, `ActiveRulesCard`, and `AlertDialog` in focus view

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

This is the integration task. It:
1. Passes `onConflictingRoleRequest` to `VideoGenConnectedSection`
2. Renders `ActiveRulesCard` in the left panel (below Connected section)
3. Renders one `AlertDialog` driven by `pendingDialog` state with all dialog types wired up
4. Adds generate-click guards (C0 Kling, C2 no-roles, C3 missing-end-frame)
5. Adds model-switch toasts (§E)

- [ ] **Step 1: Add imports at the top of `video-gen-focus-view.tsx`**

Add to the existing import block:

```ts
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActiveRulesCard } from "./video-gen-active-rules-card";
```

- [ ] **Step 2: Add `handleConflictingRoleRequest` function (the bridge between connected-section and the dialog)**

Add this function after `handleReset` (around line 579):

```ts
function handleConflictingRoleRequest(imageId: string, role: ImageRole) {
  // This is called when a constraint-blocked role button is clicked.
  // Determine which role is on the other side of the conflict.
  const isFrameRole = role === "start_frame" || role === "end_frame";
  if (isFrameRole && constraints.disableFrameInputs) {
    setPendingDialog({ type: "role-conflict", imageId, role, conflictingRole: "reference" });
  } else if (role === "reference" && constraints.disableRefs) {
    const hasStart = Object.values(effectiveImageRoles).includes("start_frame");
    setPendingDialog({
      type: "role-conflict",
      imageId,
      role,
      conflictingRole: hasStart ? "start_frame" : "end_frame",
    });
  }
}
```

- [ ] **Step 3: Add model-switch toasts in `handleModelChange` (§E)**

After computing `finalRoles` and before `setParams(finalParams)`, insert:

```ts
// Toast for dropped role assignments
const droppedImages = upstreamImages.filter(
  (img) => img.id in currentRoles && !(img.id in finalRoles),
);
const toastMessages = droppedImages.map((img) => {
  const oldRole = currentRoles[img.id]!.replace(/_/g, " ");
  return `"${img.filename ?? "Image"}" removed from ${oldRole} — not supported by ${nextModel?.label ?? nextModelId}`;
});
if (toastMessages.length <= 3) {
  toastMessages.forEach((msg) => toast.info(msg, { duration: 3500 }));
} else {
  toastMessages.slice(0, 3).forEach((msg) => toast.info(msg, { duration: 3500 }));
  toast.info(`…and ${toastMessages.length - 3} more role${toastMessages.length - 3 === 1 ? "" : "s"} removed`, { duration: 3500 });
}
```

Note: `currentRoles` is used before the migration loop mutates it, so capture the dropped images AFTER `finalRoles` is computed. The correct insertion point is:

```ts
const finalRoles = nextInputs
  ? applyDefaultImageRoles(upstreamImages, nextInputs, currentRoles)
  : currentRoles;

// ← insert dropped-roles toast here

// Commit any constraint-locked values...
```

- [ ] **Step 4: Update `handleGenerate` with generate-click guards**

Replace the existing `handleGenerate` function:

```ts
async function handleGenerate() {
  // C0 (Kling): start frame required — handled by disabled button, guard here as safety net
  if (currentModel?.provider === "kling") {
    const hasStartFrame = Object.values(effectiveImageRoles).includes("start_frame");
    if (!hasStartFrame) return; // button should be disabled, but guard anyway
  }

  // C2: images connected but none assigned (non-Kling providers)
  if (upstreamImages.length > 0 && Object.keys(effectiveImageRoles).length === 0) {
    setPendingDialog({ type: "no-roles" });
    return;
  }

  // C3: end frame slot available, start frame assigned, unassigned images exist, no end frame
  const hasStartFrame = Object.values(effectiveImageRoles).includes("start_frame");
  const hasEndFrame = Object.values(effectiveImageRoles).includes("end_frame");
  const hasUnassigned = upstreamImages.some((img) => !(img.id in effectiveImageRoles));
  if (
    imageInputs.endFrame &&
    hasStartFrame &&
    !hasEndFrame &&
    hasUnassigned &&
    !hasExplicitlySkippedEndFrameRef.current
  ) {
    setPendingDialog({ type: "missing-end-frame" });
    return;
  }

  await doGenerate();
}

async function doGenerate() {
  setGenerating(true);
  setLastError(null);
  try {
    await videoGenApi.startGeneration(nodeId, {
      modelId,
      params,
      imageRoles: effectiveImageRoles,
      mock: useMock,
    });
  } catch (e) {
    setGenerating(false);
    const msg = e instanceof Error ? e.message : "Generation failed";
    setLastError(msg);
    toast.error(msg);
  }
}
```

- [ ] **Step 5: Add Kling disabled condition to the Generate button**

Find the Generate button in the JSX (around line 748). Update its `disabled` prop:

```tsx
disabled={
  isGenerating ||
  constraints.disableGenerate ||
  !editable ||
  (currentModel?.provider === "kling" &&
    !Object.values(effectiveImageRoles).includes("start_frame"))
}
```

And update the `TooltipContent` to also show the Kling message when appropriate:

```tsx
{(constraints.disableGenerate && constraints.disableGenerateReason) && (
  <TooltipContent side="bottom">
    {constraints.disableGenerateReason}
  </TooltipContent>
)}
{currentModel?.provider === "kling" &&
  !Object.values(effectiveImageRoles).includes("start_frame") && (
    <TooltipContent side="bottom">
      Kling requires a start frame — connect an image and assign it as Start Frame
    </TooltipContent>
  )}
```

Note: Wrap both in a fragment `<>...</>` inside the existing `<Tooltip>` component.

- [ ] **Step 6: Pass `onConflictingRoleRequest` to `VideoGenConnectedSection`**

Find the `<VideoGenConnectedSection>` JSX (around line 865). Add the new prop:

```tsx
<VideoGenConnectedSection
  promptNode={promptNode}
  images={upstreamImages}
  imageRoles={effectiveImageRoles}
  imageInputs={imageInputs}
  onRoleChange={handleRoleChange}
  onConflictingRoleRequest={handleConflictingRoleRequest}
  onOpenDetail={(id, type) => setDetailItem({ id, type })}
  disableFrameInputs={constraints.disableFrameInputs}
  disableFrameInputsReason={constraints.disableFrameInputsReason}
  disableRefs={constraints.disableRefs}
  disableRefsReason={constraints.disableRefsReason}
  onReset={handleReset}
/>
```

- [ ] **Step 7: Add `ActiveRulesCard` below the Connected section in the left panel**

In the left panel (the `flex flex-col gap-6` div), after the `<LeftSection>` that wraps `VideoGenConnectedSection`, add:

```tsx
<ActiveRulesCard constraints={constraints} />
```

- [ ] **Step 8: Add the `AlertDialog` at the bottom of the return JSX**

Inside the `<Sheet>` but after `<SheetContent>`, add — or more precisely, inside `<SheetContent>` after the body `<div>`, insert:

```tsx
{/* ── Dialog hub — all dialogs driven by pendingDialog state ── */}
<AlertDialog
  open={pendingDialog !== null}
  onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
>
  <AlertDialogContent>
    {pendingDialog?.type === "no-roles" && (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>No frame selected</AlertDialogTitle>
          <AlertDialogDescription>
            You have connected images but haven&apos;t assigned any role (start frame, end
            frame, or reference). Generate anyway using only the text prompt?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingDialog(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setPendingDialog(null);
              void doGenerate();
            }}
          >
            Generate anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </>
    )}

    {pendingDialog?.type === "missing-end-frame" && (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>End frame not assigned</AlertDialogTitle>
          <AlertDialogDescription>
            You have a connected image without a role, and this model supports an end
            frame. Generate with just the start frame?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingDialog(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              hasExplicitlySkippedEndFrameRef.current = true;
              setPendingDialog(null);
              void doGenerate();
            }}
          >
            Generate anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </>
    )}

    {pendingDialog?.type === "role-conflict" && (() => {
      const d = pendingDialog;
      const isAddingRef = d.role === "reference";
      const modelLabel = currentModel?.label ?? "This model";
      const removeWhat = isAddingRef ? "start/end frame assignments" : "reference image assignments";
      const switchingTo = isAddingRef ? "reference images" : "start/end frames";
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>Can&apos;t combine these roles</AlertDialogTitle>
            <AlertDialogDescription>
              {modelLabel} doesn&apos;t support reference images together with start/end
              frames. Switching to {switchingTo} will remove your {removeWhat}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDialog(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // Clear the conflicting side and apply the new role
                const updated = { ...effectiveImageRoles };
                for (const [id, r] of Object.entries(updated)) {
                  if (r === d.conflictingRole) delete updated[id];
                  // Also clear the other singleton if we're switching away from frames
                  if (isAddingRef && (r === "start_frame" || r === "end_frame")) {
                    delete updated[id];
                  }
                }
                updated[d.imageId] = d.role;
                setPendingDialog(null);
                commitRoleChange(updated);
              }}
            >
              Switch to {switchingTo}
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      );
    })()}

    {pendingDialog?.type === "replace-singleton" && (() => {
      const d = pendingDialog;
      const roleLabel = d.role === "start_frame" ? "start frame" : "end frame";
      const incumbentLabel = d.incumbentName
        ? `"${d.incumbentName}"`
        : `the current ${roleLabel}`;
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace {roleLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {incumbentLabel} is currently set as the {roleLabel}. Replace it with this
              image?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDialog(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const updated = { ...effectiveImageRoles };
                // Demote incumbent: to reference if refs allowed, else unassign
                if (imageInputs.maxReferenceImages > 0) {
                  updated[d.incumbentId] = "reference";
                } else {
                  delete updated[d.incumbentId];
                }
                updated[d.imageId] = d.role;
                setPendingDialog(null);
                commitRoleChange(updated);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      );
    })()}
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 9: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(video-gen): wire ActiveRulesCard, AlertDialog hub, generate guards, model-switch toasts"
```

---

## Task 9 — Manual end-to-end verification

No code changes. Verify all spec scenarios work.

- [ ] **Step 1: Open focus view with Veo 3.1 Lite, no images connected**
  - Generate → proceeds silently (prompt-only is valid, C1)

- [ ] **Step 2: Connect 1 image to a Veo 3.1 Lite node, open focus view**
  - Image shows 3 role buttons, none highlighted (no auto-assign)
  - Generate → "No frame selected" dialog appears (C2)
  - Click "Generate anyway" → generation starts
  - Click Cancel → stays on panel

- [ ] **Step 3: Assign start frame, leave end frame empty**
  - Generate → "End frame not assigned" dialog appears (C3)
  - Click "Generate anyway" → generation starts, `hasExplicitlySkippedEndFrame` set
  - Generate again immediately → no dialog (suppressed)
  - Connect a second image → `hasExplicitlySkippedEndFrame` clears → C3 fires again next Generate

- [ ] **Step 4: Veo 3.1 Fast — reference / frame conflict (§D)**
  - Assign one image as start frame
  - ActiveRulesCard shows: "Start/end frame selected → reference images unavailable"
  - Click "Ref" button on another image → "Can't combine these roles" dialog
  - Confirm → start frame cleared, reference assigned, ActiveRulesCard updates
  - Now assign start frame → "Start/end frame selected" dialog appears (reverse direction)
  - Confirm → reference cleared, start frame assigned

- [ ] **Step 5: Replace singleton (§G)**
  - Veo 3.1 Lite, 2 images, image A = start frame
  - Click "Start" on image B → "Replace start frame?" dialog
  - Confirm → image A becomes reference (Lite doesn't support refs... actually Lite has `maxReferenceImages: 0`, so image A should be unassigned) → image B = start frame

  Note: For Lite (`maxReferenceImages: 0`), the replace-singleton confirm handler demotes incumbent to unassigned (not reference).

- [ ] **Step 6: Kling model**
  - Switch to Kling 2.1, connect an image
  - Generate button disabled with tooltip "Kling requires a start frame…"
  - Assign start frame → Generate button enables

- [ ] **Step 7: Model switch with dropped roles (§E)**
  - Veo 3.1 Fast, assign 2 reference images
  - Switch to Veo 3.1 Lite → toast: `"Image X" removed from reference — not supported by Veo 3.1 Lite`
  - ActiveRulesCard should clear since no roles remain

- [ ] **Step 8: Final TypeScript check**

```
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```
git commit --allow-empty -m "chore: manual verification complete — video gen role UX redesign"
```

---

## Quick reference: what each task covers

| Task | Spec section |
|---|---|
| 0 | `UpstreamImage.filename` — needed by §E toasts and §G dialog |
| 1 | §B reason strings |
| 2 | §H AlertDialog dependency |
| 3 | §B ActiveRulesCard component |
| 4 | §A remove auto-assign on mount |
| 5 | §H pendingDialog state + DialogState type |
| 6 | §D + §G handleRoleChange with dialog triggers |
| 7 | §D connected-section clickable conflict buttons + §F "Clear roles" label |
| 8 | §B render card · §C0/C2/C3 generate guards · §D/§G dialog JSX · §E model-switch toasts |
| 9 | All scenarios from spec §Scenarios table |
