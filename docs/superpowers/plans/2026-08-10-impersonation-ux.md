# Impersonation UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the impersonation interface so an operator can never miss that they are inside a customer's account, and so every transition explains itself and acknowledges itself.

**Architecture:** The banner becomes sticky chrome above the app header, with read-only and elevated rendered as visually distinct states. All state-dependent *decisions* move into a pure module (`impersonation-ui.ts`) so they are unit-testable in this repo's node-environment vitest setup; the components stay thin presentation. The three server actions drop their `redirect()` calls so the client can toast before navigating.

**Tech Stack:** Next.js (App Router, RSC + server actions), React 19, Tailwind v4, Base UI via shadcn (`render` prop, not `asChild`), `sonner` for toasts, `lucide-react` icons, vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-impersonation-ux-design.md`
**ADR:** D139, D140 (`2026-05-30-creativeos-staging-roadmap.md` §7)

## Global Constraints

- **Controls must be shadcn primitives** from `src/components/ui/*`. Never a raw `<button>`. Base UI composes via the `render` prop, never `asChild`.
- **Reuse, don't redefine.** `initials()` already exists at `@/lib/format/initials` — import it. `cn()` is at `@/lib/utils`.
- **Design system:** two font families only (Clash Display via `font-display`, Gilroy default). Purple `#5829c7` is the brand colour, used sparingly and **never as a large background fill** — in this feature it appears only as a 3px rule. Yellow `#ffca2d` appears only as a soft ~10% tint. Use `.text-eyebrow` for tracked small-caps labels. Lucide icons at `strokeWidth={1.5}`.
- **Operator-facing vocabulary is "Enable editing"**, never "elevated mode". The internal term is unchanged in code, ADRs, and the `elevated_mode_entered` audit event.
- **Never mention the 2-hour TTL** in any user-facing copy, and build no countdown or expiry warning (spec §2, deferred by decision).
- **Do not add `exitElevatedMode()`** or any path back to read-only (spec §2, deferred by decision). Elevated is one-way for the session, and the confirm dialog must say so.
- **Testing convention:** `vitest.config.ts` is `environment: "node"` and the repo has no `@testing-library/react`. Do **not** add a DOM test stack. Test pure functions; verify rendering manually in Task 7.
- Run a single test file with `npx vitest run <path>`. Run everything with `npm test`.

---

### Task 1: De-duplicate the read-only gate message

The string `"Read-only while impersonating — enter elevated mode to make changes."` is currently written out twice, which is how the wording drifts. It moves to one constant, and its wording updates to the new vocabulary.

**Files:**
- Create: `src/lib/auth/constants.ts`
- Create: `src/lib/auth/constants.test.ts`
- Modify: `src/lib/api/route-helpers.ts:33-36`
- Modify: `src/lib/actions/with-action.ts:18-22`

**Interfaces:**
- Consumes: nothing.
- Produces: `IMPERSONATION_READ_ONLY_MESSAGE: string` from `@/lib/auth/constants`.

`constants.ts` must **not** import `server-only` — client components import this message in Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/constants.test.ts`. This is the anti-drift guard: it asserts both consumers emit the *same* string, which is the actual bug being prevented.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "./constants";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));

import { assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { withAction } from "@/lib/actions/with-action";

describe("IMPERSONATION_READ_ONLY_MESSAGE", () => {
  beforeEach(() => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "org-1",
      elevated: false,
    });
  });

  it("uses the new vocabulary, not the internal term", () => {
    expect(IMPERSONATION_READ_ONLY_MESSAGE).toContain("Enable editing");
    expect(IMPERSONATION_READ_ONLY_MESSAGE).not.toContain("elevated");
  });

  it("is the exact message the route-helper gate returns", async () => {
    const res = await assertImpersonationWriteAllowed(
      new Request("https://x.test/api/thing", { method: "POST" }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({
      error: IMPERSONATION_READ_ONLY_MESSAGE,
    });
  });

  it("is the exact message the server-action gate throws", async () => {
    await expect(withAction("someAction", async () => "done")).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/constants.test.ts`
Expected: FAIL — cannot resolve `./constants` (the module does not exist yet).

- [ ] **Step 3: Create the constant**

Create `src/lib/auth/constants.ts`:

```ts
// The single source of truth for the Stage 4 write-gate's rejection message (D140).
// Both gates — assertImpersonationWriteAllowed (API routes) and withAction (server
// actions) — return this exact string, so the wording cannot drift between the two
// surfaces. Deliberately NOT "server-only": client components surface this message
// too, so it has to be importable from both environments.
export const IMPERSONATION_READ_ONLY_MESSAGE =
  "Read-only while impersonating — Enable editing to make changes.";
```

- [ ] **Step 4: Point both gates at it**

In `src/lib/api/route-helpers.ts`, add to the imports:

```ts
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";
```

and replace the literal:

```ts
  if (!impersonation.elevated) {
    return apiError(IMPERSONATION_READ_ONLY_MESSAGE, 403);
  }
```

In `src/lib/actions/with-action.ts`, add to the imports:

```ts
import { IMPERSONATION_READ_ONLY_MESSAGE } from "@/lib/auth/constants";
```

and replace the literal:

```ts
  if (impersonation.isImpersonating && !impersonation.elevated) {
    throw new Error(IMPERSONATION_READ_ONLY_MESSAGE);
  }
```

- [ ] **Step 5: Run the new test and both existing suites**

Run: `npx vitest run src/lib/auth/constants.test.ts src/lib/api/route-helpers.test.ts src/lib/actions/with-action.test.ts`
Expected: the new file PASSES. The two existing suites may FAIL if they assert the old literal — if so, update those assertions to import and compare against `IMPERSONATION_READ_ONLY_MESSAGE` rather than re-typing the string, then re-run until all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/constants.ts src/lib/auth/constants.test.ts src/lib/api/route-helpers.ts src/lib/actions/with-action.ts src/lib/api/route-helpers.test.ts src/lib/actions/with-action.test.ts
git commit -m "refactor(impersonation): single constant for the read-only gate message"
```

---

### Task 2: Pure presentation module for the banner's two states

Every state-dependent decision the banner makes lives here as a pure function, so it is testable under `environment: "node"` without a DOM.

**Files:**
- Create: `src/lib/auth/impersonation-ui.ts`
- Create: `src/lib/auth/impersonation-ui.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `@/lib/auth/impersonation-ui`:
  - `type ImpersonationBannerPresentation = { eyebrow: string; stateLabel: string; barClass: string; ruleClass: string; showEnableEditing: boolean }`
  - `bannerPresentation(elevated: boolean): ImpersonationBannerPresentation`
  - `headerTopClass(isImpersonating: boolean): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/impersonation-ui.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bannerPresentation, headerTopClass } from "./impersonation-ui";

describe("bannerPresentation", () => {
  it("reads as read-only, and offers Enable editing, when not elevated", () => {
    const p = bannerPresentation(false);
    expect(p.eyebrow).toBe("Viewing as");
    expect(p.stateLabel).toBe("Read-only");
    expect(p.showEnableEditing).toBe(true);
  });

  it("reads as live editing, and hides Enable editing, when elevated", () => {
    const p = bannerPresentation(true);
    expect(p.eyebrow).toBe("Editing as");
    expect(p.stateLabel).toBe("Changes are live");
    expect(p.showEnableEditing).toBe(false);
  });

  it("gives the two states visually distinct treatments", () => {
    expect(bannerPresentation(true).barClass).not.toBe(
      bannerPresentation(false).barClass,
    );
    expect(bannerPresentation(true).ruleClass).not.toBe(
      bannerPresentation(false).ruleClass,
    );
  });

  it("never leaks the internal term to an operator-facing string", () => {
    for (const p of [bannerPresentation(true), bannerPresentation(false)]) {
      expect(`${p.eyebrow} ${p.stateLabel}`.toLowerCase()).not.toContain("elevated");
    }
  });
});

describe("headerTopClass", () => {
  // The regression this guards: the banner was not sticky while the header below it
  // was, so scrolling erased every trace of impersonation.
  it("sits flush at the top when not impersonating", () => {
    expect(headerTopClass(false)).toBe("top-0");
  });

  it("drops below the banner while impersonating", () => {
    expect(headerTopClass(true)).toBe("top-11");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/impersonation-ui.test.ts`
Expected: FAIL — cannot resolve `./impersonation-ui`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/impersonation-ui.ts`:

```ts
// Pure presentation decisions for the impersonation banner (D139). Kept out of the
// components so they are unit-testable under this repo's node-environment vitest
// setup — there is no DOM test stack here by design.

export type ImpersonationBannerPresentation = {
  /** Small-caps label; rendered through `.text-eyebrow`, which uppercases it. */
  eyebrow: string;
  stateLabel: string;
  /** Background + border for the bar. */
  barClass: string;
  /** The 3px left rule — the state's strongest colour signal. */
  ruleClass: string;
  showEnableEditing: boolean;
};

export function bannerPresentation(
  elevated: boolean,
): ImpersonationBannerPresentation {
  if (elevated) {
    // Brand yellow as a soft ~10% tint only, per the design system's "yellow only as
    // a soft glow" rule — enough to change the bar's temperature, never a flat fill.
    return {
      eyebrow: "Editing as",
      stateLabel: "Changes are live",
      barClass: "bg-[#ffca2d]/10 border-[#ffca2d]/40",
      ruleClass: "bg-[#ffca2d]",
      showEnableEditing: false,
    };
  }
  return {
    eyebrow: "Viewing as",
    stateLabel: "Read-only",
    barClass: "bg-background border-border",
    ruleClass: "bg-primary",
    showEnableEditing: true,
  };
}

// The banner is `sticky top-0 h-11`, so the header has to start below it — otherwise
// the two overlap and the banner is the one that loses.
export function headerTopClass(isImpersonating: boolean): string {
  return isImpersonating ? "top-11" : "top-0";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/impersonation-ui.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/impersonation-ui.ts src/lib/auth/impersonation-ui.test.ts
git commit -m "feat(impersonation): pure presentation module for the banner's two states"
```

---

### Task 3: Server actions return instead of redirecting

**Files:**
- Modify: `src/lib/actions/impersonation.ts` (whole file)
- Modify: `src/lib/actions/impersonation.test.ts` (whole file)

**Interfaces:**
- Consumes: `startImpersonation`, `enterElevatedMode`, `endImpersonation` from `@/lib/auth/impersonation` (unchanged).
- Produces, from `@/lib/actions/impersonation`:
  - `enterImpersonationAction(orgId: string): Promise<void>`
  - `enterElevatedModeAction(): Promise<void>`
  - `exitImpersonationAction(): Promise<void>` — **note the dropped `orgId` parameter**; it existed only to build the redirect target, and the client now owns navigation.

- [ ] **Step 1: Rewrite the test to the new contract**

Replace the entire contents of `src/lib/actions/impersonation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted() required: vi.mock() factories are hoisted above plain top-level consts.
const {
  redirectMock,
  revalidatePathMock,
  startImpersonationMock,
  enterElevatedModeMock,
  endImpersonationMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  startImpersonationMock: vi.fn(async () => undefined),
  enterElevatedModeMock: vi.fn(async () => undefined),
  endImpersonationMock: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  startImpersonation: startImpersonationMock,
  enterElevatedMode: enterElevatedModeMock,
  endImpersonation: endImpersonationMock,
}));

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  enterImpersonationAction,
  enterElevatedModeAction,
  exitImpersonationAction,
} from "./impersonation";

describe("impersonation server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // D140: a server redirect() unmounts the caller before it can toast, which is the
  // whole reason these transitions felt like nothing happened. None of them redirect.
  it("enterImpersonationAction requires super_admin, starts the session, and returns", async () => {
    await expect(enterImpersonationAction("org-2")).resolves.toBeUndefined();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(startImpersonationMock).toHaveBeenCalledWith("org-2");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("enterElevatedModeAction requires super_admin and flips elevated mode", async () => {
    await expect(enterElevatedModeAction()).resolves.toBeUndefined();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(enterElevatedModeMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("exitImpersonationAction ends the session and returns, taking no orgId", async () => {
    await expect(exitImpersonationAction()).resolves.toBeUndefined();
    expect(endImpersonationMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("propagates a failure instead of swallowing it, so the client can toast it", async () => {
    startImpersonationMock.mockRejectedValueOnce(new Error("Organization not found."));
    await expect(enterImpersonationAction("nope")).rejects.toThrow(
      "Organization not found.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/actions/impersonation.test.ts`
Expected: FAIL — the first test rejects with `REDIRECT:/` instead of resolving, and `exitImpersonationAction()` is called with no argument where one is still required.

- [ ] **Step 3: Rewrite the actions**

Replace the entire contents of `src/lib/actions/impersonation.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  startImpersonation,
  enterElevatedMode,
  endImpersonation,
} from "@/lib/auth/impersonation";

// D140: none of these redirect. A server-side redirect() unmounts the calling client
// component before it can render an acknowledgement, which made all three transitions
// structurally incapable of toasting. Each does its work, revalidates the layout so the
// banner re-renders in its new state, and returns — the client navigates and toasts.

export async function enterImpersonationAction(orgId: string): Promise<void> {
  await requireSuperAdmin();
  await startImpersonation(orgId);
  revalidatePath("/", "layout");
}

export async function enterElevatedModeAction(): Promise<void> {
  await requireSuperAdmin();
  await enterElevatedMode();
  revalidatePath("/", "layout");
}

// Takes no orgId: the parameter only ever existed to build the redirect target, and the
// banner already knows which org to send the operator back to.
export async function exitImpersonationAction(): Promise<void> {
  await endImpersonation();
  revalidatePath("/", "layout");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/actions/impersonation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm nothing else called the old signature**

Run: `npx tsc --noEmit`
Expected: errors **only** in `src/components/layout/impersonation-banner-actions.tsx` (still passing `orgId` to `exitImpersonationAction`) and `src/app/admin/orgs/[id]/enter-impersonation-button.tsx`. Both are rewritten in Tasks 4 and 5. Any *other* file in the error list is an unexpected call site — fix it before continuing.

`src/lib/actions/with-action-coverage.test.ts` also names all three actions, in its `ALLOWLIST`. It keys on the exported function *name*, not the signature, and none of the names change — so it needs no edit and must stay green. If it goes red, you renamed something you shouldn't have.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/impersonation.ts src/lib/actions/impersonation.test.ts
git commit -m "refactor(impersonation): actions return instead of redirecting (D140)"
```

Note: the tree will not typecheck cleanly until Task 5. That is expected and confined to the two files named above.

---

### Task 4: Rebuild the banner as sticky chrome

This is the task that fixes the actual safety bug: the banner was not sticky while the header below it was.

**Files:**
- Modify: `src/components/layout/impersonation-banner.tsx` (whole file)
- Modify: `src/components/layout/impersonation-banner-actions.tsx` (whole file)
- Modify: `src/app/layout.tsx:39-60`

**Interfaces:**
- Consumes: `bannerPresentation`, `headerTopClass` (Task 2); `enterElevatedModeAction`, `exitImpersonationAction` (Task 3); `initials` from `@/lib/format/initials`; `cn` from `@/lib/utils`.
- Produces: `<ImpersonationBanner />` (server, no props); `<ImpersonationBannerActions orgId orgName elevated showEnableEditing />` (client).

- [ ] **Step 1: Rewrite the banner's client actions**

Replace the entire contents of `src/components/layout/impersonation-banner-actions.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  enterElevatedModeAction,
  exitImpersonationAction,
} from "@/lib/actions/impersonation";

export function ImpersonationBannerActions({
  orgId,
  orgName,
  elevated,
  showEnableEditing,
}: {
  orgId: string;
  orgName: string;
  elevated: boolean;
  showEnableEditing: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function enableEditing() {
    startTransition(async () => {
      try {
        await enterElevatedModeAction();
        toast.warning(`Editing enabled for ${orgName}`, {
          description: "Changes you make now are written to their real data.",
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't enable editing.");
      }
    });
  }

  function exit() {
    startTransition(async () => {
      try {
        await exitImpersonationAction();
        toast.success("Exited — back in your own account");
        router.push(`/admin/orgs/${orgId}`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't exit impersonation.",
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {showEnableEditing && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" size="xs" variant="outline" disabled={isPending}>
                Enable editing
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enable editing for {orgName}?</AlertDialogTitle>
              {/* States the one-way nature explicitly: there is deliberately no path
                  back to read-only short of exiting (spec §2). */}
              <AlertDialogDescription>
                You&rsquo;ll be able to create, edit and delete {orgName}&rsquo;s real
                data. Every change is recorded against your account. To go back to
                read-only you&rsquo;ll need to exit and re-enter.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={enableEditing}>
                Enable editing
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={isPending}
        onClick={exit}
      >
        Exit
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the banner itself**

Replace the entire contents of `src/components/layout/impersonation-banner.tsx`:

```tsx
import { Eye, Unlock } from "lucide-react";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getOrgById } from "@/lib/db/organizations";
import { bannerPresentation } from "@/lib/auth/impersonation-ui";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";
import { ImpersonationBannerActions } from "./impersonation-banner-actions";

// Server component: resolves impersonation state + the target org's display name, then
// hands off to the client component for the interactive controls. Renders nothing when
// not impersonating — no layout shift, no empty bar.
//
// Sticky is load-bearing (D139): the header below this is itself sticky, so a
// non-sticky banner scrolled away and left the app looking entirely normal while the
// operator was still writing to a customer's account.
export async function ImpersonationBanner() {
  const state = await resolveImpersonationState();
  if (!state.isImpersonating) return null;

  // An org deleted mid-session is a race startImpersonation's own existence check
  // cannot prevent. Degrade to a placeholder name rather than disappearing, so the
  // operator always keeps a working Exit button instead of being stranded.
  const org = await getOrgById(state.targetOrgId);
  const orgName = org?.name ?? "Organization no longer exists";

  const presentation = bannerPresentation(state.elevated);
  const StateIcon = state.elevated ? Unlock : Eye;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex h-11 shrink-0 items-center gap-3 border-b px-6",
        presentation.barClass,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          presentation.ruleClass,
        )}
      />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold text-white">
        {initials(orgName)}
      </span>
      <span className="text-eyebrow text-neutral-500">
        {presentation.eyebrow}
      </span>
      <span className="truncate font-semibold text-neutral-900">{orgName}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-500">
        <StateIcon className="size-3.5" strokeWidth={1.5} />
        {presentation.stateLabel}
        {state.elevated && (
          <span
            aria-hidden
            className="size-1.5 animate-pulse rounded-full bg-[#ffca2d]"
          />
        )}
      </span>
      <div className="ml-auto shrink-0">
        <ImpersonationBannerActions
          orgId={state.targetOrgId}
          orgName={orgName}
          elevated={state.elevated}
          showEnableEditing={presentation.showEnableEditing}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Offset the header in the root layout**

In `src/app/layout.tsx`, add these imports alongside the existing ones:

```tsx
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { headerTopClass } from "@/lib/auth/impersonation-ui";
import { cn } from "@/lib/utils";
```

Then, inside `RootLayout`, before the `return`:

```tsx
  // resolveImpersonationState is cache()d per request, so this is deduped with the
  // banner's own call — it costs nothing, and it keeps the header's offset colocated
  // with the element it offsets against.
  const { isImpersonating } = await resolveImpersonationState();
```

and change the `<header>` opening tag from its current `className={...} sticky top-0 ...` to:

```tsx
        <header
          className={cn(
            "sticky z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md",
            headerTopClass(isImpersonating),
          )}
        >
```

Leave `<ImpersonationBanner />` where it is, immediately above the header.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: the only remaining errors are in `src/app/admin/orgs/[id]/enter-impersonation-button.tsx` (Task 5).

Run: `npx eslint src/components/layout/impersonation-banner.tsx src/components/layout/impersonation-banner-actions.tsx src/app/layout.tsx`
Expected: no errors.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, whole suite. No existing test asserts on the banner's markup (verified — the banner has never had a rendering test), so nothing here should need updating.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/impersonation-banner.tsx src/components/layout/impersonation-banner-actions.tsx src/app/layout.tsx
git commit -m "feat(impersonation): sticky banner with distinct read-only and editing states (D139)"
```

---

### Task 5: Confirm dialog and toast on entry

**Files:**
- Modify: `src/app/admin/orgs/[id]/enter-impersonation-button.tsx` (whole file)

**Interfaces:**
- Consumes: `enterImpersonationAction(orgId)` (Task 3).
- Produces: `<EnterImpersonationButton orgId orgName />` — **note the new `orgName` prop**, needed for the dialog copy and the toast. Task 6 passes it.

- [ ] **Step 1: Rewrite the button**

Replace the entire contents of `src/app/admin/orgs/[id]/enter-impersonation-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { enterImpersonationAction } from "@/lib/actions/impersonation";

export function EnterImpersonationButton({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function enter() {
    startTransition(async () => {
      try {
        await enterImpersonationAction(orgId);
        toast.success(`Now viewing as ${orgName}`, {
          description: "Read-only. Everything you see is their data.",
        });
        router.push("/");
      } catch (e) {
        // The action no longer redirects (D140), so a rejection is unambiguously a
        // real failure — no unstable_rethrow dance needed to tell the two apart.
        toast.error(
          e instanceof Error ? e.message : "Couldn't enter impersonation.",
        );
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" disabled={isPending}>
            Enter as this org
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enter as {orgName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You&rsquo;ll see CreativeOS exactly as {orgName} sees it, using their
            data. You&rsquo;ll be read-only — you can look around but not change
            anything. This session is recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={enter}>
            Enter as {orgName}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: one remaining error — `src/app/admin/orgs/[id]/page.tsx` does not pass the new `orgName` prop. Task 6 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/orgs/[id]/enter-impersonation-button.tsx
git commit -m "feat(impersonation): explain entry in a confirm dialog, acknowledge with a toast"
```

---

### Task 6: Reflect the already-impersonating state on the org page

The page currently offers "Enter as this org" even while you are already inside that very org.

**Files:**
- Modify: `src/app/admin/orgs/[id]/page.tsx:1-30` (imports) and `:77-82` (the header row)

**Interfaces:**
- Consumes: `<EnterImpersonationButton orgId orgName />` (Task 5); `resolveImpersonationState` from `@/lib/auth/impersonation`; `bannerPresentation` is **not** used here.

- [ ] **Step 1: Add the imports**

In `src/app/admin/orgs/[id]/page.tsx`, add alongside the existing imports:

```tsx
import { Eye } from "lucide-react";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
```

- [ ] **Step 2: Resolve the state**

Immediately after the existing `if (!org) notFound();` line, add:

```tsx
  const impersonation = await resolveImpersonationState();
  const isViewingThisOrg =
    impersonation.isImpersonating && impersonation.targetOrgId === org.id;
```

- [ ] **Step 3: Branch the header action**

Replace the header row block (currently `<div className="mb-8 flex items-center justify-between">…</div>`) with:

```tsx
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {org.name}
        </h1>
        {isViewingThisOrg ? (
          // Offering "Enter as this org" while already inside it is the kind of dead
          // control that makes the whole feature feel unresponsive. Exit lives in the
          // banner, so this is a status, not an action.
          <span className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Eye className="size-3.5" strokeWidth={1.5} />
            You&rsquo;re viewing as this org
          </span>
        ) : (
          <EnterImpersonationButton orgId={org.id} orgName={org.name} />
        )}
      </div>
```

- [ ] **Step 4: Typecheck, lint, and run the full suite**

Run: `npx tsc --noEmit`
Expected: clean, no errors anywhere.

Run: `npx eslint src/app/admin/orgs/[id]/page.tsx src/app/admin/orgs/[id]/enter-impersonation-button.tsx`
Expected: no errors.

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/orgs/[id]/page.tsx
git commit -m "feat(impersonation): show viewing state instead of a dead Enter button"
```

---

### Task 7: Verify against the running app

Spec §9. The 44px header shift is the one thing that cannot be verified on paper, and the canvas editor is full of fixed overlays that assume a 64px header.

**Files:** none expected. Any fix belongs in the overlay's own file, not the banner.

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Sign in as a `super_admin` and go to `/admin/orgs/<some-org-id>`.

- [ ] **Step 2: Walk the entry path**

Click "Enter as this org". Confirm:
- the dialog appears, names the org, and says read-only + audit-logged
- **Cancel** dismisses it and starts nothing — you stay on the admin page
- **Enter as \<org\>** shows the success toast and lands you on `/`

- [ ] **Step 3: Check the read-only banner**

Confirm: white bar, purple left rule, monogram, `VIEWING AS` in tracked small-caps, the org name, `Eye` + "Read-only", then `Enable editing` and `Exit`.

**Then scroll.** The banner must stay pinned with the header directly beneath it. This is the regression under test — if the banner scrolls away, Task 4's layout change did not take.

- [ ] **Step 4: Check the elevated state**

Click `Enable editing`. Confirm the dialog states that going back needs an exit and re-enter, then confirm it. The bar turns amber-tinted, the rule turns amber, the icon becomes `Unlock`, the eyebrow reads `EDITING AS`, the dot pulses, `Enable editing` is gone, and a warning toast fires.

- [ ] **Step 5: Sweep the canvas editor in both states**

Open a canvas while impersonating and check the fixed overlays for a 44px collision — gallery drawer, the bottom-right copilot button, and any focus-view sheet. Open a confirm dialog from inside a focus sheet to confirm D138's blocker still wins against the `z-50` banner.

Fix any collision in the offending overlay's own file. If nothing collides, this step is a no-op — say so rather than inventing a change.

- [ ] **Step 6: Walk the exit path**

Click `Exit`. Confirm the success toast, that you land back on `/admin/orgs/<id>`, that the banner is gone, and that the header has returned flush to the top.

Revisit that org's page and confirm it now shows the "You're viewing as this org" status while impersonating and the button when not.

- [ ] **Step 7: Confirm the audit trail is intact**

The transitions still log. Query `impersonation_audit_log` for your operator id and confirm the session produced `session_started`, `elevated_mode_entered`, and `session_ended` rows. Task 3 changed only navigation, so a missing row means something in `@/lib/auth/impersonation` was disturbed.

- [ ] **Step 8: Commit any fixes**

Only if Step 5 turned up a real collision:

```bash
git add <the overlay file(s) you changed>
git commit -m "fix(canvas): account for the impersonation banner's offset"
```

---

## Notes for the implementer

- **Do not add `@testing-library/react` or a jsdom environment.** This repo tests pure logic under `environment: "node"`; the banner's decisions were deliberately extracted into `impersonation-ui.ts` (Task 2) so they are testable without a DOM. Rendering is verified by hand in Task 7.
- **The tree does not typecheck between Tasks 3 and 6.** That is by design — Task 3 changes an action signature and Tasks 4–6 catch up. Each task's own tests still pass throughout.
- **`AlertDialogAction` is a Base UI `Close` under the hood**, so it closes the dialog and runs your `onClick`. That ordering is fine here: the server action is awaited inside a transition that outlives the dialog.
