# Video Gen Frame & Role UX Redesign

**Date:** 2026-07-11
**Status:** Draft
**Area:** Canvas → Video Gen node → focus view (frame/role selection + active rules)

---

## Problem

The current video gen focus view assigns image roles silently and automatically — when images are connected, `applyDefaultImageRoles` fires on mount and assigns roles without the user choosing anything. This leads to:

- Users not knowing what role their images got or why
- Silent state changes when switching models (roles removed or reassigned without explanation)
- Role conflicts (start/end frame vs reference) communicated only via disabled buttons and hover tooltips — discoverable only by accident
- No permanent visibility of which constraint rules are currently active
- No warning when generating without any frame input (a common mistake)

---

## Goals

- Make frame/role assignment **intentional** — nothing auto-assigned on open; user picks
- Show **active constraints** as always-visible notes when rules are firing
- Replace silent conflict resolution with **confirmation dialogs**
- Warn at generate-click when frames are unassigned (connected images exist but user hasn't chosen roles)
- Smart model switching with toasts explaining what changed
- Prevent over-cap reference assignment via toggle (no silent cap enforcement)

## Non-goals

- No changes to the constraint rule engine (`evaluateConstraints`, `buildConstraintState`) — rules stay as-is
- No changes to video gen API routes
- No changes to Sora 2 behavior beyond what's described here
- No changes to image gen node (covered in a separate spec)

---

## Design

### A. Remove auto-assign on open

`applyDefaultImageRoles` is currently called in two places:
1. On mount inside `VideoGenFocusView` via a `useMemo`/`useEffect` that fires when `upstreamImages` or `imageInputs` changes
2. Inside `handleModelChange` after migrating roles

**Change (1):** Remove the auto-assign call on mount entirely. When the focus view opens, `imageRolesProp` from the parent is used as-is. If no roles are set, no roles are shown — the user sees unassigned images with all role buttons available.

**Change (2):** Keep auto-assign inside `handleModelChange` **only** for the smart-resolve path (see §D). It no longer fires on open.

**Effect:** First time a user opens the focus view with connected images, all images are unassigned. The panel nudges them to pick roles (see §C).

---

### B. Active rules card

A new `ActiveRulesCard` component renders in the left panel of `VideoGenFocusView`, directly below the connected section. It is **only rendered when at least one constraint is active** (`constraints.lockedParams` has entries OR `constraints.disableFrameInputs` OR `constraints.disableRefs` OR `constraints.disableGenerate`).

**Visual design:** Amber card matching the existing `refOverLimit` warning style in image-gen-focus-view — `border border-amber-300 bg-amber-50 rounded-md px-3 py-2.5`. No section header needed — the card is self-contained.

Each active constraint = one row: `Info` icon (Lucide, size-3, 1.5 stroke, text-amber-600) + user-friendly message string.

**What gets shown:**

| Constraint fires when | User-friendly message |
|---|---|
| `referenceCount > 0` (Veo Fast/Quality) | `"Reference images selected → duration locked to 8s, start/end frames unavailable"` |
| `hasStartFrame OR hasEndFrame` (Veo Fast/Quality) | `"Start/end frame selected → reference images unavailable"` |
| `hasEndFrame AND NOT hasStartFrame` | `"End frame needs a start frame before you can generate"` |
| `hasEndFrame` (any Veo) | `"End frame selected → duration locked to 8s"` |
| `hasStartFrame` (Sora 2) | `"Start frame selected → output size locked to match your image"` |

These messages replace the existing `reason` strings in `client-models.ts`. The `reason` field is rewritten to the user-friendly version — it's the single source of truth used in both the active rules card and tooltips.

**Updated `reason` strings in `client-models.ts`:**

| Rule ID | Old reason | New reason |
|---|---|---|
| `refs-lock-duration-disable-frames` | `"Reference images require 8s and can't be combined with start/end frame"` | `"Reference images selected → duration locked to 8s, start/end frames unavailable"` |
| `frames-disable-refs` | `"Start/end frame can't be combined with reference images"` | `"Start/end frame selected → reference images unavailable"` |
| `lite-end-frame-duration` | `"End frame requires 8s duration"` | `"End frame selected → duration locked to 8s"` |
| `end-frame-lock-duration` | `"End frame requires 8s duration"` | `"End frame selected → duration locked to 8s"` |
| `end-frame-requires-start-frame` | `"End frame requires a start frame"` | `"End frame needs a start frame before you can generate"` |
| `sora-start-frame-locks-size` | `"Size is set by the start frame image — cannot be changed"` | `"Start frame selected → output size locked to match your image"` |

The `ActiveRulesCard` reads from `EvaluatedConstraints` which already carries these reason strings via `lockedParamReasons`, `disableFrameInputsReason`, `disableRefsReason`, `disableGenerateReason`. It deduplicates: if two rules produce the same reason string, show it once.

**Component location:** `src/components/nodes/video-gen-active-rules-card.tsx` (new file).

```tsx
// Props
type Props = {
  constraints: EvaluatedConstraints;
};
```

Returns `null` when no constraints are active.

---

### C. Generate-click warnings and dialogs

Checks run when the Generate button is clicked, before the API call. C0 is a **disabled-button guard** (evaluated on render, not click); C1–C4 are click-time checks.

#### C0. Provider requires start frame (Kling)

Kling models (`provider === "kling"`) require a start frame to generate — the server throws if `startFrameUrl` is missing. This is a hard requirement, not a user choice.

When `currentModel.provider === "kling"` AND no `start_frame` in `effectiveImageRoles`: the Generate button is **disabled** (added to the existing `disabled` condition, same logic as `constraints.disableGenerate`) with tooltip:

> `"Kling requires a start frame — connect an image and assign it as Start Frame"`

No dialog — this is a missing prerequisite, not a conflict the user resolves by confirming.

This condition is checked on render, not at click time. It clears automatically when the user assigns a start frame.

#### C1. No images connected at all

If `upstreamImages.length === 0`: proceed silently. Generating from prompt only is valid and expected. No warning needed — the user intentionally has no image node connected.

#### C2. Images connected, none assigned

If `upstreamImages.length > 0` AND `Object.keys(effectiveImageRoles).length === 0`:

**Exception: if `currentModel.provider === "kling"`** — handled by C0 (disabled button). C2 does not fire for Kling.

For all other providers, show a confirmation dialog before generating:

> **"No frame selected"**
> You have connected images but haven't assigned any role (start frame, end frame, or reference). Generate anyway using only the text prompt?
>
> [Cancel] [Generate anyway]

If user clicks "Generate anyway" → proceed with empty roles.
If user clicks "Cancel" → dismiss, return to panel.

#### C3. Images connected, partial assignment (end frame slot available but unused)

Applies only when: the model supports end frame (`imageInputs.endFrame === true`) AND a start frame is assigned AND at least one connected image has no role AND no end frame is assigned.

Show a confirmation dialog:

> **"End frame not assigned"**
> You have a connected image without a role, and this model supports an end frame. Generate with just the start frame?
>
> [Cancel] [Generate anyway]

"Generate anyway" → proceed.
"Cancel" → dismiss, return to panel (user can manually assign the end frame from the connected section).

**No auto-assign button.** When multiple images are connected, auto-picking the first unassigned one may not be what the user wants. Let them choose from the panel instead.

This dialog does NOT fire if the user has already explicitly skipped the end frame (tracked via `hasExplicitlySkippedEndFrame` ref, set on "Generate anyway", cleared when `upstreamImages` changes).

#### C4. End frame without start frame → keep disabled button

No change from current behavior. `constraints.disableGenerate` disables the button with a tooltip. This is clear enough — end frame without start frame is an incomplete state, not a choice.

---

### D. Role conflict dialog (Veo Fast / Veo Quality)

These models have a mutex between start/end frames and reference images (rule `refs-lock-duration-disable-frames` / `frames-disable-refs`).

Currently: when one side is active, the other side's role buttons are disabled with a tooltip.

**New behavior:** When a user clicks a role button that would conflict with existing assignments, instead of silently ignoring the click (button is disabled), show a confirmation dialog:

> **"Can't combine these roles"**
> [Veo 3.1 Fast / Veo 3.1 Quality] doesn't support reference images together with start/end frames.
> Switching to reference images will remove your start/end frame assignments.
>
> [Cancel] [Switch to reference images]

(Mirror wording when switching the other direction: "Switching to start/end frames will remove your reference image assignments.")

**Implementation:** The role buttons for the conflicting side are no longer `disabled`. Instead they are visually `opacity-60` with a `cursor-pointer`. Clicking them triggers the dialog. If user confirms → clear conflicting roles, assign the new role. If user cancels → no change.

This means `getRoleTooltip` in `video-gen-connected-section.tsx` no longer returns the constraint reason for disabled-by-conflict cases — those are now handled by the dialog. It still returns "Not supported by this model" for structural capability mismatches (e.g. end frame on Sora 2).

**Component:** Inline `AlertDialog` (shadcn) inside `VideoGenConnectedSection` or lifted to `VideoGenFocusView`. Prefer lifting to focus view so the dialog has access to the full `effectiveImageRoles` state and `handleRoleChange`.

New prop on `VideoGenConnectedSection`:
```ts
onConflictingRoleRequest: (imageId: string, role: ImageRole) => void;
```

The focus view handles it by opening the conflict dialog. On confirm, it clears conflicting roles and calls `handleRoleChange`.

---

### E. Model switch — smart resolve with toast

`handleModelChange` already migrates roles smartly (removes unsupported, reassigns to start frame where possible). The only change: **add a toast** explaining what was dropped.

After computing `finalRoles`, compare to `currentRoles` to find dropped assignments. For each dropped image:

```ts
toast.info(`"${imageName}" removed from end frame — not supported by ${nextModel.label}`, { duration: 3500 });
```

If multiple images are dropped, one toast per dropped assignment (up to 3; collapse further with "...and N more").

No dialog — this is smart resolution the user can see in the toast and undo by switching back. This matches the existing locked-param toast pattern.

---

### F. Max reference cap — prevent over-cap via toggle

`getRoleTooltip` already returns `"Max N reference images"` when `referenceCount >= maxReferenceImages`. The button is currently disabled (grayed, tooltip on hover).

**No change to this behavior.** The cap is enforced by disabling the reference role button on images that would exceed it. The active rules card (§B) shows `"Reference images selected → duration locked to 8s, start/end frames unavailable"` when references are active, which implicitly communicates the reference mode. The cap itself (`Max 3`) is visible on hover.

**Add:** A "Clear all" button already exists in `VideoGenConnectedSection` (line 88–101). Ensure it is visible and labelled clearly as "Clear roles" (not "Reset") to help users unblock themselves when at cap.

---

### G. Role reassignment confirmation

When a user clicks `start_frame` or `end_frame` on image B, and image A already holds that role — currently `handleRoleChange` silently demotes image A to `reference`.

**New behavior:** Show a confirmation dialog:

> **"Replace start frame?"**
> "[Image A filename]" is currently set as the start frame. Replace it with this image?
>
> [Cancel] [Replace]

If user confirms → demote image A (to reference if references are allowed, else unassigned), assign image B.
If user cancels → no change.

This only fires for `start_frame` and `end_frame` (singleton roles). Reference images don't need confirmation since they're not singletons.

**Precedence:** If clicking a role button would BOTH trigger a conflict (§D) AND replace a singleton (§G), the conflict dialog (§D) takes priority — it's the broader action.

**Exception:** If image A has no filename (URL-only), show `"the current start frame"` instead of the filename.

---

### H. New `AlertDialog` usage

No `AlertDialog` exists in the codebase yet. Import from shadcn:

```tsx
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
```

Check if `alert-dialog` is already in `src/components/ui/` — if not, add via shadcn CLI: `npx shadcn@latest add alert-dialog`.

Three dialog states are managed in `VideoGenFocusView`:

```ts
type DialogState =
  | null
  | { type: "no-roles" }
  | { type: "missing-end-frame" }
  | { type: "role-conflict"; imageId: string; role: ImageRole; conflictingRole: "start_frame" | "end_frame" | "reference" }
  | { type: "replace-singleton"; imageId: string; role: "start_frame" | "end_frame"; incumbentId: string; incumbentName: string };

const [pendingDialog, setPendingDialog] = useState<DialogState>(null);
```

One `AlertDialog` renders at the bottom of the JSX, controlled by `pendingDialog`. Each dialog type maps to different title/description/action text and confirm handler.

---

### I. Files touched

| File | Change |
|---|---|
| `src/components/nodes/video-gen-focus-view.tsx` | Remove auto-assign on mount; add `pendingDialog` state; add generate-click checks (C2, C3); add conflict dialog trigger (D); add replace-singleton dialog (G); add model-switch toast (E); render `ActiveRulesCard` and `AlertDialog` |
| `src/components/nodes/video-gen-connected-section.tsx` | Add `onConflictingRoleRequest` prop; change conflict-disabled buttons from `disabled` to clickable-with-lower-opacity; keep structural-capability `disabled` |
| `src/components/nodes/video-gen-active-rules-card.tsx` | **New file** — `ActiveRulesCard` component |
| `src/lib/video-gen/client-models.ts` | Rewrite all `reason` strings to user-friendly versions |
| `src/components/ui/alert-dialog.tsx` | Add if not present (shadcn add) |

---

## Scenarios covered

| Scenario | Handling |
|---|---|
| Focus view opens, images connected, no roles set | Nothing auto-assigned; nudge visible in connected section |
| Generate with no images connected | Proceed silently |
| Generate with images connected, none assigned (non-Kling) | Dialog: "Generate with no frame input?" |
| Kling model, images connected, no start frame assigned | Generate button disabled with tooltip |
| Generate with start frame but end frame slot unused | Dialog: "Generate anyway or Cancel?" (no auto-assign) |
| Generate with end frame but no start frame | Button disabled (unchanged) |
| Click reference role when start/end frame active (Veo Fast/Quality) | Conflict dialog → confirm clears frame assignments |
| Click start/end frame role when references active (Veo Fast/Quality) | Conflict dialog → confirm clears reference assignments |
| Model switch drops unsupported roles | Smart resolve + toast per dropped role |
| Click start/end frame role already held by another image | Replace-singleton confirmation dialog |
| 4th reference image on Veo Fast (cap = 3) | Button disabled with tooltip "Max 3 reference images" (unchanged) |
| Active constraint in effect | ActiveRulesCard shows user-friendly note in left panel |

---

## Testing

- **Unit:** `applyDefaultImageRoles` — verify it no longer fires on mount (remove or guard the call)
- **Unit:** `handleRoleChange` conflict detection — given roles A→start_frame, clicking start_frame on B should return `{ type: "role-conflict" }` not silently reassign
- **Manual:** Connect 2 images to Veo Fast → open focus view → verify nothing auto-assigned → assign one as start frame → verify ActiveRulesCard is empty → assign one as reference → conflict dialog appears → confirm → verify start frame cleared
- **Manual:** Click Generate with images connected but no roles → dialog appears
- **Manual:** Switch from Veo Fast (with 2 references) to Veo Lite → toast explains what was removed
- `npx tsc --noEmit` passes
