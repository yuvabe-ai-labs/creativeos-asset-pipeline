# Auth Stage 1C — Login & Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the switch. After this sub-plan, the app requires login for the first time: a real user signs in and sees only their own org's clients — while Yuvabe's own data and workflows keep working exactly as before.

**Architecture:** Build the login surface *before* activating enforcement, so there's always a page to land on. Order within this sub-plan matters: (1) login page + sign-in/sign-out actions first, (2) `proxy.ts` activates — safe now that `/login` exists to redirect to, (3) `withClient()` starts enforcing org checks, (4) list/create queries become org-scoped, (5) `useIdentity()` swaps from localStorage to `/api/me` (built in 1B) and the old blocking "who are you?" gate is removed. Each task individually keeps the app in a working state; only after task 2 (proxy activates) does login actually become mandatory — that is the deliberate "switch flip" moment, done deliberately in the middle so login exists first and isolation lands right after.

**Deferred scope (D84):** forced password change on first login is cut from this pilot pass to
reduce complexity — every login (operator or future agency owner) just signs in with whatever
password they were given, no forced reset. See the ADR entry for why and what this changes for
1D's onboarding flow.

**Tech Stack:** Next.js 16 (`proxy.ts`, Server Actions, `useActionState`), `@supabase/ssr`, Zod v4, shadcn/Base UI primitives (`Button`, `Input`, `Label`, `Card`), Vitest.

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` · **Spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 1) · **Follows:** 1A (schema + data migration, done), 1B (session foundation — DAL, `/api/me`, `requireSuperAdmin`, done)

## Global Constraints

- **Controls: shadcn primitives only.** Every interactive control (`Button`, `Input`, `Label`) comes from `src/components/ui/*`. Never a raw `<button>`/`<input>`. Base UI composes via the `render` prop, not `asChild`.
- **API routes:** use `apiError` / `apiOk` from `src/lib/api/route-helpers.ts` — never `NextResponse.json(...)` directly.
- **`useIdentity()` public API is frozen (D53).** Return shape becomes `{ identity: Identity | null; hydrated: boolean }`. `setIdentity` is removed — login owns identity now. `Identity` type stays `{ name: string; role: "senior" | "designer" }`, unchanged.
- **Owner = full access.** `orgRoleToIdentityRole` (built in 1B) already maps owner→senior; nothing new to build here — just consume `/api/me`, which already returns the right shape.
- **No RLS in Stage 1.** Still not this sub-plan's job (Stage 2).
- **Order within this plan is load-bearing:** build login (Task 1–2) before activating `proxy.ts` (Task 3) — never the reverse, or every route including the not-yet-built login page would redirect to itself.
- **Reuse before redeclaring:** `resolveCallerContext`, `resolveOrgId`, `orgRoleToIdentityRole`, `requireSuperAdmin` already exist from 1B — import them, don't rewrite.

## File Structure

**New files**
| File | Responsibility |
|---|---|
| `src/lib/auth/login-schema.ts` + `.test.ts` | `LoginSchema` (Zod) — pure, unit-tested |
| `src/lib/actions/auth.ts` | `loginAction`, `logoutAction` |
| `src/app/login/page.tsx` + `login-form.tsx` | Login page (email + password) |
| `src/proxy.ts` | Next 16 proxy — optimistic session check, activated |

**Modified files**
| File | Change |
|---|---|
| `src/lib/api/route-helpers.ts` | `withClient()` gains org check + super_admin bypass |
| `src/lib/db/types.ts` | `ClientRow` gains `org_id: string` |
| `src/lib/db/clients.ts` | `listClients`, `listArchivedClients`, `createClient` become org-scoped |
| `src/lib/db/canvases.ts` | `listRecentCanvases` becomes org-scoped |
| `src/lib/actions/clients.ts` | `createClientAction` resolves caller context, injects `orgId` |
| `src/app/page.tsx` | Resolves caller context; passes scope to list queries |
| `src/hooks/use-identity.ts` | Internals swap to `/api/me`; `setIdentity` removed |
| `src/components/identity/identity-chip.tsx` | Shows display name + sign-out (no switch dialog) |
| `src/app/layout.tsx` | Header renders `IdentityChip` |
| `src/app/clients/[id]/canvases/[cid]/page.tsx` | `IdentityGate` wrapper removed |

**Deleted files**
| File | Why |
|---|---|
| `src/components/identity/identity-gate.tsx`, `identity-dialog.tsx`, `gate-logic.ts`, `identity-gate.test.ts` | Login redirect replaces the "who are you?" gate entirely |

---

## Task 1: Login schema + auth actions (TDD for the schema)

**Files:**
- Create: `src/lib/auth/login-schema.ts` + `src/lib/auth/login-schema.test.ts`
- Create: `src/lib/actions/auth.ts`

**Interfaces:**
- Produces: `LoginSchema` (Zod: `email`, `password`), `loginAction(prev, formData)`, `logoutAction()`.

- [ ] **Step 1: Write the failing login-schema test**

Create `src/lib/auth/login-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LoginSchema } from "./login-schema";

describe("LoginSchema", () => {
  it("accepts a valid email + password", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(LoginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("rejects an empty password", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run login-schema`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement the schema**

Create `src/lib/auth/login-schema.ts`:

```ts
import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
});

export type LoginFields = z.infer<typeof LoginSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run login-schema`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the auth actions**

Create `src/lib/actions/auth.ts`. No forced password change (D84) — a successful sign-in goes
straight to `/`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { LoginSchema } from "@/lib/auth/login-schema";

export type AuthActionState = { error?: string } | undefined;

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSSRServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSSRServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/login-schema.ts src/lib/auth/login-schema.test.ts src/lib/actions/auth.ts
git commit -m "feat(auth): login schema (TDD) + sign-in/sign-out actions"
```

---

## Task 2: Login page

**Files:**
- Create: `src/app/login/page.tsx` + `src/app/login/login-form.tsx`

**Interfaces:**
- Consumes: `loginAction` (Task 1).

- [ ] **Step 1: Build the login form (client component)**

Create `src/app/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Build the login page**

Create `src/app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Sign in — CreativeOS" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-20">
      <Card className="w-full max-w-sm p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Welcome back to CreativeOS.
        </p>
        <LoginForm />
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification — login works, proxy not active yet**

Run: `npm run env:staging`. Visit `/login`, sign in with the bootstrapped super_admin credentials (`developer@yuvabe.com`, from 1A).
Expected: redirected to `/`. The home page still shows unfiltered data (proxy/withClient enforcement isn't active until Tasks 3–5) — that's expected at this point.

- [ ] **Step 5: Commit**

```bash
git add src/app/login
git commit -m "feat(auth): login page"
```

---

## Task 3: Activate `proxy.ts` — the switch flip

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Produces: a Next 16 proxy that redirects unauthenticated page requests to `/login`, returns 401 JSON for unauthenticated `/api/*` requests (except webhooks), and refreshes the session cookie.

- [ ] **Step 1: Write the proxy**

Create `src/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 proxy (renamed from middleware). OPTIMISTIC session check only — no DB
// queries, no org resolution (that is the DAL's job, per D51). Also refreshes the
// Supabase auth cookie so sessions stay alive.
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

  return response;
}

// Run on everything EXCEPT: /login, webhooks (server-to-server, no session), Next
// internals, and static assets.
export const config = {
  matcher: [
    "/((?!login|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)$).*)",
  ],
};
```

- [ ] **Step 2: Manual verification — the switch has flipped**

Restart `npm run env:staging`. In a private/incognito window (no session), visit `http://localhost:3000/`.
Expected: redirected to `/login`. Then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/clients/anything` (no cookies) → `401`. Then sign in as `developer@yuvabe.com` at `/login` → lands on `/` and the app is usable exactly as before (isolation itself is Tasks 4–5, not yet active).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): activate proxy.ts — login now required for every route"
```

---

## Task 4: `withClient()` org check + `ClientRow.org_id`

**Files:**
- Modify: `src/lib/db/types.ts`
- Modify: `src/lib/api/route-helpers.ts:32-40`

**Interfaces:**
- Consumes: `resolveCallerContext` (from `src/lib/dal.ts`, built in 1B).
- Produces: `withClient()` unchanged signature, now 404s when `client.org_id !== caller.orgId` (unless super_admin).

- [ ] **Step 1: Add `org_id` to `ClientRow`**

In `src/lib/db/types.ts`, find the `ClientRow` type and add `org_id: string;` alongside its existing fields (matching the column added in migration `0013`).

- [ ] **Step 2: Update `withClient`**

In `src/lib/api/route-helpers.ts`, add the import at the top:

```ts
import { resolveCallerContext } from "@/lib/dal";
```

Replace the `withClient` function body:

```ts
export async function withClient(
  params: Promise<{ id: string }>,
  handler: (clientId: string, client: ClientRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return apiError("Client not found.", 404);

  // Org isolation: a client outside the caller's org is a 404 (never 403 — do not
  // confirm foreign resources exist). super_admin bypasses the org check.
  const caller = await resolveCallerContext();
  if (caller.platformRole !== "super_admin" && client.org_id !== caller.orgId) {
    return apiError("Client not found.", 404);
  }
  return handler(clientId, client);
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/route-helpers.ts src/lib/db/types.ts
git commit -m "feat(auth): withClient enforces org isolation with super_admin bypass"
```

---

## Task 5: Org-scope the list/create queries

**Files:**
- Modify: `src/lib/db/clients.ts` (`listClients`, `listArchivedClients`, `createClient`)
- Modify: `src/lib/db/canvases.ts` (`listRecentCanvases`)
- Modify: `src/lib/actions/clients.ts` (`createClientAction`)
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `resolveCallerContext` (1B).
- Produces:
  - `listClients(scope: { orgId: string; isSuperAdmin: boolean }): Promise<ClientWithCount[]>`
  - `listArchivedClients(scope: { orgId: string; isSuperAdmin: boolean }): Promise<ClientWithCount[]>`
  - `listRecentCanvases(scope: { orgId: string; isSuperAdmin: boolean }, limit?: number): Promise<RecentCanvas[]>`
  - `createClient(input: { name: string; orgId: string }): Promise<ClientRow>`

- [ ] **Step 1: Update `listClients` and `listArchivedClients`**

In `src/lib/db/clients.ts`:

```ts
export async function listClients(scope: {
  orgId: string;
  isSuperAdmin: boolean;
}): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  let query = supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (!scope.isSuperAdmin) query = query.eq("org_id", scope.orgId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}

export async function listArchivedClients(scope: {
  orgId: string;
  isSuperAdmin: boolean;
}): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  let query = supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (!scope.isSuperAdmin) query = query.eq("org_id", scope.orgId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}
```

- [ ] **Step 2: Update `createClient` to inject `org_id`**

In `src/lib/db/clients.ts`:

```ts
export async function createClient(input: {
  name: string;
  orgId: string;
}): Promise<ClientRow> {
  const supabase = createServerSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("clients")
    .select("slug");
  if (readErr) throw readErr;
  const slug = uniqueSlug(
    input.name,
    (existing ?? []).map((r: { slug: string }) => r.slug),
  );

  const { data, error } = await supabase
    .from("clients")
    .insert({ slug, name: input.name, org_id: input.orgId })
    .select()
    .single();
  if (error) throw error;
  return data as ClientRow;
}
```

- [ ] **Step 3: Update `listRecentCanvases`**

In `src/lib/db/canvases.ts`:

```ts
export async function listRecentCanvases(
  scope: { orgId: string; isSuperAdmin: boolean },
  limit = 30,
): Promise<RecentCanvas[]> {
  const supabase = createServerSupabase();
  let query = supabase
    .from("canvases")
    .select("*, clients!inner(slug, name, logo_url, org_id)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!scope.isSuperAdmin) query = query.eq("clients.org_id", scope.orgId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as RawRecentCanvasRow[]).map(mapRecentCanvas);
}
```

If `RawRecentCanvasRow`'s embedded `clients` shape errors on the added `org_id` field, add `org_id: string` to that type in the same file.

- [ ] **Step 4: Update `createClientAction`**

Replace `src/lib/actions/clients.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { resolveCallerContext } from "@/lib/dal";

export async function createClientAction(input: { name: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Client needs a name");

  const caller = await resolveCallerContext();
  const client = await createClient({ name, orgId: caller.orgId });
  revalidatePath("/");
  return client;
}
```

- [ ] **Step 5: Update the home page to pass scope**

Replace the top of `src/app/page.tsx`:

```tsx
import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";
import { resolveCallerContext } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const caller = await resolveCallerContext();
  const scope = {
    orgId: caller.orgId,
    isSuperAdmin: caller.platformRole === "super_admin",
  };
  const [clients, archivedClients, recentCanvases] = await Promise.all([
    listClients(scope),
    listArchivedClients(scope),
    listRecentCanvases(scope),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
      />
    </main>
  );
}
```

- [ ] **Step 6: Find and fix any other callers**

Run: `git grep -n "listClients(\|listArchivedClients(\|listRecentCanvases(\|createClient(" -- "src/**/*.ts" "src/**/*.tsx"`
Update any other call site found to pass `scope` (or `orgId` for `createClient`).

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: PASS. This is the strongest signal every call site was updated — a missed one is a type error, not a silent bug.

- [ ] **Step 8: Manual verification — isolation is live**

With `developer@yuvabe.com` logged in (Yuvabe org, 28 pre-existing clients), confirm the home page still shows all 28 (Yuvabe = super_admin, unfiltered). This is the one full end-to-end org-isolation test possible before 1D exists (no second org/user yet to log in as — that arrives with 1D's onboarding UI). Confirms: no regression to Yuvabe's own workflow, which is the load-bearing requirement.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/clients.ts src/lib/db/canvases.ts src/lib/actions/clients.ts src/app/page.tsx
git commit -m "feat(auth): org-scope client and recent-canvas queries"
```

---

## Task 6: `useIdentity()` swap + remove the old gate

**Files:**
- Modify: `src/hooks/use-identity.ts`
- Modify: `src/components/identity/identity-chip.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`
- Delete: `src/components/identity/identity-gate.tsx`, `identity-dialog.tsx`, `gate-logic.ts`, `identity-gate.test.ts`

**Interfaces:**
- Consumes: `GET /api/me` (built in 1B, unused until now).
- Produces: `useIdentity(): { identity: Identity | null; hydrated: boolean }` — `setIdentity` removed.

- [ ] **Step 1: Swap `useIdentity` internals**

Replace `src/hooks/use-identity.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";

// Reads the logged-in user's identity from the session (via /api/me). Public API is
// frozen (D53): { identity, hydrated }. `setIdentity` is gone — login owns identity now.
// `hydrated` flips true once the fetch resolves; until then identity === null means
// "not checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
} {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.name === "string") {
          setIdentity({ name: data.name, role: data.role });
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated };
}
```

- [ ] **Step 2: Rewrite the identity chip as name + sign-out**

Replace `src/components/identity/identity-chip.tsx`:

```tsx
"use client";

import { UserRound } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// Shows the logged-in user's display name + a sign-out button.
export function IdentityChip() {
  const { identity } = useIdentity();
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
        <UserRound className="size-3.5" strokeWidth={1.5} />
        {identity ? identity.name : "…"}
      </span>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
```

Check `src/components/ui/button.tsx` for available `variant`/`size` values first; use the closest existing options if `"ghost"`/`"sm"` aren't defined.

- [ ] **Step 3: Wire the chip into the header**

In `src/app/layout.tsx`, replace the `<span className="text-eyebrow ...">Yuvabe Studios</span>` in the header with `<IdentityChip />`, and add the import: `import { IdentityChip } from "@/components/identity/identity-chip";`.

- [ ] **Step 4: Remove the `IdentityGate` wrapper from the canvas page**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`: delete the `IdentityGate` import, unwrap its children so they render directly (delete the `<IdentityGate>...</IdentityGate>` tags, keep the content between them). Keep the `IdentityChip` import/usage — it now shows sign-out.

- [ ] **Step 5: Delete the obsolete identity files**

```bash
git rm src/components/identity/identity-gate.tsx src/components/identity/identity-dialog.tsx src/components/identity/gate-logic.ts src/components/identity/identity-gate.test.ts
```

- [ ] **Step 6: Search for stragglers**

Run: `git grep -n "identity-gate\|identity-dialog\|gate-logic\|setIdentity" -- "src/**"`
Expected: no results. Fix any import that still references a deleted module.

- [ ] **Step 7: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: both PASS.

- [ ] **Step 8: Manual verification**

Signed in as `developer@yuvabe.com`: header shows "Yuvabe Operator" + a working Sign out button. Open a canvas — no "who are you?" dialog appears, and any prompt/image/video focus view's Approve button still shows (confirms owner→senior mapping works end-to-end through `/api/me`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): swap useIdentity to session; remove the old identity gate"
```

---

## Final verification (1C shippable checklist)

- [ ] `npm test` — all pass
- [ ] `npm run build` — clean
- [ ] Logged out → any page redirects to `/login`; `/api/*` (non-webhook) → 401
- [ ] `developer@yuvabe.com` logs in → sees Yuvabe's 28 clients unfiltered (super_admin) → header shows their name + working sign-out
- [ ] Approve button still shows for the logged-in owner in a prompt/image/video focus view
- [ ] No `identity-gate`/`identity-dialog`/`gate-logic`/`setIdentity` references remain anywhere
- [ ] Six commits made across Tasks 1–6

**Known limitation, by design:** full cross-org isolation (Agency A can't see Yuvabe's data and vice versa) can't be *end-to-end* verified until 1D exists — there's no second org/user yet, since onboarding is a 1D deliverable. What *is* verified here: the enforcement code paths exist and are live (`withClient`'s org check, scoped queries), and Yuvabe's own workflow has zero regression. Note this explicitly in the 1C completion log rather than claiming untested cross-org isolation as done.

**On completion, update the tracker:** set 1C → ✅ in `2026-07-21-auth-stage-1-index.md`, then write sub-plan **1D (Admin Onboarding UI)** — which also delivers the first opportunity to fully verify cross-org isolation end-to-end.

---

## Self-Review notes (traceability)

- **"Flip the switch" ordering** → Task 1–2 (login exists) precede Task 3 (`proxy.ts` activates); explicitly called out in Architecture and Global Constraints as load-bearing order.
- **D53 (frozen `useIdentity`)** → Task 6 Step 1 keeps `{ identity, hydrated }`, drops `setIdentity`.
- **Owner = full access** → no new mapping logic needed; Task 6 just consumes `/api/me`, which 1B already built correctly (`orgRoleToIdentityRole`).
- **"Don't lose the Yuvabe workflow"** → Task 5 Step 8 and the Final checklist both explicitly re-verify Yuvabe's 28 clients are visible and unaffected, not just that new isolation code exists.
- **Honest scope limit stated, not hidden** → the Final verification section names what 1C can't fully prove (cross-org isolation, no second org yet) instead of claiming untested behavior as verified.
- **No RLS, no migrations** → File Structure lists no `supabase/migrations/*`; Global Constraints repeat the Stage 1 rule.
- **Forced password change deferred (D84)** → dropped from Task 1's `loginAction` and from Task 2 entirely (no `/account/password` page); `1D`'s future `createOrgWithOwner` must not set `must_change_password` either — flagged in the ADR so that's not silently reintroduced when 1D is written.
