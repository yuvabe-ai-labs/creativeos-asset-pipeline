# First-Time / Reset Password Change — Design Spec

## Context

D84 (`docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7) deferred forced
password change during Stage 1C to reduce scope in the pilot's first login pass — an explicit
cut, not an oversight. Requirements have since changed: this is now needed. This spec reverses
D84; a follow-up ADR entry (D91, appended to the same log) records the reversal and why.

## Goal

Anyone who logs in with a temp password — a newly onboarded agency owner, or an existing
member whose password an admin reset — must set their own password before they can reach
anything else in the app. No canvas, no admin, nothing, until it's changed.

## Scope

1. A `must_change_password` flag, stored in `auth.users.app_metadata` — the same mechanism
   already used for `platform_role` (`docs/auth-bootstrap.md`). No migration, no new table.
2. Enforcement in `src/proxy.ts` — the same middleware that already gates "must be logged
   in," extended to also gate "must not still owe a password change."
3. A new `/account/password` page + server action.
4. Two call sites that issue temp passwords, both need to set the flag:
   `createOrgWithOwner` and `resetMemberPassword` (`src/lib/db/organizations.ts`).
5. ADR log update (D91).

## Data model

`app_metadata` is a jsonb bag on `auth.users`, already read via `user.app_metadata` in
`proxy.ts`/the DAL. Add one key: `must_change_password: boolean`.

- **`createOrgWithOwner`**: this call already does `supabase.auth.admin.createUser({ ...,
  app_metadata: { platform_role: "member" } })` — a **fresh object** at creation time, so
  adding `must_change_password: true` to that same literal is safe, no merge risk.
- **`resetMemberPassword`**: this call updates an **existing** user via
  `supabase.auth.admin.updateUserById(userId, { password: newPassword })`. Blindly passing
  `app_metadata: { must_change_password: true }` here risks **wiping the user's existing
  `platform_role`** if they happen to have one — `docs/auth-bootstrap.md`'s own bootstrap
  step avoids this exact trap by merging via Postgres's `||` operator instead of the admin
  API for metadata writes. This function will fetch the user's current `app_metadata` first
  (`auth.admin.getUserById`), spread it, set `must_change_password: true` on top, and pass
  the **full merged object** to `updateUserById` — never a bare literal.
- **Clearing the flag** (in the new page's server action) follows the identical
  fetch-merge-write pattern, in reverse.

## Enforcement — `src/proxy.ts`

Right after the existing `if (!user)` check (unauthenticated → `/login`), add: if
`user.app_metadata?.must_change_password` is `true` and the request isn't for
`/account/password` itself (or its server action / static assets), redirect there — same
`isApi` 401-vs-redirect branching the existing check already has.

**Real edge case to handle, not gloss over:** `proxy.ts` calls `supabase.auth.getUser()`,
which revalidates against the Auth server (not a locally-decoded stale JWT) — so the check
itself reads fresh data. But after the password-change server action clears the flag, the
**session token already in the browser** may not reflect that until it refreshes. Without an
explicit refresh, the user could be bounced right back to `/account/password` after
successfully changing their password. Fix: the server action explicitly refreshes the
session (`supabase.auth.refreshSession()`) after clearing the flag, before redirecting to
`/`. This gets an explicit test in the plan — not just "change password, assume it worked."

## New page — `/account/password`

- Server component gate: if `must_change_password` isn't set on the current user, redirect
  to `/` (this page has no reason to exist for someone who doesn't owe a change).
- Client form: new password + confirm, styled to match `/login`'s existing card (same
  shadcn primitives, same layout conventions).
- Server action: validate (at least 8 characters — matches the existing convention in
  `reset-password-dialog.tsx`'s placeholder copy, not a new rule; and matches confirm), call
  `supabase.auth.updateUser({ password })`, fetch-merge-clear the `must_change_password`
  flag, refresh the session, redirect to `/`.

## Copy

One generic message covers both trigger paths ("new agency owner" and "admin reset an
existing member") — no need to distinguish them in the UI: **"Set a new password to
continue."** Simpler, and the reason doesn't change what the user needs to do.

## ADR update

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7:

> **D91 — Forced password change on first login/reset is reinstated; reverses D84**
> *(recorded 2026-07-27)*
>
> **Decision.** Anyone logging in with a temp password (new agency owner via
> `createOrgWithOwner`, or an existing member via `resetMemberPassword`) is redirected to
> `/account/password` and blocked from the rest of the app until they set their own
> password. Tracked via a `must_change_password` flag in `auth.users.app_metadata`,
> enforced in `src/proxy.ts`.
>
> **Why.** Requirements changed — needed now, independent of D84's original pilot-scope
> reasoning.
>
> **Rejected.** Leaving D84's "log straight through" behavior in place.
>
> **Refines →** D84.
> **Originated →** `2026-07-27-first-login-password-reset-design.md`.

## Out of scope

- Password strength/complexity rules beyond a minimum length — not requested, not adding it
  speculatively.
- Any change to how temp passwords are generated or displayed (`generateTempPassword`, the
  "shown once" credential dialogs) — those stay exactly as they are.
- Rate limiting / lockout on the password-change form — not requested.
