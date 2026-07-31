# KB Onboarding Flow UX Improvements — Design

## Problem

Five small friction points in the client-creation → Brand KB onboarding → review flow, raised
together as one brainstorm:

1. Creating a client (`NewClientDialog`) leaves the operator on the clients list — they must
   find and click the new client, then find the KB link, to reach the KB setup page they almost
   always want next.
2. The Brand website field on the KB upload step is labeled "(optional)" while the two other
   equally-optional sources (Documents, Images) carry no such label — inconsistent, and slightly
   misleading since *some* source is required, just not this specific one.
3. Clicking "Approve all" on a review module leaves the operator on that same (now-empty-of-work)
   module instead of taking them to the next thing that needs attention.
4. The review step's footer has two separate buttons — an outline "Save" (left, only enabled
   when dirty) plus a red "Unsaved changes" badge, and a primary "Mark KB Ready" (right) whose
   *label itself* swaps to "Review all fields first" when disabled. Two buttons for what is
   really one sequential action (save, then mark ready), and a disabled button that quietly
   changes its own text is easy to miss as "this button, but blocked" vs. "a different button."
5. The Image Analysis module's empty state (all 7 fields null — no brand images were provided)
   reads "No brand images were analyzed," which sounds like an analysis failure rather than "you
   didn't upload anything, which is fine."

None of these are correctness bugs — the underlying data/gating logic (dirty tracking,
`computeReadyStatus`, per-field approve/reject) is already correct. This is UI clarity/flow
polish only.

## Scope

**In scope:** the five items above, touching three files:
`src/components/clients/new-client-dialog.tsx`,
`src/components/kb/kb-onboarding-upload-step.tsx`,
`src/components/kb/kb-onboarding-review-step.tsx`.

**Out of scope:** any change to `computeReadyStatus`, `handleApprove`/`handleReject`,
`markKBReadyAction`, `saveKBOutputAction`, or the field-review data model. No change to modules
other than Image Analysis's empty-state copy. No change to the edit-mode ("KB is Ready", already
finalized) entry path beyond folding it into the new single-button state machine unchanged.

## 1. Client creation → auto-redirect

`NewClientDialog` is used from exactly one place (`clients-home-tabs.tsx`, the clients list
page). In `handleCreate()`, after `createClientAction` resolves successfully:

- Keep the existing `toast.success(...)`, `reset()`, `setOpen(false)`, and the background logo
  upload (unchanged).
- Replace `router.refresh()` with `router.push(\`/clients/${client.id}/kb\`)`.

The dialog no longer needs to refresh the list in place — navigating away makes that moot.

## 2. Remove "(optional)" on Brand website

In `kb-onboarding-upload-step.tsx`, the website `<Label>` is:

```tsx
<Label htmlFor="website-url" className="text-sm font-medium">
  Brand website <span className="text-muted-foreground font-normal">(optional)</span>
</Label>
```

Drop the qualifier span, leaving just `Brand website`. The existing disabled-state hint below the
Extract button ("Add a website or upload a document to continue") already communicates that at
least one source is required — this doesn't change.

## 3. Auto-advance to the next module needing review

In `handleApproveAll(module)`, after applying the bulk-approve loop (unchanged), find the next
module — walking `MODULES` in order starting after the current one, wrapping around — whose
`getModuleStatus(getModuleFields(kb, key)) !== "ready"`, using the **post-approval** `kb` state
(the just-applied patches). If one is found, `setSelectedModule` to it. If every module is now
`"ready"` (nothing left to advance to), do nothing — stay on the current module, which will now
show its ready checkmark on the tab.

This only fires from the bulk "Approve all" action, not from individual per-field
approve/reject — those stay exactly as they are today (operator reviewing one field at a time
within a module isn't a "done with this module" signal).

## 4. Footer — single dynamic action button

Replace the current two-slot footer (left: badge + outline Save; right: primary Mark KB Ready)
with one right-aligned button whose content is a function of state:

| Condition | Label | Enabled | onClick |
|---|---|---|---|
| `dirty` | "Save changes" | yes (unless `saving`) | `handleSave` |
| `dirty && saving` | "Saving…" | no | — |
| `!dirty && isEditMode` | "KB is Ready" | no | — (unchanged from today) |
| `!dirty && !isEditMode && !isReady` | "Mark KB Ready" | no, with tooltip "Approve or reject every field first" | — |
| `!dirty && !isEditMode && isReady` | "Mark KB Ready" | yes (unless `markingReady`) | `handleMarkReady` |
| `!dirty && !isEditMode && markingReady` | "Saving…" | no | — |

The disabled-with-tooltip case uses the shadcn `Tooltip`/`TooltipTrigger`/`TooltipContent`
primitives (already imported elsewhere, e.g. `video-gen-params-panel.tsx`), with
`TooltipTrigger` wrapping a `<span>` around the (disabled) `Button` — not the native `title`
attribute, and not the button element directly, since a `disabled` button doesn't reliably fire
hover/focus events the trigger needs.

The left-side "Unsaved changes" badge and the separate outline Save button are removed entirely
— the single button's label ("Save changes" vs. "Mark KB Ready") is now the sole signal, and
there is nothing useful to Save when not dirty.

`dirty`, `isReady`, `isEditMode`, `saving`, `markingReady`, `handleSave`, `handleMarkReady` are
all pre-existing — no new state.

## 5. Empty-state copy

In the Image Analysis empty state:

```
- No brand images were analyzed
+ No images were uploaded
```

The sub-line ("Upload images in the Source Documents & Images drawer.") is unchanged.

## Testing

No component-render test harness exists in this repo (`vitest` runs with `environment: "node"`,
confirmed via `vitest.config.ts` — existing tests are all pure-logic). These changes are either
pure JSX/copy (items 2, 4's markup, 5) or a small pure-enough helper (item 3's "next module
needing review" lookup, item 1's redirect target string). Where the logic is extractable as a
pure function, it will be — the "find next needs-review module" lookup in particular unit-tests
cleanly without rendering anything (given a module order + per-module ready/not-ready booleans,
what index does it return, including the wrap-around and all-ready cases).

Manual verification: `tsc --noEmit` and `eslint` on touched files; no live browser click-through
(same constraint noted in prior sessions — this app needs authenticated client data to exercise
the onboarding flow end-to-end).
