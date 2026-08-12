# Profile Popover for the Top Nav (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header's always-visible name pill + sign-out button with an avatar-triggered
popover (name, real role, credits with progress bar, workspace, sign out), remove the standalone
credits pill from the header bar, and restyle the canvas page's per-canvas spend chip into a
proper "Canvas Consumption" stat chip.

**Architecture:** Two new client components (`ProfileCredits`, `ProfilePopover`) built on the
existing `Popover` primitive and `useIdentity()` hook; one additive API field (`orgRole`) threaded
through `/api/me` → `useIdentity()`; two deletions (`IdentityChip`, `HeaderCredits` — the latter's
logic moves, not disappears); two small restyles (`HeaderBrand`, `CanvasCostChip`) plus a render-
order swap in the canvas page header.

**Tech Stack:** Next.js App Router, React (client components), Tailwind v4 (CSS variables from
`globals.css`), shadcn/ui (Base UI registry) `Popover`/`Button`, Lucide icons, Supabase Realtime,
Vitest.

## Global Constraints

- Every interactive control must be a shadcn primitive from `src/components/ui/*` (Base UI
  registry) — never a raw `<button>`. Composition via the `render` prop, not `asChild`.
- Purple `#5829c7` (the `primary` token) is used sparingly — small circular icon badges and the
  avatar trigger, never a large fill.
- Icons are Lucide only, 1.5 stroke, no fills.
- Any new transition uses easing `cubic-bezier(0.22,1,0.36,1)` at 200/320/500ms — no springs.
- No changes to sign-out behavior, session handling, credit-accounting math, or the
  Approve-gating logic that reads the collapsed `Identity.role`.
- This codebase has no React Testing Library / component-rendering test infrastructure anywhere
  (confirmed: zero `.test.tsx` files, zero `@testing-library/react` usage). API route handlers
  ARE unit-tested with Vitest (they're plain async functions) — that pattern applies to Task 1.
  Tasks that only touch `.tsx` components are verified with `npx tsc --noEmit` (typecheck) plus a
  manual browser check per task, not a new `.test.tsx` file — don't invent test infra this repo
  doesn't use.
- One component per file, named export only, no default exports, no `index.ts` barrels.

---

### Task 1: `/api/me` returns the real `orgRole`

**Files:**
- Modify: `src/app/api/me/route.ts`
- Test: `src/app/api/me/route.test.ts` (new)

**Interfaces:**
- Consumes: `caller.orgRole` (already present on the object `resolveCallerContext()` returns —
  see `src/lib/dal-logic.ts`'s `CallerContext.orgRole: OrgRole`, `OrgRole = "owner" | "senior" |
  "designer"`). Nothing else changes about the caller context.
- Produces: `GET /api/me`'s JSON body gains one field, `orgRole: OrgRole`, alongside the existing
  `role`, `name`, `platformRole`, `orgId`, `orgName`, `creditsUsed`, `monthlyCreditLimit`. Task 2's
  `useIdentity()` reads this new field by name.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/me/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { display_name: "Arun" }, error: null }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => ({
    id: "org-1",
    name: "Yuvabe Studios",
    slug: "yuvabe",
    monthly_credit_limit: 1000,
    created_at: "t",
  })),
  getOrgCreditUsage: vi.fn(async () => 42),
}));

describe("GET /api/me", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the real orgRole alongside the collapsed gating role", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // orgRoleToIdentityRole("owner") collapses to "senior" — that field must stay as-is,
    // it's frozen per D53 and still gates the Approve feature.
    expect(body.role).toBe("senior");
    // orgRole is the new, real value — this is what Task 4's popover displays as "Owner".
    expect(body.orgRole).toBe("owner");
    expect(body.name).toBe("Arun");
    expect(body.orgName).toBe("Yuvabe Studios");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/me/route.test.ts`
Expected: FAIL — `expect(body.orgRole).toBe("owner")` fails because `body.orgRole` is
`undefined` (the field doesn't exist yet).

- [ ] **Step 3: Add `orgRole` to the response**

In `src/app/api/me/route.ts`, the `apiOk({...})` call currently reads:

```ts
  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    platformRole: caller.platformRole,
    orgId: caller.orgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
```

Add one field, `orgRole: caller.orgRole`, right after `role`:

```ts
  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    orgRole: caller.orgRole,
    platformRole: caller.platformRole,
    orgId: caller.orgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
```

Also update the doc-comment directly above `export async function GET()` — it currently reads:

```ts
// Feeds the future useIdentity() swap (Stage 1C). Returns the display name + the frozen
// Identity.role (owner/senior → "senior" so Approve shows). See dal-logic.
```

Replace with:

```ts
// Feeds useIdentity(). Returns the display name + the frozen Identity.role (owner/senior →
// "senior" so Approve shows — see dal-logic) alongside the real orgRole, kept separate: the
// profile popover needs to show an Owner "Owner", not "Senior".
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/me/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/me/route.ts src/app/api/me/route.test.ts
git commit -m "feat(api): return the real orgRole from /api/me"
```

---

### Task 2: `useIdentity()` exposes `orgRole`

**Files:**
- Modify: `src/hooks/use-identity.ts`

**Interfaces:**
- Consumes: `data.orgRole` from `/api/me`'s JSON body (Task 1).
- Produces: `useIdentity()` return type gains `orgRole: OrgRole | null`. Task 4's
  `ProfilePopover` reads `const { orgRole } = useIdentity();`.

This hook has no dedicated test file today (see Global Constraints — no RTL infra for hooks with
`useEffect`/module-level cache), so this task is verified by typecheck + the manual check in
Step 4, following the same pattern every other sibling field on this hook (`orgId`, `orgName`,
`platformRole`) already uses.

- [ ] **Step 1: Add the `OrgRole` import and thread the field through**

In `src/hooks/use-identity.ts`, change the type-only import on line 6 from:

```ts
import type { PlatformRole } from "@/lib/dal-logic";
```

to:

```ts
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";
```

In the `FetchResult` type (around line 22), add `orgRole` right after `orgName`:

```ts
type FetchResult = {
  identity: Identity | null;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
};
```

Add a module-level cache variable next to the existing ones (around line 34):

```ts
let cachedOrgRole: OrgRole | null = null;
```

In `resetIdentityCache()`, add `cachedOrgRole = null;` alongside the other resets.

In `fetchIdentity()`'s `.then((data): FetchResult => ...)` mapping, add `orgRole` to both the
success and null branches:

```ts
      .then((data): FetchResult =>
        data && typeof data.name === "string"
          ? {
              identity: { name: data.name, role: data.role } as Identity,
              platformRole: (data.platformRole as PlatformRole | undefined) ?? null,
              orgId: (data.orgId as string | undefined) ?? null,
              orgName: (data.orgName as string | undefined) ?? null,
              orgRole: (data.orgRole as OrgRole | undefined) ?? null,
              creditsUsed: (data.creditsUsed as number | undefined) ?? null,
              monthlyCreditLimit: (data.monthlyCreditLimit as number | undefined) ?? null,
            }
          : {
              identity: null,
              platformRole: null,
              orgId: null,
              orgName: null,
              orgRole: null,
              creditsUsed: null,
              monthlyCreditLimit: null,
            },
      )
      .catch(
        (): FetchResult => ({
          identity: null,
          platformRole: null,
          orgId: null,
          orgName: null,
          orgRole: null,
          creditsUsed: null,
          monthlyCreditLimit: null,
        }),
      );
```

In the `useIdentity()` function body: add the state hook next to `orgName`'s —

```ts
  const [orgRole, setOrgRole] = useState<OrgRole | null>(cachedOrgRole);
```

— add it to the return type annotation on the function signature (next to `orgName: string |
null;`):

```ts
  orgRole: OrgRole | null;
```

— inside the `if (cachedHydrated) { ... }` early-sync branch, add `setOrgRole(cachedOrgRole);`
next to `setOrgName(cachedOrgName);` —

— inside `fetchIdentity().then((result) => { ... })`, add both the cache write and the state
setter, next to `orgName`'s:

```ts
      cachedOrgRole = result.orgRole;
```
```ts
        setOrgRole(result.orgRole);
```

— and finally add `orgRole` to the hook's return statement:

```ts
  return { identity, hydrated, platformRole, orgId, orgName, orgRole, creditsUsed, monthlyCreditLimit };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (This is the closest thing to a test this file has — a mistyped field name
or a missed branch shows up as a type error since `FetchResult` and the return type are both
explicit.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-identity.ts
git commit -m "feat: thread orgRole through useIdentity()"
```

---

### Task 3: `ProfileCredits` — move + restyle the credits display

**Files:**
- Create: `src/components/identity/profile-credits.tsx`
- Delete: `src/components/layout/header-credits.tsx`

**Interfaces:**
- Consumes: `useIdentity()`'s `hydrated`, `orgId`, `creditsUsed`, `monthlyCreditLimit` (all
  already exist — untouched by Tasks 1–2).
- Produces: `export function ProfileCredits(): JSX.Element | null` — Task 4's `ProfilePopover`
  renders `<ProfileCredits />` inside the popover body. Renders `null` when
  `!hydrated || creditsUsed === null` (same gating `HeaderCredits` used).

This is the exact same Realtime-subscription logic `HeaderCredits` has today (see
`src/components/layout/header-credits.tsx`), relocated because it's identity-popover chrome now,
not generic header chrome, with its JSX restyled to sit inside a popover (no card
border/background/fixed width — the popover already provides those) and a "Credits" eyebrow
label added above the number, per
`docs/superpowers/specs/2026-08-09-profile-popover-header-design.md` §3, §5, §8.

- [ ] **Step 1: Create the new file with the moved + restyled component**

Create `src/components/identity/profile-credits.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

/**
 * Org's "used this month" figure, shown inside ProfilePopover. Hydrates from useIdentity()'s
 * cached /api/me fetch, then stays current via a Realtime subscription on new
 * credit_transactions rows. Uses an EXPLICIT `org_id` filter (not RLS alone) — an initial
 * RLS-only subscription (relying purely on the "org isolation" select policy, migration
 * 0019) didn't reliably deliver events in practice; an explicit filter matches the one other
 * working Realtime subscription in this codebase (use-video-gen-status.ts's `node_id=eq...`
 * filter) instead of a new, unproven filter-less pattern. Incrementing locally by each new
 * row's `amount` avoids a refetch round-trip per event; org_credit_usage is itself defined
 * as a plain sum (design spec §3), so this stays exactly correct within a UTC month. A tab
 * left open across the UTC month rollover can read stale until the next full page load —
 * accepted, not engineered around (see plan's Global Constraints).
 */
export function ProfileCredits() {
  const { hydrated, orgId, creditsUsed, monthlyCreditLimit } = useIdentity();
  const [liveDelta, setLiveDelta] = useState(0);

  useEffect(() => {
    if (!hydrated || !orgId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = createBrowserSupabase();

    // @supabase/ssr's browser client doesn't proactively load the session on init — it's
    // lazy until something calls getSession()/getUser(). Subscribing to Realtime before
    // that resolves opens the websocket with NO JWT attached, so credit_transactions' RLS
    // policy (org_id = ...auth.uid()...) evaluates auth.uid() as null and silently drops
    // every row — the subscription looks "connected" but never delivers anything. This is
    // the real fix for the symptom the filter-only workaround above was papering over;
    // awaiting the session first guarantees the websocket carries a valid JWT before it
    // ever subscribes.
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`profile-credits:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "credit_transactions",
            filter: `org_id=eq.${orgId}`,
          },
          (payload: RealtimePostgresChangesPayload<CreditTransactionRow>) => {
            const row = payload.new as CreditTransactionRow;
            setLiveDelta((d) => d + row.amount);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [hydrated, orgId]);

  if (!hydrated || creditsUsed === null) return null;
  const used = creditsUsed + liveDelta;
  const over = monthlyCreditLimit !== null && used > monthlyCreditLimit;
  const fillPct =
    monthlyCreditLimit !== null && monthlyCreditLimit > 0
      ? Math.min(used / monthlyCreditLimit, 1) * 100
      : null;

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full",
            over ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary",
          )}
        >
          <Zap className="size-2.5" strokeWidth={1.5} />
        </span>
        <span className="text-eyebrow">Credits</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-lg leading-none font-semibold tracking-tight",
            over ? "text-amber-600 dark:text-amber-400" : "text-foreground",
          )}
        >
          {used.toLocaleString()}
        </span>
        {monthlyCreditLimit !== null && (
          <span className="text-xs leading-none text-muted-foreground">
            / {monthlyCreditLimit.toLocaleString()}
          </span>
        )}
      </div>
      {fillPct !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              over ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${over ? 100 : fillPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old file**

```bash
git rm src/components/layout/header-credits.tsx
```

(`header-brand.tsx` still imports it at this point — Task 5 removes that import. This repo's
`tsc`/build will show one expected error until Task 5 lands; that's fine, this task's deliverable
is the new component existing correctly, not a green build in isolation. If you want a clean
typecheck at every commit, do Task 5 immediately after this one before running `tsc`.)

- [ ] **Step 3: Typecheck the new file in isolation**

Run: `npx tsc --noEmit`
Expected: the only errors reported are in `src/components/layout/header-brand.tsx` (the stale
import of the just-deleted `header-credits.tsx`) — nothing in
`src/components/identity/profile-credits.tsx` itself. That confirms the new component is
internally correct; Task 5 resolves the `header-brand.tsx` error.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: move credits pill into profile-credits.tsx, restyled for the popover"
```

---

### Task 4: `ProfilePopover` — avatar trigger + popover content

**Files:**
- Create: `src/components/identity/profile-popover.tsx`
- Delete: `src/components/identity/identity-chip.tsx`

**Interfaces:**
- Consumes: `useIdentity()`'s `identity`, `hydrated`, `orgName`, `orgRole` (Task 2), `creditsUsed`
  (to decide whether to render the credits section); `resetIdentityCache` from
  `@/hooks/use-identity`; `logoutAction` from `@/lib/actions/auth`; `initials` from
  `@/lib/format/initials`; `Popover`/`PopoverTrigger`/`PopoverContent` from
  `@/components/ui/popover`; `Button` from `@/components/ui/button`; `ProfileCredits` from
  `./profile-credits` (Task 3); `OrgRole` type from `@/lib/dal-logic`.
- Produces: `export function ProfilePopover(): JSX.Element | null` — Task 5's
  `HeaderActions` renders `<ProfilePopover />` in place of `<IdentityChip />`.

- [ ] **Step 1: Create the component**

Create `src/components/identity/profile-popover.tsx`:

```tsx
"use client";

import type { FormEvent } from "react";
import { Building2, LogOut } from "lucide-react";
import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/format/initials";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileCredits } from "./profile-credits";
import type { OrgRole } from "@/lib/dal-logic";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  senior: "Senior",
  designer: "Designer",
};

// Replaces IdentityChip's always-visible name pill + adjacent sign-out button, and the
// header's standalone credits pill (HeaderCredits) — name, real role, credits, workspace and
// sign out all live in one avatar-triggered popover now. See
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md.
export function ProfilePopover() {
  const { identity, hydrated, orgName, orgRole, creditsUsed } = useIdentity();

  // A Server Action's redirect() is a soft, client-side transition — it would leave every
  // module-level client cache (useIdentity's included) intact across sign-out, which was
  // the root cause of a stale-identity-from-the-previous-account bug (sign out of org A,
  // sign in as org B in the same tab, header keeps showing org A until a manual refresh).
  // resetIdentityCache() closes that specific gap immediately; the hard window.location
  // navigation below is the actual fix — it forces a full reload, guaranteeing every
  // module-level cache in the app (not just identity's) starts clean for the next sign-in.
  async function handleSignOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetIdentityCache();
    await logoutAction();
    window.location.href = "/login";
  }

  if (!hydrated || !identity) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account menu"
            className="rounded-full bg-primary/10 text-xs font-medium text-primary transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/40"
          >
            {initials(identity.name)}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-1">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          <span className="text-sm font-medium text-foreground">{identity.name}</span>
          {orgRole && (
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[orgRole]}</span>
          )}
        </div>
        {creditsUsed !== null && (
          <>
            <div className="h-px bg-border" aria-hidden="true" />
            <ProfileCredits />
          </>
        )}
        <div className="h-px bg-border" aria-hidden="true" />
        <div className="flex flex-col gap-1 px-2 py-1">
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-eyebrow">Workspace</span>
          </div>
          <span className="text-sm font-medium text-foreground">{orgName ?? "—"}</span>
        </div>
        <div className="h-px bg-border" aria-hidden="true" />
        <form onSubmit={handleSignOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-2 text-destructive hover:text-destructive"
          >
            <LogOut className="size-3.5" strokeWidth={1.5} />
            Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Delete the superseded component**

```bash
git rm src/components/identity/identity-chip.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: the only errors reported are in `src/components/layout/header-actions.tsx` (still
imports the just-deleted `identity-chip.tsx`) — nothing in `profile-popover.tsx` itself. Task 5
resolves that error.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add ProfilePopover (avatar trigger + account menu)"
```

---

### Task 5: Wire `ProfilePopover` into the header, drop `HeaderCredits`/org-name from `HeaderBrand`

**Files:**
- Modify: `src/components/layout/header-actions.tsx`
- Modify: `src/components/layout/header-brand.tsx`

**Interfaces:**
- Consumes: `ProfilePopover` from `@/components/identity/profile-popover` (Task 4).
- Produces: nothing new — this is the wiring task that makes Tasks 1–4 actually render, and
  finally makes `npx tsc --noEmit` fully clean again.

- [ ] **Step 1: Swap `IdentityChip` for `ProfilePopover` in `HeaderActions`**

Replace the full contents of `src/components/layout/header-actions.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { AdminNavLink } from "@/components/identity/admin-nav-link";
import { ProfilePopover } from "@/components/identity/profile-popover";

// Hidden on /login — there's no session to reflect on the sign-in form itself, so
// showing "signed in as X" / an admin link / sign-out there is just confusing chrome,
// independent of whether a session happens to still be technically live at that moment.
export function HeaderActions() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="flex items-center gap-3">
      <AdminNavLink />
      <ProfilePopover />
    </div>
  );
}
```

- [ ] **Step 2: Strip the org-name span and the credits pill out of `HeaderBrand`**

Replace the full contents of `src/components/layout/header-brand.tsx`:

```tsx
import Link from "next/link";

// The wordmark + static "Yuvabe Studios" eyebrow always show. Org name and credits used to
// render here too (gated on identity having resolved) — both moved into ProfilePopover, see
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md §5.
export function HeaderBrand() {
  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
    </div>
  );
}
```

Note this drops the `"use client"` directive too — with no hooks (`usePathname`, `useIdentity`)
left in the file, it no longer needs to be a client component.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere (this resolves the two expected errors left over from Tasks 3–4).

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, open the app, sign in, and confirm:
- Top-left shows just the wordmark + "Yuvabe Studios" eyebrow (no org name, no credits pill).
- Top-right shows an avatar circle with your initials. Clicking it opens a popover showing your
  name, role, a Credits section with a progress bar, a Workspace section with the org name, and
  a red "Sign out" row.
- Sign out actually signs you out (lands on `/login`).
- On `/login`, the header shows neither `AdminNavLink` nor `ProfilePopover` (unchanged
  pre-existing behavior — `HeaderActions` still early-returns `null` there).

Stop the dev server once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/header-actions.tsx src/components/layout/header-brand.tsx
git commit -m "feat: wire ProfilePopover into the header, drop the org-name span and credits pill from HeaderBrand"
```

---

### Task 6: Restyle `CanvasCostChip` as a stat chip

**Files:**
- Modify: `src/components/canvas/canvas-cost-chip.tsx`

**Interfaces:**
- Consumes: nothing new — same `canvasCostCredits` state this component already computes.
- Produces: same default export shape (`export function CanvasCostChip({ canvasId }: { canvasId:
  string })`) — Task 7 renders it unchanged, just reordered.

- [ ] **Step 1: Add the `Zap` import and restyle the render**

In `src/components/canvas/canvas-cost-chip.tsx`, add to the top of the import list:

```ts
import { Zap } from "lucide-react";
```

Replace the final `return` block (currently):

```tsx
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="font-medium tabular-nums text-foreground">{canvasCostCredits.toLocaleString()}</span>
      <span>credits total</span>
    </div>
  );
```

with:

```tsx
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Zap className="size-3" strokeWidth={1.5} />
      </span>
      <span className="font-display text-sm font-semibold tabular-nums text-foreground">
        {canvasCostCredits.toLocaleString()}
      </span>
      <span className="text-xs text-muted-foreground">Canvas Consumption</span>
    </div>
  );
```

The `if (canvasCostCredits === null || canvasCostCredits <= 0) return null;` guard immediately
above stays exactly as-is.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/canvas-cost-chip.tsx
git commit -m "feat(canvas): restyle the cost chip as an icon + Canvas Consumption stat"
```

---

### Task 7: Reorder the canvas page header — cost chip before Gallery trigger

**Files:**
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`

**Interfaces:**
- Consumes: `CanvasCostChip` (Task 6), `GalleryDrawerTrigger` (unchanged).
- Produces: nothing new — pure JSX reorder + a stale-comment cleanup in one existing file.

- [ ] **Step 1: Swap the render order and drop the stale comment**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, the header currently reads:

```tsx
        {/* IdentityChip now lives in the root layout header (shown on every page) —
            not duplicated here. */}
        <div className="flex items-center gap-3">
          <GalleryDrawerTrigger />
          <CanvasCostChip canvasId={canvas.id} />
        </div>
```

Replace with:

```tsx
        <div className="flex items-center gap-3">
          <CanvasCostChip canvasId={canvas.id} />
          <GalleryDrawerTrigger />
        </div>
```

(The removed comment referenced `IdentityChip`, which Task 4 deleted — `ProfilePopover` now
lives in the root layout header instead, and that fact doesn't need restating next to an
unrelated pair of buttons.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual browser check**

Run: `npm run dev`, open any canvas with existing generations (so `CanvasCostChip` has a nonzero
total to show), and confirm the breadcrumb header's right side reads, left to right: the "Canvas
Consumption" stat chip, then the "Gallery" button, then (further right, unrelated to this row)
the global header's avatar. Stop the dev server once confirmed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/clients/[id]/canvases/[cid]/page.tsx"
git commit -m "feat(canvas): show Canvas Consumption before the Gallery button"
```

---

## Final verification

- [ ] Run the full test suite: `npm run test` — expect all passing, including the new
  `src/app/api/me/route.test.ts`.
- [ ] Run `npx tsc --noEmit` one more time from a clean tree — expect zero errors.
- [ ] Run `npm run lint` — expect zero errors.
- [ ] Grep for any remaining references to the deleted files, to catch a stale import the
  per-task typechecks might have missed in a file not yet touched:
  `grep -rn "identity-chip\|header-credits" src/` — expect no output.
