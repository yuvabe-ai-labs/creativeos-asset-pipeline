# Admin: Reset an Agency Member's Password — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `super_admin` reset the login password for any member of an agency, from the existing `/admin/orgs/[id]` Overview tab's Members list.

**Architecture:** Reuses the Supabase Auth admin API (`supabase.auth.admin.updateUserById`) already relied on by `createOrgWithOwner` for initial password creation. A new DB function verifies the member belongs to the org, then resets the password; a server action validates input and gates on `requireSuperAdmin()`; a client dialog component (controlled `AlertDialog`, plain `Button`s per this repo's established pattern — see `delete-confirm-dialog.tsx`) offers auto-generate or custom password, then shows the result once.

**Tech Stack:** Next.js server actions, Supabase (`@supabase/supabase-js` admin client), Zod-adjacent hand-rolled parse functions (this repo's existing convention — see `parseCreditLimit`), Base UI `AlertDialog`, Vitest.

## Global Constraints

- No forced-password-change flow (D84) — a reset member logs in directly with the new password, same as a freshly onboarded owner.
- Every interactive control must be a shadcn primitive from `src/components/ui/*` (`Button`, `Input`) — never a raw `<button>`/`<input>`.
- Controls compose via the `render` prop (Base UI), not `asChild`.
- Custom password minimum length: 8 characters. Blank input means auto-generate.
- No audit logging, no automatic email/notification to the member, no self-service password change — all explicitly out of scope per the spec (`docs/superpowers/specs/2026-07-27-admin-password-reset-design.md`).
- Gate every admin action with `requireSuperAdmin()` (`src/lib/auth/require-super-admin.ts`), matching every existing action in `src/lib/actions/admin.ts`.
- Test command: `npx vitest run <path>` for a single file, `npm run test` for the full suite. Typecheck: `npx tsc --noEmit`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/orgs/org-schema.ts` | Modify — add `parseResetPassword` (validates/normalizes the raw password input) |
| `src/lib/orgs/org-schema.test.ts` | Modify — add test cases for `parseResetPassword` |
| `src/lib/db/organizations.ts` | Modify — export `generateTempPassword`, add `resetMemberPassword` (membership check + Supabase admin call) |
| `src/lib/actions/admin.ts` | Modify — add `resetMemberPasswordAction` |
| `src/app/admin/orgs/[id]/reset-password-dialog.tsx` | Create — the dialog UI, one instance per member row |
| `src/app/admin/orgs/[id]/org-detail-tabs.tsx` | Modify — render `ResetPasswordDialog` per member row |

---

### Task 1: Password validation — `parseResetPassword`

**Files:**
- Modify: `src/lib/orgs/org-schema.ts`
- Test: `src/lib/orgs/org-schema.test.ts`

**Interfaces:**
- Produces: `parseResetPassword(raw: string): string | null` — `null` means "auto-generate," a non-null return is the validated, trimmed custom password. Throws `Error` with a user-facing message if `raw` is non-blank but shorter than 8 characters after trimming.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/orgs/org-schema.test.ts` (below the existing `parseCreditLimit` describe block):

```ts
import { parseResetPassword } from "./org-schema";

describe("parseResetPassword", () => {
  it("returns null for empty / whitespace (auto-generate)", () => {
    expect(parseResetPassword("")).toBeNull();
    expect(parseResetPassword("   ")).toBeNull();
  });
  it("returns the trimmed password when 8+ chars", () => {
    expect(parseResetPassword("  goodpass123  ")).toBe("goodpass123");
  });
  it("throws when shorter than 8 chars", () => {
    expect(() => parseResetPassword("short1")).toThrow();
  });
  it("throws when the trimmed value is shorter than 8 chars", () => {
    expect(() => parseResetPassword("  ab  ")).toThrow();
  });
});
```

Update the existing `import { parseCreditLimit } from "./org-schema";` line to also import `parseResetPassword` (single import statement, two named imports).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/orgs/org-schema.test.ts`
Expected: FAIL — `parseResetPassword` is not exported / not defined.

- [ ] **Step 3: Implement `parseResetPassword`**

Add to `src/lib/orgs/org-schema.ts` (after `parseCreditLimit`, before `CreateOrgSchema`):

```ts
// "" / whitespace → null (auto-generate). Otherwise the trimmed value, which must be
// >= 8 characters, else throw. Mirrors parseCreditLimit's blank-means-default shape.
export function parseResetPassword(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length < 8) {
    throw new Error("Password must be at least 8 characters, or blank to auto-generate.");
  }
  return trimmed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/orgs/org-schema.test.ts`
Expected: PASS, all cases including the pre-existing `parseCreditLimit` ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orgs/org-schema.ts src/lib/orgs/org-schema.test.ts
git commit -m "feat(admin): add parseResetPassword validation for member password reset"
```

---

### Task 2: Data layer — `resetMemberPassword`

**Files:**
- Modify: `src/lib/db/organizations.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (uses the existing `createServerSupabase` import already in this file).
- Produces:
  - `generateTempPassword(): string` — now exported (previously a private helper used only by `createOrgWithOwner`).
  - `resetMemberPassword(orgId: string, userId: string, newPassword: string): Promise<void>` — throws if the `(userId, orgId)` pair isn't a real membership, or if the Supabase admin call fails.

This file has no existing test file (`createOrgWithOwner`, `updateOrgCreditLimit`, etc. are untested — they're thin Supabase wrappers that would need a mocked admin client to test meaningfully, and the codebase's existing convention is to leave this layer covered by manual/staging verification instead). This task follows that same convention: no new unit test, verified manually in Task 6.

- [ ] **Step 1: Export `generateTempPassword`**

In `src/lib/db/organizations.ts`, change:

```ts
function generateTempPassword(): string {
```

to:

```ts
export function generateTempPassword(): string {
```

- [ ] **Step 2: Add `resetMemberPassword`**

Add directly after `listOrgMembers` (before `updateOrgCreditLimit`):

```ts
// Verifies the member actually belongs to this org before touching auth state — defense
// in depth against a tampered orgId/userId pair from the client, even though super_admin
// already has broad admin access. No must_change_password (D84): the member logs in with
// newPassword directly, same as a freshly onboarded owner.
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
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/db/organizations.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/organizations.ts
git commit -m "feat(admin): add resetMemberPassword data-layer function"
```

---

### Task 3: Server action — `resetMemberPasswordAction`

**Files:**
- Modify: `src/lib/actions/admin.ts`

**Interfaces:**
- Consumes: `resetMemberPassword`, `generateTempPassword` from `@/lib/db/organizations` (Task 2); `parseResetPassword` from `@/lib/orgs/org-schema` (Task 1); `requireSuperAdmin` (existing).
- Produces: `resetMemberPasswordAction(orgId: string, userId: string, rawPassword: string): Promise<ResetPasswordState>` where `ResetPasswordState = { error?: string; result?: { tempPassword: string } } | undefined`.

- [ ] **Step 1: Update imports and add the action**

In `src/lib/actions/admin.ts`, change the two existing import lines:

```ts
import { createOrgWithOwner, updateOrgCreditLimit } from "@/lib/db/organizations";
import { CreateOrgSchema, parseCreditLimit } from "@/lib/orgs/org-schema";
```

to:

```ts
import {
  createOrgWithOwner,
  updateOrgCreditLimit,
  resetMemberPassword,
  generateTempPassword,
} from "@/lib/db/organizations";
import { CreateOrgSchema, parseCreditLimit, parseResetPassword } from "@/lib/orgs/org-schema";
```

Then append at the end of the file:

```ts
export type ResetPasswordState =
  | { error?: string; result?: { tempPassword: string } }
  | undefined;

export async function resetMemberPasswordAction(
  orgId: string,
  userId: string,
  rawPassword: string,
): Promise<ResetPasswordState> {
  await requireSuperAdmin();

  let password: string;
  try {
    password = parseResetPassword(rawPassword) ?? generateTempPassword();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid password." };
  }

  try {
    await resetMemberPassword(orgId, userId, password);
    revalidatePath(`/admin/orgs/${orgId}`);
    return { result: { tempPassword: password } };
  } catch {
    return { error: "Failed to reset password." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/actions/admin.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/admin.ts
git commit -m "feat(admin): add resetMemberPasswordAction server action"
```

---

### Task 4: UI — `ResetPasswordDialog`

**Files:**
- Create: `src/app/admin/orgs/[id]/reset-password-dialog.tsx`

**Interfaces:**
- Consumes: `resetMemberPasswordAction` from `@/lib/actions/admin` (Task 3); `Button` (`@/components/ui/button`), `Input` (`@/components/ui/input`), `AlertDialog`/`AlertDialogContent`/`AlertDialogHeader`/`AlertDialogFooter`/`AlertDialogTitle`/`AlertDialogDescription` (`@/components/ui/alert-dialog`) — all existing.
- Produces: `ResetPasswordDialog({ orgId, userId, displayName }: { orgId: string; userId: string; displayName: string })` — a React component, default export not used (named export, matching every other component in this directory, e.g. `CreditLimitEditor`).

This follows `src/components/canvas/delete-confirm-dialog.tsx`'s established convention: a controlled `AlertDialog` (`open`/`onOpenChange`) with **plain `Button`s**, not `AlertDialogAction`/`AlertDialogCancel` — because those wrap `AlertDialogPrimitive.Close` and auto-close on click, which would close the dialog before the async reset call finishes or before the "shown once" result screen can display.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { resetMemberPasswordAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

type Mode = "auto" | "set";

// Plain Buttons (not the Close-primitive actions), same convention as
// delete-confirm-dialog.tsx — a click must not auto-close the dialog before the async
// reset resolves or before the "shown once" result view can render.
export function ResetPasswordDialog({
  orgId,
  userId,
  displayName,
}: {
  orgId: string;
  userId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function resetState() {
    setMode("auto");
    setDraft("");
    setSaving(false);
    setError(null);
    setTempPassword(null);
  }

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) resetState();
  }

  async function confirmReset() {
    setSaving(true);
    setError(null);
    const res = await resetMemberPasswordAction(orgId, userId, mode === "set" ? draft : "");
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setTempPassword(res?.result?.tempPassword ?? null);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {tempPassword ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>New password for {displayName}</AlertDialogTitle>
                <AlertDialogDescription>
                  Share this with them out-of-band (Slack, email). Shown once — this dialog
                  will not show the password again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
                {tempPassword}
              </p>
              <AlertDialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset password for {displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their current password stops working immediately. You&apos;ll get a new
                  one to share with them.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "auto" ? "default" : "ghost"}
                  disabled={saving}
                  onClick={() => {
                    setMode("auto");
                    setError(null);
                  }}
                >
                  Auto-generate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "set" ? "default" : "ghost"}
                  disabled={saving}
                  onClick={() => {
                    setMode("set");
                    setError(null);
                  }}
                >
                  Set specific password
                </Button>
              </div>

              {mode === "set" && (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={saving}
                />
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <AlertDialogFooter>
                <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={saving} onClick={() => void confirmReset()}>
                  {saving ? "Resetting…" : "Reset password"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/admin/orgs/[id]/reset-password-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/orgs/[id]/reset-password-dialog.tsx
git commit -m "feat(admin): add ResetPasswordDialog component"
```

---

### Task 5: Wire into the Members list

**Files:**
- Modify: `src/app/admin/orgs/[id]/org-detail-tabs.tsx`

**Interfaces:**
- Consumes: `ResetPasswordDialog` from `./reset-password-dialog` (Task 4). Uses the existing `org` and `members` props already passed into `OrgDetailTabs` — no new props needed.

- [ ] **Step 1: Add the import**

In `src/app/admin/orgs/[id]/org-detail-tabs.tsx`, add near the other local imports:

```ts
import { ResetPasswordDialog } from "./reset-password-dialog";
```

- [ ] **Step 2: Render the dialog per member row**

Replace:

```tsx
        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Members</h2>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{m.display_name}</span>
                <span className="text-muted-foreground">{m.org_role}</span>
              </li>
            ))}
          </ul>
        </Card>
```

with:

```tsx
        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Members</h2>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{m.display_name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{m.org_role}</span>
                  <ResetPasswordDialog
                    orgId={org.id}
                    userId={m.user_id}
                    displayName={m.display_name}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/orgs/[id]/org-detail-tabs.tsx
git commit -m "feat(admin): wire ResetPasswordDialog into the org detail Members list"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `parseResetPassword` cases from Task 1.

- [ ] **Step 2: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual staging verification checklist**

No browser access in this session — hand this checklist to the user to run through on staging (`/admin/orgs/[id]`, any org with at least one member):

1. Open an agency's detail page as a `super_admin`, Overview tab. Confirm a "Reset password" button appears next to each member row.
2. Click it → dialog opens with the confirmation copy, "Auto-generate" selected by default.
3. Click "Reset password" (auto-generate mode) → dialog shows a new temp password in a monospace box, "shown once" copy visible.
4. Click "Done" → dialog closes.
5. Log out, log in as that member using the new temp password → succeeds, no forced-change screen (confirms D84 still holds).
6. Reopen the dialog for the same member, switch to "Set specific password," try a password under 8 characters → inline error shown, no request sent to Supabase (verify via network tab or by confirming the old password still works).
7. Retry with a valid 8+ character custom password → succeeds, shown in the result view; log in as that member with it → succeeds.
8. As a non-`super_admin` user, confirm `/admin/orgs/[id]` still 404s (unchanged from existing behavior) — this feature adds no new exposure since it's gated by the same `requireSuperAdmin()` as every other admin action.

- [ ] **Step 5: Update rollout memory** (only after manual verification above passes)

This is a small, self-contained admin feature outside the 4-stage auth rollout — no plan-index file to update. If useful for future sessions, a one-line mention can be added to the `auth-staging-rollout` memory noting this shipped, but it's optional since this plan file itself is the durable record.
