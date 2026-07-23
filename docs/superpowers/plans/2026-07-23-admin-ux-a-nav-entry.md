# AX-A: Nav Entry Point + platformRole Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a logged-in super_admin a visible, always-available way to reach `/admin` from
the app header.

**Architecture:** `/api/me` gains one additional response field (`platformRole`, already
computed server-side in `resolveCallerContext()` — no new lookup). `useIdentity()` exposes
it as a new sibling return field, alongside the existing frozen `identity`/`hydrated` pair —
`Identity` itself (D53) does not change shape. A new small client component,
`AdminNavLink`, reads that field and renders a header link only for `platformRole ===
"super_admin"`; it is wired into the root layout next to the existing `IdentityChip`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, the existing `useIdentity()`
hook pattern, shadcn `Button` (Base UI `render` prop).

## Global Constraints

- Index doc: `docs/superpowers/plans/2026-07-23-admin-ux-index.md` — read its "Testing
  convention note" before starting. This plan touches a route handler, a hook, and two
  components; none of that layer is unit-tested anywhere in this repo (vitest runs in plain
  Node, no jsdom/RTL). Verification here is `npm run build` + `npm test` (regression) +
  manual browser check — not new component/route tests.
- `Identity` (`src/lib/identity.ts`) is frozen at `{ name, role }` per D53 — do not add
  fields to it. `platformRole` is carried as a sibling value, never merged into `Identity`.
- Controls must be shadcn primitives only (CLAUDE.md) — the nav link uses `Button` with the
  `render` prop, never a raw `<a>`/`<button>`.
- No redirect-on-login — `/admin` is a side destination a super_admin can navigate to, not a
  takeover of their default landing page (D85 stands unchanged).

---

### Task 1: Expose `platformRole` from `/api/me`

**Files:**
- Modify: `src/app/api/me/route.ts`

**Interfaces:**
- Consumes: `caller.platformRole` — already present on `CallerContext` (`src/lib/dal-logic.ts:7`, type `PlatformRole = "super_admin" | "member"`), returned by `resolveCallerContext()` (`src/lib/dal.ts:19`). No new server-side lookup needed.
- Produces: `/api/me`'s JSON response gains a `platformRole: "super_admin" | "member"` field, alongside the existing `name` and `role` fields. Consumed by Task 2.

- [ ] **Step 1: Add `platformRole` to the response**

Edit `src/app/api/me/route.ts` — the current `GET` handler ends with:

```ts
  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
  });
}
```

Change it to:

```ts
  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    platformRole: caller.platformRole,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: builds successfully, no type errors in `src/app/api/me/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/me/route.ts
git commit -m "feat(admin): expose platformRole from /api/me"
```

---

### Task 2: Extend `useIdentity()` with `platformRole`

**Files:**
- Modify: `src/hooks/use-identity.ts`

**Interfaces:**
- Consumes: `/api/me`'s JSON response now includes `platformRole` (Task 1). `PlatformRole` type from `src/lib/dal-logic.ts` (pure types/logic file, no `server-only` import — safe to import into a `"use client"` file).
- Produces: `useIdentity()` now returns `{ identity: Identity | null; hydrated: boolean; platformRole: PlatformRole | null }`. `platformRole` is `null` until hydrated (mirrors how `identity` behaves pre-hydration). Consumed by Task 3.

- [ ] **Step 1: Rewrite the hook to carry `platformRole` through the same cache/dedup**

Replace the full contents of `src/hooks/use-identity.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// Module-level cache + in-flight dedup: multiple components call this hook (the identity
// chip, admin nav link, plus prompt/image-gen/video-prompt focus views), and any of them
// can mount/remount independently. Without this, each mount fires its own /api/me request
// — observed firing dozens of times per canvas session. Sign-out does a full page
// navigation (redirect()), which tears down this module's state naturally, so no manual
// invalidation is needed.
type FetchResult = { identity: Identity | null; platformRole: PlatformRole | null };

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<FetchResult> | null = null;

function fetchIdentity(): Promise<FetchResult> {
  if (!inFlightFetch) {
    inFlightFetch = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data): FetchResult =>
        data && typeof data.name === "string"
          ? {
              identity: { name: data.name, role: data.role } as Identity,
              platformRole: (data.platformRole as PlatformRole | undefined) ?? null,
            }
          : { identity: null, platformRole: null },
      )
      .catch((): FetchResult => ({ identity: null, platformRole: null }));
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole` is an additive sibling field (gates the admin nav link) — Identity
// itself never changes shape. `hydrated` flips true once the fetch resolves; until then
// identity/platformRole === null means "not checked yet", so consumers must wait for
// `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [hydrated, setHydrated] = useState(cachedHydrated);

  useEffect(() => {
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated, platformRole };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: builds successfully. This confirms every existing call site of `useIdentity()`
(identity chip, prompt/image-gen/video-prompt focus views) still destructures fine, since
`identity`/`hydrated` are unchanged and `platformRole` is additive.

- [ ] **Step 3: Regression test suite**

Run: `npm test`
Expected: all existing tests still pass (this hook has no dedicated test file — see Global
Constraints — this just confirms no unrelated breakage).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-identity.ts
git commit -m "feat(admin): carry platformRole through useIdentity"
```

---

### Task 3: Create `AdminNavLink` and wire it into the header

**Files:**
- Create: `src/components/identity/admin-nav-link.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `useIdentity()` from Task 2 (`{ hydrated, platformRole }`). `Button` from `src/components/ui/button.tsx` (same `nativeButton={false}` + `render={<Link .../>}` pattern already used in `src/app/admin/page.tsx:20-23` and `IdentityChip`'s sign-out button).
- Produces: `AdminNavLink` component, rendered in the root layout's header, immediately before `IdentityChip`.

- [ ] **Step 1: Write the component**

Create `src/components/identity/admin-nav-link.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useIdentity } from "@/hooks/use-identity";
import { Button } from "@/components/ui/button";

// Only rendered for platform-level super_admins — a regular org owner (including one
// created via /admin/orgs/new) never sees this. Not a redirect: a super_admin's default
// landing stays the normal app, scoped to their own org (D85) — /admin is an
// always-available side destination, not a takeover.
export function AdminNavLink() {
  const { hydrated, platformRole } = useIdentity();
  if (!hydrated || platformRole !== "super_admin") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/admin">Admin</Link>}
    />
  );
}
```

- [ ] **Step 2: Wire it into the header**

In `src/app/layout.tsx`, add the import alongside the existing `IdentityChip` import:

```ts
import { IdentityChip } from "@/components/identity/identity-chip";
```

becomes:

```ts
import { IdentityChip } from "@/components/identity/identity-chip";
import { AdminNavLink } from "@/components/identity/admin-nav-link";
```

Then change the header's right-hand side from:

```tsx
          <IdentityChip />
        </header>
```

to:

```tsx
          <div className="flex items-center gap-3">
            <AdminNavLink />
            <IdentityChip />
          </div>
        </header>
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification on staging**

Run the app against staging (`npm run env:staging`), then in the browser:
1. Log in as the super_admin (`developer@yuvabe.com`). Confirm an "Admin" link now appears
   in the header, next to the identity chip, and clicking it navigates to `/admin`.
2. Log in as a regular org owner (any onboarded agency's owner account). Confirm no "Admin"
   link appears anywhere in the header.
3. Confirm the existing `IdentityChip` (name + sign-out) still renders correctly in both
   cases, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/identity/admin-nav-link.tsx src/app/layout.tsx
git commit -m "feat(admin): add header nav link to /admin for super_admin"
```

---

## Self-Review Notes

- **Spec coverage:** this plan covers spec §2 in full (nav entry point + platformRole
  plumbing). §3-§6 are deferred to AX-B through AX-E per the index doc.
- **Type consistency:** `PlatformRole` name and `"super_admin" | "member"` values are used
  identically across all three tasks, matching `src/lib/dal-logic.ts:1`. `useIdentity()`'s
  return shape (`{ identity, hydrated, platformRole }`) is defined once in Task 2 and
  consumed as-is in Task 3, no renaming.
- **No placeholders:** every step shows complete, exact code — nothing deferred to "handle
  appropriately."
