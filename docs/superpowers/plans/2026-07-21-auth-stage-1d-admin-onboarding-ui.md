# Auth Stage 1D — Admin Onboarding UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yuvabe staff onboard a new agency entirely through the UI — no CLI, no terminal (D82). This is also the first point in the rollout where cross-org isolation becomes end-to-end testable: until now only the Yuvabe org has existed.

**Architecture:** Purely additive — no existing file is modified, no new migration is needed (the schema from 1A already has everything: `organizations`, `profiles`, `org_memberships`). Three new layers on top of what 1B/1C already built: a pure `parseCreditLimit` + Zod schema (TDD), an `organizations` repository (mirrors the shape of `src/lib/db/clients.ts`), and three `requireSuperAdmin`-gated pages (`/admin`, `/admin/orgs/new`, `/admin/orgs/[id]`). `requireSuperAdmin()` already exists from 1B; this plan only calls it, doesn't touch it.

**Tech Stack:** Zod v4, Next.js 16 Server Actions (`useActionState`), Supabase Admin API (`auth.admin.createUser`), shadcn/Base UI primitives, Vitest.

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` · **Spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 1) · **Follows:** 1A (schema + data migration), 1B (DAL, `requireSuperAdmin`, `/api/me`), 1C (login required, isolation enforced) — all done on staging.

## Global Constraints

- **Controls: shadcn primitives only.** `Button`, `Input`, `Label`, `Card` from `src/components/ui/*`. Base UI composes via `render`, not `asChild`.
- **API/actions:** admin server actions call `requireSuperAdmin()` at the top — same pattern as `resolveCallerContext()` elsewhere. Non-super_admins get a 404 on the pages (via `requireSuperAdmin`'s `notFound()`), never a 403.
- **No forced password change (D84).** `createOrgWithOwner` does **not** set `must_change_password` in `app_metadata`. A temp password is generated and shown once; the agency owner logs in with it and that's their password until they change it themselves (no self-service change-password UI exists yet either — also cut).
- **Owner = full access, no CLI (D82).** `createOrgWithOwner` always creates `org_role: "owner"` — never `senior`/`designer`. This is the only onboarding path; no script.
- **No RLS, no new migrations.** 1D is app-layer only. If this feels like it needs a schema change, stop — it shouldn't; the 1A schema already covers it.
- **Reuse before redeclaring:** `requireSuperAdmin` (1B), `resolveCallerContext` (1B) — import, don't rewrite. `uniqueSlug` already exists (used by `src/lib/db/clients.ts::createClient`) — reuse it for org slugs too.

## File Structure

**New files only — nothing modified, nothing deleted.**

| File | Responsibility |
|---|---|
| `src/lib/orgs/org-schema.ts` + `.test.ts` | `parseCreditLimit()` (pure, TDD) + `CreateOrgSchema` (Zod) |
| `src/lib/db/organizations.ts` | `listOrgsWithClientCount`, `getOrgById`, `listOrgMembers`, `updateOrgCreditLimit`, `createOrgWithOwner` |
| `src/lib/actions/admin.ts` | `createOrgAction`, `updateOrgCreditLimitAction` — both `requireSuperAdmin()`-gated |
| `src/app/admin/page.tsx` | Org list (name, client count, credit limit) |
| `src/app/admin/orgs/new/page.tsx` + `new-org-form.tsx` | Create org + owner in one submission |
| `src/app/admin/orgs/[id]/page.tsx` + `credit-limit-editor.tsx` | Org detail: editable limit, member list |

---

## Task 1: Org schema — `parseCreditLimit` (TDD) + `CreateOrgSchema`

**Files:**
- Create: `src/lib/orgs/org-schema.ts` + `src/lib/orgs/org-schema.test.ts`

**Interfaces:**
- Produces: `parseCreditLimit(raw: string): number | null` — `""`/whitespace → `null` (unlimited); a non-negative finite number string → that number; anything else → throws. `CreateOrgSchema` (Zod: `name`, `email`, `displayName`, `creditLimit` as a raw string parsed separately).

- [ ] **Step 1: Write the failing test**

Create `src/lib/orgs/org-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCreditLimit } from "./org-schema";

describe("parseCreditLimit", () => {
  it("returns null for empty / whitespace (unlimited)", () => {
    expect(parseCreditLimit("")).toBeNull();
    expect(parseCreditLimit("   ")).toBeNull();
  });
  it("parses a positive number", () => {
    expect(parseCreditLimit("1000")).toBe(1000);
    expect(parseCreditLimit("49.5")).toBe(49.5);
  });
  it("parses zero as a valid limit (not unlimited)", () => {
    expect(parseCreditLimit("0")).toBe(0);
  });
  it("throws on a negative value", () => {
    expect(() => parseCreditLimit("-5")).toThrow();
  });
  it("throws on a non-numeric value", () => {
    expect(() => parseCreditLimit("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run org-schema`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement the schema + parser**

Create `src/lib/orgs/org-schema.ts`:

```ts
import * as z from "zod";

// "" / whitespace → null (unlimited). "0" is a valid (very restrictive) limit, not
// unlimited — only blank means unlimited. Otherwise a non-negative finite number, or throw.
export function parseCreditLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Credit limit must be a non-negative number, or blank for unlimited.");
  }
  return n;
}

export const CreateOrgSchema = z.object({
  name: z.string().min(2, { error: "Organization name is required." }).trim(),
  email: z.email({ error: "Enter a valid email." }).trim(),
  displayName: z.string().min(2, { error: "Owner display name is required." }).trim(),
  creditLimit: z.string(), // parsed by parseCreditLimit; "" = unlimited
});

export type CreateOrgFields = z.infer<typeof CreateOrgSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run org-schema`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orgs/org-schema.ts src/lib/orgs/org-schema.test.ts
git commit -m "feat(admin): credit-limit parser (TDD) + create-org schema"
```

---

## Task 2: Organizations repository

**Files:**
- Create: `src/lib/db/organizations.ts`

**Interfaces:**
- Produces: `OrgRow`, `OrgWithCount` types; `listOrgsWithClientCount()`, `getOrgById(id)`, `listOrgMembers(orgId)`, `updateOrgCreditLimit(orgId, limit)`, `createOrgWithOwner(input)`.

- [ ] **Step 1: Check `uniqueSlug`'s signature before reuse**

Run: `grep -n "export function uniqueSlug" -A 5 src/lib/slug.ts` (or wherever `src/lib/db/clients.ts` imports it from) to confirm the exact signature before calling it below.

- [ ] **Step 2: Implement the repository**

Create `src/lib/db/organizations.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  monthly_credit_limit: number | null;
  created_at: string;
};

export type OrgWithCount = OrgRow & { client_count: number };

export async function listOrgsWithClientCount(): Promise<OrgWithCount[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, clients(count)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as (OrgRow & { clients: { count: number }[] })[]).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    monthly_credit_limit: o.monthly_credit_limit,
    created_at: o.created_at,
    client_count: o.clients?.[0]?.count ?? 0,
  }));
}

export async function getOrgById(id: string): Promise<OrgRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgRow) ?? null;
}

export async function listOrgMembers(
  orgId: string,
): Promise<{ user_id: string; display_name: string; org_role: string }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("user_id, org_role, profiles(display_name)")
    .eq("org_id", orgId);
  if (error) throw error;
  return (
    (data ?? []) as {
      user_id: string;
      org_role: string;
      profiles: { display_name: string } | null;
    }[]
  ).map((m) => ({
    user_id: m.user_id,
    org_role: m.org_role,
    display_name: m.profiles?.display_name ?? "Unknown",
  }));
}

export async function updateOrgCreditLimit(
  orgId: string,
  limit: number | null,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("organizations")
    .update({ monthly_credit_limit: limit })
    .eq("id", orgId);
  if (error) throw error;
}

// Creates org + auth user + profile + owner membership in one call. Returns the temp
// password so the operator can share it out-of-band. No must_change_password (D84) —
// the agency owner just logs in with it. Best-effort cleanup if any step fails partway.
export async function createOrgWithOwner(input: {
  name: string;
  email: string;
  displayName: string;
  creditLimit: number | null;
}): Promise<{ orgId: string; userId: string; tempPassword: string }> {
  const supabase = createServerSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("organizations")
    .select("slug");
  if (readErr) throw readErr;
  const slug = uniqueSlug(input.name, (existing ?? []).map((r: { slug: string }) => r.slug));

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: input.name, slug, monthly_credit_limit: input.creditLimit })
    .select()
    .single();
  if (orgErr) throw orgErr;
  const orgId = (org as OrgRow).id;

  const tempPassword = generateTempPassword();
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { platform_role: "member" },
  });
  if (userErr || !created.user) {
    await supabase.from("organizations").delete().eq("id", orgId);
    throw userErr ?? new Error("Failed to create user.");
  }
  const userId = created.user.id;

  const { error: profileErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: input.displayName });
  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    throw profileErr;
  }

  const { error: memberErr } = await supabase
    .from("org_memberships")
    .insert({ user_id: userId, org_id: orgId, org_role: "owner" });
  if (memberErr) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    throw memberErr;
  }

  return { orgId, userId, tempPassword };
}

function generateTempPassword(): string {
  // 12 chars, guaranteed a letter + a number — a reasonable default even with no
  // forced-change flow to enforce strength at first login (D84).
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return "Cr" + out + "7";
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS. If `uniqueSlug`'s signature differs from `(name, existingSlugs)`, adjust the call to match what Step 1 found.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/organizations.ts
git commit -m "feat(admin): organizations repository (list, detail, members, create-with-owner)"
```

---

## Task 3: Admin actions

**Files:**
- Create: `src/lib/actions/admin.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` (1B), `createOrgWithOwner`, `updateOrgCreditLimit` (Task 2), `CreateOrgSchema`, `parseCreditLimit` (Task 1).
- Produces: `createOrgAction(prev, formData)`, `updateOrgCreditLimitAction(orgId, rawLimit)`.

- [ ] **Step 1: Implement the actions**

Create `src/lib/actions/admin.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createOrgWithOwner, updateOrgCreditLimit } from "@/lib/db/organizations";
import { CreateOrgSchema, parseCreditLimit } from "@/lib/orgs/org-schema";

export type CreateOrgState =
  | { error?: string; result?: { email: string; tempPassword: string; orgId: string } }
  | undefined;

export async function createOrgAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  await requireSuperAdmin();

  const parsed = CreateOrgSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    creditLimit: formData.get("creditLimit") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let creditLimit: number | null;
  try {
    creditLimit = parseCreditLimit(parsed.data.creditLimit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid credit limit." };
  }

  try {
    const { orgId, tempPassword } = await createOrgWithOwner({
      name: parsed.data.name,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      creditLimit,
    });
    revalidatePath("/admin");
    return { result: { email: parsed.data.email, tempPassword, orgId } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create organization." };
  }
}

export async function updateOrgCreditLimitAction(
  orgId: string,
  rawLimit: string,
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  let limit: number | null;
  try {
    limit = parseCreditLimit(rawLimit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid credit limit." };
  }
  try {
    await updateOrgCreditLimit(orgId, limit);
    revalidatePath(`/admin/orgs/${orgId}`);
    revalidatePath("/admin");
    return {};
  } catch {
    return { error: "Failed to update credit limit." };
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/admin.ts
git commit -m "feat(admin): create-org + update-credit-limit server actions"
```

---

## Task 4: `/admin` org list page

**Files:**
- Create: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin` (1B), `listOrgsWithClientCount` (Task 2).

- [ ] **Step 1: Build the page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listOrgsWithClientCount } from "@/lib/db/organizations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations — Admin" };

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const orgs = await listOrgsWithClientCount();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Organizations
        </h1>
        <Button render={<Link href="/admin/orgs/new">+ New org</Link>} />
      </div>
      <div className="flex flex-col gap-3">
        {orgs.map((o) => (
          <Card key={o.id} className="p-4 shadow-card">
            <Link href={`/admin/orgs/${o.id}`} className="flex flex-col">
              <span className="font-medium">{o.name}</span>
              <span className="text-xs text-muted-foreground">
                {o.monthly_credit_limit === null
                  ? "Unlimited credits"
                  : `Limit ${o.monthly_credit_limit}`}
                {" · "}
                {o.client_count} client{o.client_count === 1 ? "" : "s"}
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

If `Button` doesn't accept a `render` prop with a bare `<Link>` child (check `src/components/ui/button.tsx`'s exact prop type from 1B/1C's audit), fall back to `<Link href="/admin/orgs/new"><Button>+ New org</Button></Link>`.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Signed in as `developer@yuvabe.com`, visit `/admin`.
Expected: Yuvabe org listed, "Unlimited credits", 28 clients. Then, in a private/incognito window with no session, visit `/admin` directly.
Expected: 404 (proxy redirects to `/login` first since there's no session at all — to specifically test the super_admin gate rather than the login gate, this is fully confirmed once Task 5 creates a non-super_admin user to sign in as).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): org list page"
```

---

## Task 5: `/admin/orgs/new` — create-org form (the onboarding path, D82)

**Files:**
- Create: `src/app/admin/orgs/new/page.tsx` + `src/app/admin/orgs/new/new-org-form.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `createOrgAction` (Task 3).

- [ ] **Step 1: Build the form (client component)**

Create `src/app/admin/orgs/new/new-org-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createOrgAction, type CreateOrgState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function NewOrgForm() {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    undefined,
  );

  if (state?.result) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="font-medium">Organization created</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Share these credentials with the agency out-of-band (Slack, email). Shown once —
          this page will not show the password again.
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-mono">{state.result.email}</dd>
          <dt className="text-muted-foreground">Temp password</dt>
          <dd className="font-mono">{state.result.tempPassword}</dd>
        </dl>
      </Card>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="name" label="Organization name" />
      <Field name="email" label="Owner email" type="email" />
      <Field name="displayName" label="Owner display name" />
      <Field name="creditLimit" label="Monthly credit limit (blank = unlimited)" />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} />
    </div>
  );
}
```

- [ ] **Step 2: Build the page**

Create `src/app/admin/orgs/new/page.tsx`:

```tsx
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { NewOrgForm } from "./new-org-form";

export const metadata = { title: "New organization — Admin" };

export default async function NewOrgPage() {
  await requireSuperAdmin();
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-14">
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        New organization
      </h1>
      <NewOrgForm />
    </main>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification — create the first real second org**

Signed in as `developer@yuvabe.com`, go to `/admin/orgs/new`. Create e.g. "Agency A" with a
real test email you control, blank credit limit. Note the temp password shown.
Expected: the "Organization created" card shows the email + temp password.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/orgs/new
git commit -m "feat(admin): create-org onboarding form (D82 - the only onboarding path)"
```

---

## Task 6: `/admin/orgs/[id]` detail — editable limit + members, and the real isolation test

**Files:**
- Create: `src/app/admin/orgs/[id]/page.tsx` + `src/app/admin/orgs/[id]/credit-limit-editor.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `getOrgById`, `listOrgMembers` (Task 2), `updateOrgCreditLimitAction` (Task 3).

- [ ] **Step 1: Build the credit-limit editor (client component)**

Create `src/app/admin/orgs/[id]/credit-limit-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { updateOrgCreditLimitAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreditLimitEditor({
  orgId,
  initial,
}: {
  orgId: string;
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateOrgCreditLimitAction(orgId, value);
    setSaving(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Unlimited"
          className="max-w-40"
        />
        <Button onClick={onSave} disabled={saving} variant="outline" size="sm">
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Build the detail page**

Create `src/app/admin/orgs/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getOrgById, listOrgMembers } from "@/lib/db/organizations";
import { CreditLimitEditor } from "./credit-limit-editor";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) notFound();
  const members = await listOrgMembers(id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <p className="mb-8 text-xs text-muted-foreground">/{org.slug}</p>

      <Card className="mb-6 p-6 shadow-card">
        <h2 className="text-eyebrow mb-3">Monthly credit limit</h2>
        <CreditLimitEditor orgId={org.id} initial={org.monthly_credit_limit} />
      </Card>

      <Card className="p-6 shadow-card">
        <h2 className="text-eyebrow mb-3">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span>{m.display_name}</span>
              <span className="text-muted-foreground">{m.org_role}</span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verification — org detail**

As super_admin, open `/admin/orgs/<Agency A's id>` (from Task 5). Change the credit limit to
`500`, Save, reload → persists. Clear it, Save → shows "Unlimited" placeholder again. Member
list shows the owner you created, `org_role: owner`.

- [ ] **Step 5: Manual verification — the real cross-org isolation test (first time this is possible)**

This is the test 1C's checklist explicitly deferred. Get this right — **super_admin bypasses
org filtering by design**, so "does Yuvabe see Agency A" is not the isolation test; the test is
whether Agency A is confined to its own org:

1. Sign out. Sign in as Agency A's owner (email + temp password from Task 5).
2. Expected: lands on `/`, sees an **empty** client list — not Yuvabe's 28.
3. Create a client as Agency A (e.g. "Test Client"). Expected: appears in Agency A's list.
4. Copy one of **Yuvabe's** client IDs (from earlier testing, or query `clients` directly on
   staging). While still signed in as Agency A, visit
   `/api/clients/<a-yuvabe-client-id>/...` (any `withClient`-guarded route, e.g.
   `GET /api/clients/<id>`). Expected: **404**, not the real data.
5. Visit `/admin` while signed in as Agency A. Expected: **404** (not super_admin).
6. Sign out, sign back in as `developer@yuvabe.com`. Expected: still sees all clients
   (Yuvabe's 28 + Agency A's 1) — this is the super_admin cross-org visibility working as
   designed, not a leak.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/orgs/[id]
git commit -m "feat(admin): org detail with editable credit limit + members"
```

---

## Final verification (1D shippable checklist — closes out Stage 1)

- [ ] `npm test` — all pass (new: `org-schema`)
- [ ] `npm run build` — clean
- [ ] `/admin/orgs/new` creates a real second org end-to-end, credentials shown once
- [ ] Agency A logs in → empty client list → can create a client → cannot reach a Yuvabe
      client by id (404) → `/admin` is 404 for them
- [ ] `developer@yuvabe.com` still sees everything (super_admin cross-org visibility intact)
- [ ] Credit limit is editable on the org detail page and persists
- [ ] Six commits made across Tasks 1–6

**On completion:** update the tracker to set 1D → ✅, and Stage 1 as a whole → ✅ complete in
`2026-07-21-auth-stage-1-index.md`. This closes Stage 1 of the 4-stage rollout
(`2026-07-21-auth-staging-rollout-plan.md`) — Stage 2 (RLS backstop + async worker tenant
check) is next, whenever that work starts.

---

## Self-Review notes (traceability)

- **D82 (no CLI; UI onboarding)** → `/admin/orgs/new` (Task 5) is the only path; no script
  file appears anywhere in File Structure.
- **D84 (no forced password change)** → `createOrgWithOwner` (Task 2) sets no
  `must_change_password`; the temp-password UI (Task 5) says "shown once," not "temporary."
- **Owner-only, no senior/designer** → `createOrgWithOwner` hardcodes `org_role: "owner"`.
- **"First real isolation test"** → Task 6 Step 5 is written to test the *correct* thing
  (Agency A confined to its own org) rather than the wrong intuition ("Yuvabe can't see
  Agency A"), which would fail by design since super_admin bypasses org filtering — this
  distinction is called out explicitly so it isn't misread as a bug during testing.
- **No RLS, no migrations** → File Structure is pages/actions/repository only; Global
  Constraints repeat the Stage 1 rule and say explicitly to stop if this plan seems to need one.
- **Reuse, not redeclare** → `requireSuperAdmin`, `resolveCallerContext`, `uniqueSlug` are
  imported from 1B/existing code, not rewritten; Task 2 Step 1 explicitly checks `uniqueSlug`'s
  real signature before calling it, rather than assuming.
