# KB Onboarding Flow UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five UX friction points in the client-creation → Brand KB onboarding → review flow: auto-redirect after client creation, drop a misleading "(optional)" label, auto-advance modules after bulk-approve, consolidate the review step's footer into one state-driven button, and clarify the Image Analysis empty-state copy.

**Architecture:** Pure presentational/JSX changes in three existing client components, plus one new pure helper function (`findNextModuleNeedingReview`) extracted into `src/lib/kb/utils.ts` so the "which module to jump to" logic is unit-testable without a component-render harness (none exists in this repo — `vitest.config.ts` runs with `environment: "node"`).

**Tech Stack:** Next.js (App Router) client components, shadcn/Base UI `Tooltip` primitives, Zustand-free local `useState` (this flow doesn't use the canvas store), vitest for the one pure-logic unit.

## Global Constraints

- No changes to `computeReadyStatus` (`src/lib/kb/fill-rate.ts`), `handleApprove`/`handleReject`/`handleSave`/`markKBReadyAction`/`saveKBOutputAction`, or the field-review data model — this plan is UI-only.
- Disabled-button explanations use the shadcn `Tooltip`/`TooltipTrigger`/`TooltipContent` primitives from `@/components/ui/tooltip`, never the native `title` attribute — a `disabled` `Button` does not reliably fire the hover/focus events a tooltip needs, so `TooltipTrigger` must wrap a plain `<span>` around the button (see Task 4), matching the existing pattern in `src/components/nodes/video-gen-params-panel.tsx`.
- No new npm dependencies.
- No component-render test harness exists in this repo — verify JSX-only tasks via `tsc --noEmit` + `eslint` + manual code review, not a new test file. Only Task 3 (a genuinely pure function) gets a vitest unit test.

---

### Task 1: Auto-redirect to KB setup after creating a client

**Files:**
- Modify: `src/components/clients/new-client-dialog.tsx:48-78` (the `handleCreate` function body)

**Interfaces:**
- Consumes: `createClientAction({ name })` (existing, returns `{ id: string; name: string; ... }`), `useRouter()` from `next/navigation` (already imported at the top of this file).
- Produces: nothing consumed by later tasks — this task is self-contained.

- [ ] **Step 1: Replace the final `router.refresh()` with a redirect to the new client's KB page**

In `src/components/clients/new-client-dialog.tsx`, find:

```tsx
  function handleCreate() {
    if (!name.trim()) {
      toast.error("Client needs a name");
      return;
    }
    startTransition(async () => {
      try {
        const client = await createClientAction({ name: name.trim() });
        // Upload logo in background — do not block closing the dialog. Refresh
        // again once it finalizes so the row picks up the logo without a
        // manual reload (the refresh below fires before the upload's DB
        // write lands).
        if (logo) {
          void uploadViaSignedUrl(logo.file, {
            signEndpoint: `/api/clients/${client.id}/logo/sign`,
            finalizeEndpoint: `/api/clients/${client.id}/logo/finalize`,
          })
            .then(() => router.refresh())
            .catch(() => {
              // Non-critical: logo upload failure shows a separate toast if desired
            });
        }
        toast.success(`Created "${client.name}"`);
        reset();
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Failed to create client");
      }
    });
  }
```

Replace only the **final** `router.refresh();` (after `setOpen(false)`) with
`router.push(\`/clients/${client.slug}/kb\`);` — leave the `.then(() => router.refresh())` inside
the logo-upload branch untouched; it's an unrelated, already-shipped fix that refreshes
whatever page happens to be active once the background logo upload finalizes (harmless no-op
once the operator has already navigated to the KB page):

```tsx
  function handleCreate() {
    if (!name.trim()) {
      toast.error("Client needs a name");
      return;
    }
    startTransition(async () => {
      try {
        const client = await createClientAction({ name: name.trim() });
        // Upload logo in background — do not block closing the dialog. Refresh
        // again once it finalizes so the row picks up the logo without a
        // manual reload (the refresh below fires before the upload's DB
        // write lands).
        if (logo) {
          void uploadViaSignedUrl(logo.file, {
            signEndpoint: `/api/clients/${client.id}/logo/sign`,
            finalizeEndpoint: `/api/clients/${client.id}/logo/finalize`,
          })
            .then(() => router.refresh())
            .catch(() => {
              // Non-critical: logo upload failure shows a separate toast if desired
            });
        }
        toast.success(`Created "${client.name}"`);
        reset();
        setOpen(false);
        // Take the operator straight to KB setup — that's what "create a client" is for,
        // and staying on the list just makes them find-and-click the client themselves.
        router.push(`/clients/${client.slug}/kb`);
      } catch {
        toast.error("Failed to create client");
      }
    });
  }
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/components/clients/new-client-dialog.tsx
```
Expected: both exit with no output / no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/new-client-dialog.tsx
git commit -m "feat(clients): redirect to KB setup after creating a client"
```

---

### Task 2: Remove the "(optional)" label from Brand website

**Files:**
- Modify: `src/components/kb/kb-onboarding-upload-step.tsx:229-231`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — self-contained.

- [ ] **Step 1: Drop the qualifier span**

In `src/components/kb/kb-onboarding-upload-step.tsx`, find:

```tsx
          <Label htmlFor="website-url" className="text-sm font-medium">
            Brand website <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
```

Replace with:

```tsx
          <Label htmlFor="website-url" className="text-sm font-medium">
            Brand website
          </Label>
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/components/kb/kb-onboarding-upload-step.tsx
```
Expected: both exit with no output / no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kb/kb-onboarding-upload-step.tsx
git commit -m "fix(kb): drop misleading (optional) label on Brand website field"
```

---

### Task 3: Auto-advance to the next module needing review after "Approve all"

**Files:**
- Modify: `src/lib/kb/utils.ts` (add `findNextModuleNeedingReview`)
- Modify: `src/components/kb/kb-onboarding-review-step.tsx` (wire it into `handleApproveAll`)
- Test: `src/lib/kb/utils.test.ts` (new)

**Interfaces:**
- Consumes: `MODULES` (`src/lib/kb/constants.ts`, `{ key: ModuleKey; label: string }[]`), `ModuleKey` (`src/lib/kb/types.ts`).
- Produces: `findNextModuleNeedingReview(currentModule: ModuleKey, readyByModule: Record<ModuleKey, boolean>): ModuleKey | null`, exported from `src/lib/kb/utils.ts` — used by Task 3's own component wiring below; no other task depends on it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb/utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findNextModuleNeedingReview } from "./utils";
import type { ModuleKey } from "./types";

// MODULES order (src/lib/kb/constants.ts): brand_voice, visual_identity, image_analysis,
// audience_casting, image_direction, video_direction, compliance.
function allReady(overrides: Partial<Record<ModuleKey, boolean>> = {}): Record<ModuleKey, boolean> {
  return {
    brand_voice: true,
    visual_identity: true,
    image_analysis: true,
    audience_casting: true,
    image_direction: true,
    video_direction: true,
    compliance: true,
    ...overrides,
  };
}

describe("findNextModuleNeedingReview", () => {
  it("returns the immediate next module when it still needs review", () => {
    const ready = allReady({ image_analysis: false });
    expect(findNextModuleNeedingReview("visual_identity", ready)).toBe("image_analysis");
  });

  it("skips already-ready modules to find the next one that needs review", () => {
    const ready = allReady({ audience_casting: false });
    expect(findNextModuleNeedingReview("visual_identity", ready)).toBe("audience_casting");
  });

  it("wraps around past the end of the list", () => {
    const ready = allReady({ brand_voice: false });
    expect(findNextModuleNeedingReview("compliance", ready)).toBe("brand_voice");
  });

  it("returns null when every module is ready", () => {
    expect(findNextModuleNeedingReview("visual_identity", allReady())).toBeNull();
  });

  it("wraps all the way back to the current module if it's the only one not ready", () => {
    const ready = allReady({ brand_voice: false });
    expect(findNextModuleNeedingReview("brand_voice", ready)).toBe("brand_voice");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/kb/utils.test.ts`
Expected: FAIL — `findNextModuleNeedingReview` is not exported from `./utils` (module has no such export).

- [ ] **Step 3: Implement `findNextModuleNeedingReview`**

In `src/lib/kb/utils.ts`, add the import and function. The top of the file currently reads:

```ts
import type { TraceableBrandKB, KBField } from "./schema";
import type { ModuleKey, FieldPath, StagedChanges } from "./types";
```

Change to:

```ts
import type { TraceableBrandKB, KBField } from "./schema";
import type { ModuleKey, FieldPath, StagedChanges } from "./types";
import { MODULES } from "./constants";
```

Then, immediately after the existing `getFieldPath` function (the `// ── KB module helpers ──` section), add:

```ts
// Finds the next module (in MODULES order, wrapping around past the end) that isn't fully
// reviewed yet — used to auto-advance the review step off a module the operator just cleared
// with "Approve all". readyByModule reflects each module's current
// getModuleStatus(getModuleFields(kb, key)) === "ready" state; the caller computes it (see
// handleApproveAll in kb-onboarding-review-step.tsx) since that already depends on the live kb
// state and getModuleStatus, which this pure function has no reason to import.
export function findNextModuleNeedingReview(
  currentModule: ModuleKey,
  readyByModule: Record<ModuleKey, boolean>,
): ModuleKey | null {
  const order = MODULES.map((m) => m.key);
  const startIdx = order.indexOf(currentModule);
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(startIdx + i) % order.length];
    if (!readyByModule[candidate]) return candidate;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/kb/utils.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into `handleApproveAll`**

In `src/components/kb/kb-onboarding-review-step.tsx`, find the import block that currently reads:

```tsx
import { getModuleFields, getFieldPath, buildChangeSummary } from "@/lib/kb/utils";
```

Change to:

```tsx
import {
  getModuleFields,
  getFieldPath,
  buildChangeSummary,
  findNextModuleNeedingReview,
} from "@/lib/kb/utils";
```

Then find `handleApproveAll`:

```tsx
  function handleApproveAll(module: ModuleKey) {
    const fields = getModuleFields(kb, module);
    let count = 0;
    Object.entries(fields).forEach(([fieldKey, field]) => {
      if (field.status === "needs_review") {
        patchField(getFieldPath(module, fieldKey), { status: "approved" });
        count++;
      }
    });
    if (count > 0) toast.success(`${count} field${count === 1 ? "" : "s"} approved`);
  }
```

Replace with:

```tsx
  function handleApproveAll(module: ModuleKey) {
    const fields = getModuleFields(kb, module);
    let count = 0;
    Object.entries(fields).forEach(([fieldKey, field]) => {
      if (field.status === "needs_review") {
        patchField(getFieldPath(module, fieldKey), { status: "approved" });
        count++;
      }
    });
    if (count > 0) toast.success(`${count} field${count === 1 ? "" : "s"} approved`);

    // The module we just bulk-approved is now ready by definition (every needs_review field
    // was just flipped to approved) — reading it back from `kb` here would race the pending
    // setState above, so treat it as ready directly instead. Every other module's readiness
    // is unaffected by this action, so it's safe to read straight from the current `kb`.
    const readyByModule = Object.fromEntries(
      MODULES.map(({ key }) => [
        key,
        key === module ? true : getModuleStatus(getModuleFields(kb, key)) === "ready",
      ]),
    ) as Record<ModuleKey, boolean>;
    const next = findNextModuleNeedingReview(module, readyByModule);
    if (next) setSelectedModule(next);
  }
```

`MODULES` and `getModuleStatus` are already imported in this file (`@/lib/kb/constants` and `@/components/kb/kb-module-card` respectively) — no new imports needed for this step.

- [ ] **Step 6: Type-check, lint, and re-run the unit test**

Run:
```bash
npx tsc --noEmit
npx eslint src/lib/kb/utils.ts src/components/kb/kb-onboarding-review-step.tsx
npx vitest run src/lib/kb/utils.test.ts
```
Expected: no type/lint errors; 5 tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kb/utils.ts src/lib/kb/utils.test.ts src/components/kb/kb-onboarding-review-step.tsx
git commit -m "feat(kb): auto-advance to next module needing review after Approve all"
```

---

### Task 4: Consolidate the review-step footer into one state-driven button

**Files:**
- Modify: `src/components/kb/kb-onboarding-review-step.tsx`

**Interfaces:**
- Consumes: `dirty`, `isReady`, `isEditMode`, `saving`, `markingReady`, `handleSave`, `handleMarkReady` — all pre-existing in this component (no signature changes). `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip` (existing shared component, not modified).
- Produces: nothing consumed by later tasks — self-contained.

- [ ] **Step 1: Import the Tooltip primitives**

In `src/components/kb/kb-onboarding-review-step.tsx`, find the `Sheet` import block:

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
```

Add immediately after it:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
```

- [ ] **Step 2: Compute the single footer action as a derived value**

Find the `allImageAnalysisNull` derived value:

```tsx
  const allImageAnalysisNull =
    selectedModule === "image_analysis" &&
    Object.values(currentFields).every((f) => f.value === null);
```

Immediately after it, add:

```tsx
  // Single footer action — Save while there are unsaved edits, otherwise Mark KB Ready (or
  // its edit-mode/in-flight variants). Referencing handleSave/handleMarkReady here is safe
  // even though they're declared later in this component: both are `function` declarations,
  // which are hoisted within the component's function body.
  type FooterAction = {
    label: string;
    disabled: boolean;
    onClick?: () => void;
    tooltip?: string;
  };
  const footerAction: FooterAction = dirty
    ? { label: saving ? "Saving…" : "Save changes", disabled: saving, onClick: handleSave }
    : isEditMode
      ? { label: "KB is Ready", disabled: true }
      : !isReady
        ? {
            label: "Mark KB Ready",
            disabled: true,
            tooltip: "Approve or reject every field first",
          }
        : {
            label: markingReady ? "Saving…" : "Mark KB Ready",
            disabled: markingReady,
            onClick: handleMarkReady,
          };
```

- [ ] **Step 3: Replace the two-button footer with the single dynamic button**

Find:

```tsx
      {/* Fixed header — global actions + module tabs */}
      <div className="shrink-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          {/* Left: global edit state + Save (secondary) */}
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Unsaved changes
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {/* Right: Mark KB Ready (primary) — the global finalize action */}
          <Button
            size="sm"
            onClick={handleMarkReady}
            disabled={!isReady || markingReady || isEditMode || dirty}
            title={
              isEditMode
                ? undefined
                : dirty
                  ? "Save your changes before marking the KB ready"
                  : !isReady
                    ? "Approve or reject every field first"
                    : undefined
            }
          >
            <CheckCircle2Icon className="size-4" />
            {markingReady
              ? "Saving…"
              : isEditMode
                ? "KB is Ready"
                : isReady
                  ? "Mark KB Ready"
                  : "Review all fields first"}
          </Button>
        </div>
```

Replace with:

```tsx
      {/* Fixed header — global actions + module tabs */}
      <div className="shrink-0">
        <div className="mb-2 flex items-center justify-end gap-3">
          {/* Single dynamic action: "Save changes" while dirty, otherwise Mark KB Ready
             (or its edit-mode/in-flight variants) — see the footerAction derivation above. */}
          {footerAction.tooltip ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-block" />}>
                <Button size="sm" disabled={footerAction.disabled}>
                  <CheckCircle2Icon className="size-4" />
                  {footerAction.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{footerAction.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <Button size="sm" onClick={footerAction.onClick} disabled={footerAction.disabled}>
              <CheckCircle2Icon className="size-4" />
              {footerAction.label}
            </Button>
          )}
        </div>
```

Note the `justify-between` → `justify-end` change on the row's className — there is now only one item in this row.

- [ ] **Step 4: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/components/kb/kb-onboarding-review-step.tsx
```
Expected: both exit with no output / no errors. (`CheckCircle2Icon` remains used, so no unused-import lint warning.)

- [ ] **Step 5: Commit**

```bash
git add src/components/kb/kb-onboarding-review-step.tsx
git commit -m "feat(kb): consolidate review-step footer into one state-driven action button"
```

---

### Task 5: Clarify the Image Analysis empty-state copy

**Files:**
- Modify: `src/components/kb/kb-onboarding-review-step.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — self-contained.

- [ ] **Step 1: Change the empty-state heading**

Find:

```tsx
                <p className="text-sm font-medium text-muted-foreground">
                  No brand images were analyzed
                </p>
```

Replace with:

```tsx
                <p className="text-sm font-medium text-muted-foreground">
                  No images were uploaded
                </p>
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/components/kb/kb-onboarding-review-step.tsx
```
Expected: both exit with no output / no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kb/kb-onboarding-review-step.tsx
git commit -m "fix(kb): clarify Image Analysis empty-state copy"
```

---

## Final verification

- [ ] **Run the full test suite once more**

```bash
npx vitest run
```
Expected: all tests pass, including the 5 new `findNextModuleNeedingReview` tests.

- [ ] **Full type-check and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clients/new-client-dialog.tsx src/components/kb/kb-onboarding-upload-step.tsx src/components/kb/kb-onboarding-review-step.tsx src/lib/kb/utils.ts src/lib/kb/utils.test.ts
```
Expected: no errors.
