# Profile Popover for the Top Nav — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header's split identity chrome — `IdentityChip`'s always-visible name
pill + adjacent sign-out button, plus the org-name span in `HeaderBrand` — with a single
avatar-triggered profile popover (name, real role, workspace/org, sign out).

**Architecture:** One new client component (`ProfilePopover`) built on the existing Base UI
`Popover` primitives, reading identity via `useIdentity()`. `/api/me` gains one additive field
(`orgRole`, the real org role) so the popover can show a role a user actually recognizes,
without touching the existing collapsed `Identity.role` used elsewhere for Approve-gating.
`HeaderBrand` drops its org-name display; `HeaderActions` swaps `IdentityChip` for
`ProfilePopover`; `IdentityChip` is deleted.

**Tech Stack:** Next.js App Router, React (client components), Base UI (`@base-ui/react`) via
the shadcn-style wrappers in `src/components/ui/`, Tailwind v4, Vitest.

## Global Constraints

- Every interactive control must be a shadcn primitive from `src/components/ui/*` (`Button`,
  etc.) — never a raw `<button>`/`<input>`/etc. (CLAUDE.md).
- Purple (`text-primary`/`bg-primary`) is the single brand color, used sparingly — small badges
  only, never a large fill.
- Motion easing is `cubic-bezier(0.22,1,0.36,1)` only, no springs/bounce; card/control hover is
  barely-perceptible.
- Icons: Lucide only, 1.5 stroke, no fills.
- Reuse, don't redeclare: `initials()` (`src/lib/format/initials.ts`), `OrgRole`
  (`src/lib/dal-logic.ts`), the existing `Popover`/`PopoverTrigger`/`PopoverContent`
  primitives — import all of these, do not reimplement.
- `Identity`'s frozen `{ name, role }` shape (D53) does not change. The existing collapsed
  `role` field and everywhere it gates the Approve feature is untouched.
- No jsdom/`@testing-library/react` exists in this repo (`vitest.config.ts` runs
  `environment: "node"`) — do not introduce a new test environment for this feature. API route
  changes get a Vitest test (existing, established pattern). Client UI components in
  `src/components/layout/` and `src/components/identity/` have zero existing test coverage in
  this codebase — follow that precedent (no new test files for them); verify those tasks with
  `npm run build` (typecheck) + `npm run lint`, and with a manual browser walkthrough in the
  final task, per this project's rule that UI changes must be checked in a running browser
  before being called done.

---

### Task 1: `/api/me` returns the real `orgRole`

**Files:**
- Modify: `src/app/api/me/route.ts`
- Test: `src/app/api/me/route.test.ts` (new)

**Interfaces:**
- Consumes: `resolveCallerContext()` (`@/lib/dal`) → `{ userId, platformRole, orgId, orgRole,
  mustChangePassword }`; `orgRoleToIdentityRole` (`@/lib/dal-logic`); `getOrgById`,
  `getOrgCreditUsage` (`@/lib/db/organizations`).
- Produces: `GET /api/me` JSON body gains one new field, `orgRole: "owner" | "senior" |
  "designer"` (the real org role, straight from `caller.orgRole`), alongside the existing
  `role` (the collapsed `"senior" | "designer"` gating value — unchanged), `name`,
  `platformRole`, `orgId`, `orgName`, `creditsUsed`, `monthlyCreditLimit`. Task 2 consumes this
  new field by name.

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
    // orgRoleToIdentityRole("owner") collapses to "senior" — that field must stay as-is.
    expect(body.role).toBe("senior");
    // orgRole is the new, real value — this is what Task 3's popover displays.
    expect(body.orgRole).toBe("owner");
    expect(body.name).toBe("Arun");
    expect(body.orgName).toBe("Yuvabe Studios");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/me/route.test.ts`
Expected: FAIL — `expect(body.orgRole).toBe("owner")` fails because `body.orgRole` is `undefined`.

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

Change it to:

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

Also update the file's top comment (currently: `// Feeds the future useIdentity() swap (Stage
1C). Returns the display name + the frozen // Identity.role (owner/senior → "senior" so
Approve shows). See dal-logic.`) to note the addition:

```ts
// Feeds useIdentity(). Returns the display name + the frozen Identity.role (owner/senior →
// "senior" so Approve shows — see dal-logic) alongside the real orgRole, kept separate: the
// popover needs to show an Owner "Owner", not "Senior".
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/me/route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/me/route.ts src/app/api/me/route.test.ts
git commit -m "feat(api): return the real orgRole from /api/me"
```

---

### Task 2: Thread `orgRole` through `useIdentity()`

**Files:**
- Modify: `src/hooks/use-identity.ts`

**Interfaces:**
- Consumes: `GET /api/me`'s `orgRole` field (Task 1).
- Produces: `useIdentity()` returns one additional field, `orgRole: OrgRole | null`, alongside
  the existing `identity`, `hydrated`, `platformRole`, `orgId`, `orgName`, `creditsUsed`,
  `monthlyCreditLimit`. Task 3 consumes this by destructuring `{ orgRole }` from the hook.

No test file for this task — `use-identity.ts` has zero existing test coverage in this
codebase (its module-level cache pattern has no precedent test to extend), and the repo's
Vitest environment is `node` (no DOM), so hook-render-based testing isn't set up here either.
Verified instead via `npm run build` (Step 2 below), matching how this file's existing
`platformRole`/`orgId`/`orgName` additions were done without tests.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/hooks/use-identity.ts` with:

```ts
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Identity } from "@/lib/identity";
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";
import { ensureFreshSession } from "@/lib/supabase/session-ready";

// Module-level cache + in-flight dedup: multiple components call this hook (the profile
// popover, admin nav link, header brand, plus prompt/image-gen/video-prompt focus views), and
// any of them can mount/remount independently. Without this, each mount fires its own
// /api/me request — observed firing dozens of times per canvas session.
//
// IMPORTANT: logoutAction()'s redirect("/") is a Server Action redirect — Next's App Router
// performs that as a soft, client-side transition, NOT a full browser page reload. This
// module's state survives it completely intact. (An earlier version of this comment assumed
// otherwise — that was wrong, and was the root cause of a real bug: sign out of org A, sign
// in as org B in the same tab, and the header kept showing org A's name/credits until a
// manual refresh, because cachedHydrated was still true and the hook just re-synced from the
// stale cache instead of fetching.) resetIdentityCache() below is what actually invalidates
// this on sign-out — call it explicitly, do not rely on navigation to do it for you.
type FetchResult = {
  identity: Identity | null;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
};

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
let cachedOrgId: string | null = null;
let cachedOrgName: string | null = null;
let cachedOrgRole: OrgRole | null = null;
let cachedCreditsUsed: number | null = null;
let cachedMonthlyCreditLimit: number | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<FetchResult> | null = null;

// Call this at the moment sign-out happens (see profile-popover.tsx), client-side, before/as
// the redirect fires. Without it, a subsequent sign-in as a different account in the same
// tab sees cachedHydrated still true and silently reuses the previous account's identity —
// see the module comment above.
export function resetIdentityCache(): void {
  cachedIdentity = null;
  cachedPlatformRole = null;
  cachedOrgId = null;
  cachedOrgName = null;
  cachedOrgRole = null;
  cachedCreditsUsed = null;
  cachedMonthlyCreditLimit = null;
  cachedHydrated = false;
  inFlightFetch = null;
}

function fetchIdentity(): Promise<FetchResult> {
  if (!inFlightFetch) {
    // cache: "no-store" is load-bearing, not defensive boilerplate — a plain fetch() here
    // is subject to the browser's normal HTTP cache, and /api/me's route handler sends no
    // explicit no-cache response headers. Without this, the FIRST /api/me call in a tab
    // gets cached and silently reused across every later auth-state change (login, sign
    // out + sign back in as someone else, this feature's forced password change) until a
    // hard refresh — the exact "stale identity until I refresh" bug this fixes.
    //
    // ensureFreshSession() first: if the tab was backgrounded long enough for the access
    // token to expire, this is what refreshes it — through the browser client's own lock,
    // so it can't race any other hook's fetch doing the same thing. See session-ready.ts.
    inFlightFetch = ensureFreshSession()
      .then(() => fetch("/api/me", { cache: "no-store" }))
      .then((r) => (r.ok ? r.json() : null))
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
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole`/`orgId`/`orgName`/`orgRole`/`creditsUsed`/`monthlyCreditLimit` are
// additive sibling fields (gate the admin nav link / scope Realtime subscriptions / show the
// agency name, real role and monthly usage in the profile popover) — Identity itself never
// changes shape. `hydrated` flips true once the fetch resolves; until then identity/
// platformRole/orgId/orgName/orgRole/creditsUsed/monthlyCreditLimit === null means "not
// checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [orgId, setOrgId] = useState<string | null>(cachedOrgId);
  const [orgName, setOrgName] = useState<string | null>(cachedOrgName);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(cachedOrgRole);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(cachedCreditsUsed);
  const [monthlyCreditLimit, setMonthlyCreditLimit] = useState<number | null>(
    cachedMonthlyCreditLimit,
  );
  const [hydrated, setHydrated] = useState(cachedHydrated);
  const pathname = usePathname();

  useEffect(() => {
    // HeaderBrand renders (and calls this hook) on /login AND /account/password too.
    // /login: there's no session to check yet. /account/password: proxy.ts actively
    // 403s /api/me for a user who still owes a password change (it's an /api path, not
    // under /account/password's own exclusion) — so fetching here wouldn't just be
    // premature, it would DETERMINISTICALLY get blocked and cache a false "logged out"
    // result at module scope. Either way, changePasswordAction's/loginAction's
    // redirect("/") is a soft navigation (no full page reload), so that stale cache
    // would survive it and every consumer would show "no identity" until a hard refresh
    // cleared the module. Skipping the fetch on both pages means the first real fetch
    // happens once pathname actually changes away from them.
    if (pathname === "/login" || pathname === "/account/password") return;
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setOrgId(cachedOrgId);
      setOrgName(cachedOrgName);
      setOrgRole(cachedOrgRole);
      setCreditsUsed(cachedCreditsUsed);
      setMonthlyCreditLimit(cachedMonthlyCreditLimit);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedOrgId = result.orgId;
      cachedOrgName = result.orgName;
      cachedOrgRole = result.orgRole;
      cachedCreditsUsed = result.creditsUsed;
      cachedMonthlyCreditLimit = result.monthlyCreditLimit;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setOrgId(result.orgId);
        setOrgName(result.orgName);
        setOrgRole(result.orgRole);
        setCreditsUsed(result.creditsUsed);
        setMonthlyCreditLimit(result.monthlyCreditLimit);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // pathname is a real dependency (not just exhaustive-deps box-ticking): it's what
    // re-fires this effect the moment a redirect leaves /login or /account/password,
    // triggering the first real fetch instead of leaving the hook permanently un-hydrated.
  }, [pathname]);

  return {
    identity,
    hydrated,
    platformRole,
    orgId,
    orgName,
    orgRole,
    creditsUsed,
    monthlyCreditLimit,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds (this also typechecks every consumer of `useIdentity()` — none of
their destructured shapes changed, so no other file needs edits here).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-identity.ts
git commit -m "feat: thread orgRole through useIdentity()"
```

---

### Task 3: `ProfilePopover` component

**Files:**
- Create: `src/components/identity/profile-popover.tsx`

**Interfaces:**
- Consumes: `useIdentity()` (Task 2) → `{ identity, hydrated, orgName, orgRole }`;
  `resetIdentityCache` (`@/hooks/use-identity`); `logoutAction` (`@/lib/actions/auth`);
  `initials` (`@/lib/format/initials`); `Button` (`@/components/ui/button`); `Popover`,
  `PopoverContent`, `PopoverTrigger` (`@/components/ui/popover`); `OrgRole`
  (`@/lib/dal-logic`).
- Produces: `ProfilePopover` — a zero-prop component. Task 4 consumes it as
  `<ProfilePopover />`.

No test file — this is a presentational client component with no precedent for unit tests in
`src/components/identity/` or `src/components/layout/` in this codebase (neither jsdom nor
`@testing-library/react` is installed). Verified via `npm run build` (Step 2) and the manual
browser walkthrough in Task 5.

- [ ] **Step 1: Create the component**

Create `src/components/identity/profile-popover.tsx`:

```tsx
"use client";

import type { FormEvent } from "react";
import { LogOut } from "lucide-react";
import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/format/initials";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OrgRole } from "@/lib/dal-logic";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  senior: "Senior",
  designer: "Designer",
};

// Replaces IdentityChip's always-visible name pill + adjacent sign-out button, and the
// org-name span HeaderBrand used to show — all three now live in one avatar-triggered
// popover. See docs/superpowers/specs/2026-08-05-profile-popover-header-design.md.
export function ProfilePopover() {
  const { identity, hydrated, orgName, orgRole } = useIdentity();

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
        <div className="h-px bg-border" aria-hidden="true" />
        <div className="flex flex-col gap-0.5 px-2 py-1">
          <span className="text-eyebrow">Workspace</span>
          <span className="text-sm font-medium text-foreground">{orgName ?? "—"}</span>
        </div>
        <div className="h-px bg-border" aria-hidden="true" />
        <form onSubmit={handleSignOut}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-2 px-2 text-muted-foreground hover:text-foreground"
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

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: both succeed. (The component isn't imported anywhere yet, so this only checks it
compiles standalone — Task 4 wires it in and is where you'll see it render.)

- [ ] **Step 3: Commit**

```bash
git add src/components/identity/profile-popover.tsx
git commit -m "feat: add ProfilePopover component"
```

---

### Task 4: Wire the header — swap in `ProfilePopover`, trim `HeaderBrand`, delete `IdentityChip`

**Files:**
- Modify: `src/components/layout/header-actions.tsx`
- Modify: `src/components/layout/header-brand.tsx`
- Delete: `src/components/identity/identity-chip.tsx`

**Interfaces:**
- Consumes: `ProfilePopover` (Task 3).
- Produces: the rendered header — no further tasks depend on this one.

No test file — same rationale as Tasks 2–3. Verified via `npm run build` (Step 3) and the
manual browser walkthrough in Task 5.

- [ ] **Step 1: Update `HeaderActions`**

Replace the full contents of `src/components/layout/header-actions.tsx` with:

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

- [ ] **Step 2: Update `HeaderBrand`**

Replace the full contents of `src/components/layout/header-brand.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { HeaderCredits } from "./header-credits";

// The wordmark always shows. showIdentity (never on /login or /account/password, never
// before hydration — avoids a flash of a previous/wrong org's credits on first paint, and
// there's nothing meaningful to show on either page anyway: /account/password is a
// locked-down "set your password" gate — see use-identity.ts's pathname skip for why) gates
// the credits pill. The org name itself now lives in ProfilePopover, not here — see
// docs/superpowers/specs/2026-08-05-profile-popover-header-design.md.
const IDENTITY_HIDDEN_PATHS = ["/login", "/account/password"];

export function HeaderBrand() {
  const pathname = usePathname();
  const { hydrated, orgName } = useIdentity();
  const showIdentity = !IDENTITY_HIDDEN_PATHS.includes(pathname) && hydrated && Boolean(orgName);

  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
      {showIdentity && <HeaderCredits />}
    </div>
  );
}
```

- [ ] **Step 3: Delete `IdentityChip` and typecheck**

```bash
rm src/components/identity/identity-chip.tsx
npm run build
```

Expected: build succeeds — confirms no remaining importer of `IdentityChip` (the only prior
importer, `header-actions.tsx`, was just updated in Step 1; the reference in
`src/app/clients/[id]/canvases/[cid]/page.tsx` is a stale comment, not an import, so it needs
no edit).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/layout/header-actions.tsx src/components/layout/header-brand.tsx src/components/identity/identity-chip.tsx
git commit -m "feat: wire ProfilePopover into the header, drop IdentityChip and the org-name span"
```

---

### Task 5: Manual verification

This task has no code changes — it's the browser walkthrough this project's UI-change rule
requires (type checking and `npm run build` verify the code compiles, not that the feature
actually works).

**Files:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Log in and check the header's resting state**

Navigate to the app and log in. Confirm:
- Left side of the header: wordmark, "Yuvabe Studios" eyebrow, credits pill — no org name
  visible here anymore.
- Right side: (if logged in as a super_admin) the `Admin` link, then a small circular avatar
  chip showing your initials.

- [ ] **Step 3: Open the popover**

Click the avatar chip. Confirm:
- It opens aligned under the avatar (not clipped off the right edge of the viewport).
- Shows your name, your role label underneath (Owner/Senior/Designer — matching your actual
  org role, not a hardcoded value), a "Workspace" label with your org's name, and a "Sign out"
  row with a logout icon.
- Hovering the avatar chip shows a subtle ring — no layout shift, no bounce.

- [ ] **Step 4: Sign out**

Click "Sign out" inside the popover. Confirm it navigates to `/login` and the header no longer
shows the avatar (per `HeaderActions`'s existing `/login` hide).

- [ ] **Step 5: Sign back in as a different org, if you have a second test account**

Confirm the popover shows the new account's name/role/org — not the previous session's
(regression check for the stale-identity-after-sign-out bug `resetIdentityCache()` exists to
prevent).

- [ ] **Step 6: Run the full test suite and lint once more**

```bash
npm run test
npm run lint
npm run build
```

Expected: all three pass clean.

---

## Self-Review Notes

- **Spec coverage:** §2 (trigger) → Task 3 Step 1. §3 (popover content) → Task 3 Step 1. §4
  (`orgRole` on `/api/me` + `useIdentity`) → Tasks 1–2. §5 (`HeaderBrand` trim) → Task 4 Step
  2. §6 (credits pill / `Admin` link stay put) → untouched by any task, confirmed by Task 5
  Step 2. §7 (file changes) → matches Tasks 1–4's file lists exactly. §8 (out of scope) →
  no task touches sign-out behavior, session handling, credits, Approve-gating, or
  `/admin`/`/account/password`.
- **Placeholder scan:** none found — every step has complete, runnable code or an exact
  command.
- **Type consistency:** `orgRole: OrgRole | null` is named and typed identically across
  Task 1's route response, Task 2's `FetchResult`/cache/return, and Task 3's destructure —
  checked field-by-field.
