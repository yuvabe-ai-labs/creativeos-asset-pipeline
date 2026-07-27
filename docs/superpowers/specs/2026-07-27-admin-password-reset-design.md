# CreativeOS — Admin: Reset an Agency Member's Password

**Date:** 2026-07-27
**Status:** Approved
**Builds on:** the auth/multi-tenancy rollout (`2026-07-21-auth-staging-rollout-plan.md`) and
the admin UX consistency pass (`2026-07-23-admin-ux-consistency-design.md`), specifically the
org detail page's Overview tab (Members card) and `CreditLimitEditor`'s save-confirmation
pattern. No schema changes, no new ADR decisions — reuses the existing Supabase Auth admin API
already relied on by `createOrgWithOwner`.

---

## 1. Why

Support/ops need a way to reset a login for an agency member (e.g. they're locked out, forgot
their password, or a shared credential needs rotating) without going through Supabase's
dashboard by hand. `super_admin` already has an admin surface (`/admin/orgs/[id]`) with a
Members list — this adds a password-reset action there, gated the same way every other admin
action is (`requireSuperAdmin()`).

Recall from D84: there is no forced-password-change flow in this app. This feature does not
reintroduce one — a reset member simply gets a new password to log in with directly, same as a
freshly onboarded owner does today.

---

## 2. Data layer — `src/lib/db/organizations.ts`

New function:

```ts
export async function resetMemberPassword(
  orgId: string,
  userId: string,
  newPassword: string,
): Promise<void>
```

- First verifies `(user_id, org_id)` exists in `org_memberships` — defense-in-depth so a
  tampered client-side `userId` can't reset a password for a user outside the agency being
  viewed, even though `super_admin` already has broad admin access. Throws (surfaced as a
  generic error) if no match.
- Then calls `supabase.auth.admin.updateUserById(userId, { password: newPassword })` — the same
  Supabase Auth admin API `createOrgWithOwner` already uses to set the initial password.

`generateTempPassword()` (currently a private helper in this file, used only by
`createOrgWithOwner`) is exported so the reset path can generate one too — same 12-char
letter+digit shape, no duplicate generator.

---

## 3. Validation — `src/lib/orgs/org-schema.ts`

New function, same shape/spirit as `parseCreditLimit`:

```ts
// "" → auto-generate (caller supplies a generated password separately).
// Otherwise: trimmed, must be >= 8 chars, else throws.
export function parseResetPassword(raw: string): string | null
```

Returns `null` for "auto-generate," or the validated custom password string. Gets a unit test
in `org-schema.test.ts` alongside the existing `parseCreditLimit` cases (blank, too short, valid,
whitespace-trimmed).

---

## 4. Server action — `src/lib/actions/admin.ts`

```ts
export type ResetPasswordState =
  | { error?: string; result?: { tempPassword: string } }
  | undefined;

export async function resetMemberPasswordAction(
  orgId: string,
  userId: string,
  rawPassword: string, // "" = auto-generate
): Promise<ResetPasswordState>
```

- `requireSuperAdmin()` first, matching every other admin action.
- `parseResetPassword(rawPassword)` — on throw, return `{ error }`.
- If `null` (auto-generate), call `generateTempPassword()`; otherwise use the validated custom
  password as-is.
- Call `resetMemberPassword(orgId, userId, password)`. On throw, return a generic
  `{ error: "Failed to reset password." }` (don't leak Supabase internals).
- On success, `revalidatePath(`/admin/orgs/${orgId}`)` and return `{ result: { tempPassword:
  password } }` — the caller shows this once, same as `createOrgAction`'s `tempPassword`.

Not a `useActionState`-bound form action (no FormData) — called directly from the dialog
component as a plain async function, since it takes explicit args rather than a form submit.

---

## 5. UI — `src/app/admin/orgs/[id]/reset-password-dialog.tsx`

New client component, one per member row, wired into the existing Members card in
`org-detail-tabs.tsx`:

- Each row gets a small `Button variant="outline" size="sm"` reading "Reset password" next to
  the existing role text.
- Clicking opens an `AlertDialog` (existing primitive, `src/components/ui/alert-dialog.tsx`):
  - Title: `Reset password for {display_name}?`
  - Body copy: "Their current password stops working immediately. You'll get a new one to share
    with them."
  - A segmented **Auto-generate / Set specific password** toggle — same visual pattern as
    `CreditLimitEditor`'s Unlimited/Set-limit toggle (`Button` pair in a bordered `inline-flex`
    group).
  - In "Set specific password" mode, reveals a plain-text `Input` (not `type="password"` —
    the super_admin needs to read the value back to share it, no masking) with an 8-char-min
    hint.
  - Cancel / Confirm buttons. Confirm calls `resetMemberPasswordAction`.
- On success, the dialog body swaps to a "shown once" result view — font-mono password, same
  copy/style as `new-org-form.tsx`'s post-creation panel ("Shown once — this page will not show
  the password again") — with a single "Done" button that closes the dialog. Reopening the
  dialog for the same or another member always starts fresh (mode = auto-generate, no leftover
  state) — implemented by remounting the dialog's internal state on close, not by persisting
  anything.
- Errors (validation or action failure) render inline in the dialog, same red destructive text
  style used elsewhere (`CreditLimitEditor`, `new-org-form.tsx`).

No changes to `OrgRow`, `Member` types, or the Members query — `listOrgMembers` already returns
`user_id` and `display_name`, which is all this needs.

---

## 6. Out of scope

- No email/notification sent automatically to the member — sharing the new password is manual,
  out-of-band, same as agency creation today.
- No password-strength meter or complexity rules beyond the 8-char minimum — matches this app's
  existing low-friction stance (the auto-generated temp password itself has no symbol
  requirement either).
- No audit log entry for who reset whose password — no audit logging exists anywhere else in
  the app yet; adding one here would be scope creep beyond this feature.
- No self-service "change my own password" flow — this is strictly the super_admin-initiated
  admin action requested.
