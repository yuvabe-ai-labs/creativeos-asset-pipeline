# First-Time / Reset Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone who logs in with a temp password (a newly onboarded agency owner, or an
existing member whose password an admin reset) must set their own password before reaching
anything else in the app.

**Architecture:** A `must_change_password` boolean lives in `auth.users.app_metadata` (same
mechanism already used for `platform_role`). `src/proxy.ts` — the existing middleware that
already gates "must be logged in" — is extended to also gate "must not still owe a password
change," redirecting to a new `/account/password` page. Two existing functions
(`createOrgWithOwner`, `resetMemberPassword`) start setting the flag; a new server action
clears it after a successful password change and forces a session refresh so the cleared
flag takes effect immediately, not on the next token refresh.

**Tech Stack:** Next.js Server Actions, `@supabase/ssr` (session-bound client) +
`@supabase/supabase-js` admin API (service-role client), Zod, Vitest.

## Global Constraints

- Reuses `auth.users.app_metadata` — no new table, no migration (see design spec's Data
  model section, `docs/superpowers/specs/2026-07-27-first-login-password-reset-design.md`).
- Password minimum is **8 characters** — matches the existing convention in
  `src/lib/orgs/org-schema.ts`'s `parseResetPassword` (`reset-password-dialog.tsx`'s
  placeholder copy), not a new rule.
- `src/proxy.ts` does **no DB queries** (its own header comment: "OPTIMISTIC session check
  only — no DB queries, no org resolution, that is the DAL's job"). The enforcement check
  must read `user.app_metadata` directly off the `getUser()` result already fetched there —
  never call `resolveCallerContext()` (which does a membership DB query) from `proxy.ts`.
- One generic message covers both trigger paths: **"Set a new password to continue."** No
  need to distinguish "new agency owner" vs. "admin reset your password" in the UI copy.
- Any function that updates an **existing** user's `app_metadata` via the Supabase admin API
  must fetch-merge-write, never pass a bare object literal — `resetMemberPassword` calling
  `updateUserById(userId, { app_metadata: { must_change_password: true } })` directly would
  silently wipe that user's `platform_role` if they have one.
- Out of scope (do not build): password complexity rules beyond the 8-char minimum, changes
  to `generateTempPassword`/how temp passwords are shown, rate limiting on the password form.

---

### Task 1: `mustChangePassword` on `CallerContext` — pure mapping + wiring

**Files:**
- Modify: `src/lib/dal-logic.ts`
- Modify: `src/lib/dal.ts:19-49` (`resolveCallerContext`)
- Test: `src/lib/dal-logic.test.ts`
- Modify: `src/app/api/nodes/[id]/file/drive/route.test.ts:21-26` (mock literal needs the new
  required field)

**Interfaces:**
- Produces: `mapAppMetadataToMustChangePassword(appMetadata: unknown): boolean` — exported
  from `src/lib/dal-logic.ts`, used directly by Task 2 (`proxy.ts`, which reads
  `user.app_metadata` itself, no DB query).
- Produces: `CallerContext` gains a new required field `mustChangePassword: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/dal-logic.test.ts` (new `describe` block, alongside the existing
`mapAppMetadataToPlatformRole`/`orgRoleToIdentityRole` ones):

```ts
describe("mapAppMetadataToMustChangePassword", () => {
  it("reads true from app_metadata", () => {
    expect(mapAppMetadataToMustChangePassword({ must_change_password: true })).toBe(true);
  });
  it("defaults to false for anything else (fail open — most logins don't owe a change)", () => {
    expect(mapAppMetadataToMustChangePassword({ must_change_password: false })).toBe(false);
    expect(mapAppMetadataToMustChangePassword({})).toBe(false);
    expect(mapAppMetadataToMustChangePassword(null)).toBe(false);
    expect(mapAppMetadataToMustChangePassword(undefined)).toBe(false);
    expect(mapAppMetadataToMustChangePassword({ must_change_password: "true" })).toBe(false); // wrong type
    expect(mapAppMetadataToMustChangePassword(true)).toBe(false); // wrong shape entirely
  });
});
```

Update the top import line of the same file to include the new function:

```ts
import { mapAppMetadataToPlatformRole, orgRoleToIdentityRole, mapAppMetadataToMustChangePassword } from "./dal-logic";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dal-logic.test.ts`
Expected: FAIL — `mapAppMetadataToMustChangePassword is not a function` (or a TS error, not exported yet).

- [ ] **Step 3: Implement the pure helper and extend the type**

In `src/lib/dal-logic.ts`, add the new field to `CallerContext` (after `orgRole`):

```ts
export type CallerContext = {
  userId: string;
  email: string | null;
  platformRole: PlatformRole;
  orgId: string;
  orgRole: OrgRole;
  mustChangePassword: boolean;
};
```

Add the new function right after `mapAppMetadataToPlatformRole`:

```ts
// Reads the forced-password-change flag from a JWT's app_metadata. Anything that isn't the
// literal boolean `true` is treated as "no change owed" — fail open here (unlike
// mapAppMetadataToPlatformRole's fail-closed default), since the cost of getting this wrong
// the OTHER way is locking every ordinary login out of the app on a malformed/missing flag.
export function mapAppMetadataToMustChangePassword(appMetadata: unknown): boolean {
  return (
    appMetadata !== null &&
    typeof appMetadata === "object" &&
    (appMetadata as Record<string, unknown>).must_change_password === true
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dal-logic.test.ts`
Expected: PASS (both new `it` blocks).

- [ ] **Step 5: Wire it into `resolveCallerContext`**

In `src/lib/dal.ts`, update the import (line 6-10) to include the new function:

```ts
import {
  mapAppMetadataToPlatformRole,
  mapAppMetadataToMustChangePassword,
  type CallerContext,
  type OrgRole,
} from "./dal-logic";
```

Then in `resolveCallerContext` (around line 26, right after `const platformRole = ...`), add:

```ts
  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);
  const mustChangePassword = mapAppMetadataToMustChangePassword(user.app_metadata);
```

And add it to the returned object (around line 42-48):

```ts
  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: membership.org_id as string,
    orgRole: membership.org_role as OrgRole,
    mustChangePassword,
  };
```

- [ ] **Step 6: Fix the now-broken test mock**

`src/app/api/nodes/[id]/file/drive/route.test.ts` mocks `resolveCallerContext`'s return value
as a plain object literal — TypeScript will now flag it as missing the new required field
(and even if it didn't, this keeps the mock's shape honest). Update lines 21-26:

```ts
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
```

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `npx vitest run` — Expected: all tests pass (no new failures).
Run: `npx tsc --noEmit -p .` — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dal-logic.ts src/lib/dal-logic.test.ts src/lib/dal.ts "src/app/api/nodes/[id]/file/drive/route.test.ts"
git commit -m "feat(auth): add mustChangePassword to CallerContext"
```

---

### Task 2: Enforce the redirect in `src/proxy.ts`

**Files:**
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `mapAppMetadataToMustChangePassword` from `src/lib/dal-logic.ts` (Task 1).
- Produces: nothing new for later tasks to consume — this is the enforcement point, it just
  needs `/account/password` (Task 6) to exist as a real route by the time this ships.

- [ ] **Step 1: Add the import and the redirect check**

In `src/proxy.ts`, add the import at the top:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { mapAppMetadataToMustChangePassword } from "@/lib/dal-logic";
```

Then, right after the existing `if (!user) { ... }` block (currently lines 38-44) and before
`return response;`, add:

```ts
  if (mapAppMetadataToMustChangePassword(user.app_metadata) && !path.startsWith("/account/password")) {
    if (isApi) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }
    const changePasswordUrl = new URL("/account/password", request.url);
    return NextResponse.redirect(changePasswordUrl);
  }

  return response;
```

The full function body (for context — this is what it should look like after the edit):

```ts
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api");

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (mapAppMetadataToMustChangePassword(user.app_metadata) && !path.startsWith("/account/password")) {
    if (isApi) {
      return NextResponse.json({ error: "Password change required" }, { status: 403 });
    }
    const changePasswordUrl = new URL("/account/password", request.url);
    return NextResponse.redirect(changePasswordUrl);
  }

  return response;
}
```

The `config.matcher` at the bottom of the file needs no change — `/account/password` isn't in
the exclusion list, so the proxy already runs on it (required, since the redirect check itself
needs to run there to let it through via the `!path.startsWith(...)` guard).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

*(No automated test for this step — `proxy.ts` has no existing test file and runs in the Edge
middleware runtime, which isn't exercised by this project's Vitest setup. Verified manually in
Task 7's end-to-end check instead, once the full flow exists.)*

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): redirect to /account/password when a password change is owed"
```

---

### Task 3: `setMustChangePassword` DB helper + wire into the two temp-password call sites

**Files:**
- Modify: `src/lib/db/organizations.ts`

**Interfaces:**
- Produces: `setMustChangePassword(userId: string, value: boolean): Promise<void>` —
  exported from `src/lib/db/organizations.ts`. Task 5 (the change-password server action)
  calls this with `false`.
- `createOrgWithOwner`'s existing return shape (`{ orgId, userId, tempPassword }`) is
  unchanged — no consumer of it needs to know about this flag.
- `resetMemberPassword`'s existing signature (`orgId, userId, newPassword`) and return type
  (`Promise<void>`) are unchanged.

- [ ] **Step 1: Add the safe fetch-merge-write helper**

In `src/lib/db/organizations.ts`, add this function (a good spot is right before
`resetMemberPassword`, since it's used by it):

```ts
// Safely sets/clears the forced-password-change flag on an EXISTING user's app_metadata.
// Never pass a bare `{ must_change_password: value }` object literal to
// auth.admin.updateUserById — it would silently wipe any other app_metadata that user
// already has (e.g. platform_role), the same trap docs/auth-bootstrap.md's own bootstrap
// step avoids by merging via Postgres's `||` operator instead of the admin API directly.
export async function setMustChangePassword(userId: string, value: boolean): Promise<void> {
  const supabase = createServerSupabase();
  const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr) throw getErr;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing.user.app_metadata, must_change_password: value },
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Wire it into `resetMemberPassword`**

Find `resetMemberPassword` (currently around line 210-230). Add the call right after the
existing `updateUserById` call that sets the new password:

```ts
export async function resetMemberPassword(
  orgId: string,
  userId: string,
  newPassword: string,
): Promise<void> {
  const supabase = createServerSupabase();

  const { data: membership, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!membership) throw new Error("Member not found in this agency.");

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw error;

  await setMustChangePassword(userId, true);
}
```

- [ ] **Step 3: Wire the flag into `createOrgWithOwner`'s fresh-user creation**

Find the `supabase.auth.admin.createUser` call inside `createOrgWithOwner` (currently around
line 270-275). This is a **fresh** object literal (a brand-new user, not an update), so the
flag goes directly in the same `app_metadata` object — no merge helper needed here:

```ts
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { platform_role: "member", must_change_password: true },
  });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

*(No automated test for this step, same reasoning as Task 2 — `createOrgWithOwner` and
`resetMemberPassword` already have no unit tests in this codebase; they touch the Supabase
admin API directly and are verified live. This plan's Task 7 includes an explicit end-to-end
manual check covering both.)*

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/organizations.ts
git commit -m "feat(auth): set must_change_password on temp-password issuance"
```

---

### Task 4: `ChangePasswordSchema`

**Files:**
- Create: `src/lib/auth/change-password-schema.ts`
- Test: `src/lib/auth/change-password-schema.test.ts`

**Interfaces:**
- Produces: `ChangePasswordSchema` (a Zod object schema) and `type ChangePasswordFields =
  z.infer<typeof ChangePasswordSchema>` — both exported, consumed by Task 5's server action.
  Fields: `{ password: string; confirmPassword: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/change-password-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ChangePasswordSchema } from "./change-password-schema";

describe("ChangePasswordSchema", () => {
  it("accepts a valid 8+ char password with a matching confirmation", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "goodpass123",
      confirmPassword: "goodpass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "short1",
      confirmPassword: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when password and confirmPassword don't match", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "goodpass123",
      confirmPassword: "differentpass123",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/change-password-schema.test.ts`
Expected: FAIL — module `./change-password-schema` doesn't exist yet.

- [ ] **Step 3: Write the schema**

Create `src/lib/auth/change-password-schema.ts`:

```ts
import * as z from "zod";

// Mirrors login-schema.ts's shape. 8-char minimum matches the existing convention in
// src/lib/orgs/org-schema.ts's parseResetPassword (reset-password-dialog.tsx's placeholder
// copy) — not a new rule, the same floor applied everywhere else a password gets set.
export const ChangePasswordSchema = z
  .object({
    password: z.string().min(8, { error: "Password must be at least 8 characters." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordFields = z.infer<typeof ChangePasswordSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/change-password-schema.test.ts`
Expected: PASS (all 3 `it` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/change-password-schema.ts src/lib/auth/change-password-schema.test.ts
git commit -m "feat(auth): add ChangePasswordSchema"
```

---

### Task 5: `changePasswordAction` server action

**Files:**
- Create: `src/lib/actions/account.ts`

**Interfaces:**
- Consumes: `ChangePasswordSchema` (Task 4), `setMustChangePassword` (Task 3),
  `resolveCallerContext` (`src/lib/dal.ts`, already exists), `createSSRServerClient`
  (`src/lib/supabase/ssr-server.ts`, already exists).
- Produces: `changePasswordAction(_prev: ChangePasswordState, formData: FormData):
  Promise<ChangePasswordState>` and `type ChangePasswordState = { error?: string } |
  undefined` — both exported, consumed by Task 6's form component (same
  `useActionState`-compatible shape as `loginAction`/`createOrgAction`).

- [ ] **Step 1: Write the server action**

There's no automated test for this step (same reasoning as Task 2/3 — it's a Server Action
that touches live Supabase Auth session/admin APIs; this codebase's existing actions of this
kind, e.g. `loginAction`, `createOrgAction`, have no unit tests either). Write it directly,
then verify manually in Task 7.

Create `src/lib/actions/account.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { resolveCallerContext } from "@/lib/dal";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { setMustChangePassword } from "@/lib/db/organizations";
import { ChangePasswordSchema } from "@/lib/auth/change-password-schema";

export type ChangePasswordState = { error?: string } | undefined;

// Order matters here: the flag must be cleared BEFORE the session is refreshed. If the order
// were reversed, the refreshed access token would still carry the old (true) flag baked in,
// and proxy.ts's check would bounce the user right back to /account/password even though
// they just successfully changed it.
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const caller = await resolveCallerContext();

  const parsed = ChangePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createSSRServerClient();
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateErr) {
    return { error: updateErr.message };
  }

  await setMustChangePassword(caller.userId, false);

  // Force a fresh access token NOW, reflecting the just-cleared flag — see the ordering
  // note above.
  await supabase.auth.refreshSession();

  redirect("/");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/account.ts
git commit -m "feat(auth): add changePasswordAction"
```

---

### Task 6: `/account/password` page + form

**Files:**
- Create: `src/app/account/password/page.tsx`
- Create: `src/app/account/password/change-password-form.tsx`

**Interfaces:**
- Consumes: `changePasswordAction`, `ChangePasswordState` (Task 5); `createSSRServerClient`
  (already exists); `mapAppMetadataToMustChangePassword` (Task 1).

- [ ] **Step 1: Write the page (server component)**

Create `src/app/account/password/page.tsx`. This mirrors `src/app/login/page.tsx`'s card
layout. The gate here is deliberately a **direct** `getUser()` check, not a full
`resolveCallerContext()` call — matches `proxy.ts`'s own "no unnecessary DB query" philosophy
for this narrow check (no org-membership lookup is needed just to read one flag off the JWT):

```tsx
import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { mapAppMetadataToMustChangePassword } from "@/lib/dal-logic";
import { ChangePasswordForm } from "./change-password-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Set a new password — CreativeOS" };

export default async function ChangePasswordPage() {
  const supabase = await createSSRServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!mapAppMetadataToMustChangePassword(user.app_metadata)) redirect("/");

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-20">
      <Card className="w-full max-w-sm p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Set a new password to continue.
        </p>
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Write the form (client component)**

Create `src/app/account/password/change-password-form.tsx`. Mirrors
`src/app/login/login-form.tsx`'s `useActionState` shape exactly:

```tsx
"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npx eslint src/app/account/password/page.tsx src/app/account/password/change-password-form.tsx` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/account/password/
git commit -m "feat(auth): add /account/password page"
```

---

### Task 7: End-to-end verification + ADR log update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, append)

This task has no code changes beyond the ADR entry — it's the manual verification pass for
everything Tasks 1-6 built together, plus recording the decision reversal.

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run` — Expected: all tests pass, including the new ones from Tasks 1 and 4.
Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npx eslint .` (or the touched-files subset) — Expected: no new errors.
Run: `npx next build` — Expected: succeeds, `/account/password` appears in the route list.

- [ ] **Step 2: Manual end-to-end check — new agency owner**

1. Create a new agency via the "+ New agency" dialog on `/admin`. Copy the temp password
   shown once.
2. Sign out (if signed in as anything else), sign in as the new owner with the temp password.
3. **Expected:** land on `/account/password`, NOT on `/` or any canvas — confirms
   `proxy.ts`'s redirect fires.
4. Try navigating directly to `/` or `/admin` while still on this page (paste the URL).
   **Expected:** bounced back to `/account/password` every time — confirms the lockout is
   real, not just a first-paint redirect.
5. Submit a password shorter than 8 characters. **Expected:** inline error, still on
   `/account/password`.
6. Submit two different values for password/confirm. **Expected:** inline error.
7. Submit a valid new password (8+ chars, matching confirm). **Expected:** redirected to `/`
   and the normal app loads — the canvas/client list, not another bounce back to
   `/account/password`. **This specific check is the one covering the session-refresh
   ordering bug** flagged in the design spec — if it loops back, the ordering in Task 5's
   `changePasswordAction` needs re-checking (flag-clear must happen before `refreshSession`).
8. Sign out, sign back in with the NEW password. **Expected:** goes straight to `/`, no
   `/account/password` redirect this time — confirms the flag actually cleared, not just a
   one-time session-token fluke.

- [ ] **Step 3: Manual end-to-end check — admin-reset existing member**

1. As a super_admin, open an existing agency's member list and use "Reset password" on a
   real member (not yourself, to avoid needing to re-auth mid-check) — set a specific
   password via the dialog's "Set specific password" mode.
2. Sign in as that member with the password just set.
3. **Expected:** same as above — lands on `/account/password`, must change it before
   reaching anything else.

- [ ] **Step 4: Confirm ordinary logins are unaffected**

Sign in as an existing user who has never had `must_change_password` set (any account that
existed before this feature shipped). **Expected:** logs straight through to `/`, no
`/account/password` redirect — confirms `mapAppMetadataToMustChangePassword`'s fail-open
default (Task 1) doesn't accidentally lock out everyone else.

- [ ] **Step 5: Append the ADR entry**

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, after the
last existing decision entry:

```markdown
### D91 — Forced password change on first login/reset is reinstated; reverses D84 *(recorded 2026-07-27)*

**Decision.** Anyone logging in with a temp password (new agency owner via
`createOrgWithOwner`, or an existing member via `resetMemberPassword`) is redirected to
`/account/password` and blocked from the rest of the app until they set their own password.
Tracked via a `must_change_password` flag in `auth.users.app_metadata`, enforced in
`src/proxy.ts`.

**Why.** Requirements changed — needed now, independent of D84's original pilot-scope
reasoning.

**Rejected.** Leaving D84's "log straight through" behavior in place.

**Refines →** D84.
**Originated →** `2026-07-27-first-login-password-reset-design.md`.
```

- [ ] **Step 6: Commit**

```bash
git add "docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md"
git commit -m "docs(adr): record D91 — reinstate forced password change, reverses D84"
```
