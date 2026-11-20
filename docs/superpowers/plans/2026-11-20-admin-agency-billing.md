# Admin agency billing (billing piece 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yuvabe sets an agency's billing (and free credits) when adding it, and changes billing, credits and end dates any time from a Billing tab, every change logged.

**Architecture:** Four admin SQL functions (added to the unapplied migration 0067) make each change and its `billing_log` row in one transaction. Server actions (super admin only) parse with zod and call them; the agency page loads grants and the log in its existing `Promise.all` and refreshes through `revalidatePath`, as the credit limit editor does today.

**Tech Stack:** Supabase Postgres, Next.js server actions, zod, shadcn (Base UI), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-11-20-admin-agency-billing-design.md`.

## Global Constraints

- Never apply migrations or run SQL. Never push. No AI attribution in commits.
- shadcn primitives only (`Button`, `Input`, `Textarea`, `Dialog`, `Label`); Lucide icons at 1.5 stroke.
- Plain user-facing copy: no vendor names, no raw errors, no em-dash phrasing.
- End dates are days in India time: `ends_at` = next day 00:00 +05:30.

---

### Task 1: SQL admin functions (migration 0067)

**Files:** Modify `supabase/migrations/0067_credit_grants.sql`; Test `src/lib/billing/migration-0067.test.ts`.

**Produces:** `admin_set_billing_mode(uuid, text, uuid, text) → boolean`, `admin_grant_credits(uuid, text, numeric, timestamptz, uuid, text) → uuid`, `admin_take_back_credits(uuid, numeric, uuid, text) → text ('ok'|'not_found'|'too_many')`, `admin_set_grant_end(uuid, timestamptz, uuid, text) → text ('ok'|'not_found')`.

- [ ] Add the four names to the test's `FUNCTIONS` list; add tests that each locks the agency (`from organizations where id = ... for update`) and inserts into `billing_log`; that `admin_grant_credits` refuses kinds other than free/admin; that take-back compares with what is left. Run: fails.
- [ ] Add the functions before the revoke/grant block, with revoke/grant lines. Run: passes.
- [ ] Commit `feat(billing): admin billing changes write their log row in the same transaction`.

### Task 2: Dates, parsing, data layer, server actions

**Files:** Create `src/lib/billing/dates.ts`, `src/lib/billing/admin-schema.ts`, `src/lib/db/billing-admin.ts`, `src/lib/actions/billing-admin.ts`, and tests beside each in `__tests__/`.

**Produces:**
- `endsAtFromDay(day: string): string`, `lastDayOf(endsAt: string): string`, `todayIst(now?: Date): string`, `formatDay(day: string): string`.
- `GrantFormSchema` (`credits` whole > 0, `day` `YYYY-MM-DD` not before today IST, `reason` 1–500 chars), `TakeBackSchema` (`credits`, `reason`), `GrantEndSchema` (`day` or `endNow`, `reason`), `BillingModeSchema` (`mode` managed|plans, `reason`).
- `setBillingMode`, `grantCredits`, `takeBackCredits`, `setGrantEnd`, `listBillingLog(orgId, limit = 50): Promise<BillingLogEntry[]>` with `BillingLogEntry = { id, action, before, after, reason, createdAt, actorName }`.
- Actions: `setBillingModeAction(orgId, mode, reason)`, `grantCreditsAction(orgId, kind, credits, day, reason)`, `takeBackCreditsAction(orgId, grantId, credits, reason)`, `setGrantEndAction(orgId, grantId, day | null, reason)`; each returns `{ error?: string }`.

- [ ] Tests: IST boundaries (`endsAtFromDay("2026-12-03")` = `2026-12-03T18:30:00.000Z`; `lastDayOf` of that = `2026-12-03`; `todayIst` at 19:00Z on 2 Dec is `2026-12-03`); schema refusals; db functions call the right RPC with the right arguments and map answers; actions refuse non-admins (requireSuperAdmin throws), return plain errors, revalidate the agency path. Run: fail.
- [ ] Implement. Run: pass. `npx tsc --noEmit -p .`.
- [ ] Commit `feat(billing): admin billing actions, parsing and the billing log`.

### Task 3: Add an agency with billing and free credits

**Files:** Modify `src/components/admin/add-agency-dialog.tsx`, `src/lib/actions/admin.ts` (+ test), `src/lib/people/ops.ts` (`createAgency` takes `opts?: { freeCredits?: { credits: number; day: string } }`), `src/lib/email/templates.ts` (+ test). Create `src/components/admin/billing/billing-mode-field.tsx`, `free-credits-field.tsx`.

- [ ] Tests: `createAgencyAction` default managed writes no billing; `billingMode=plans` calls `setBillingMode` with reason "Added as paying"; with free credits calls `grantCredits(orgId, "free", n, day, ...)`; a failure returns `billingNotSaved`; bad free credits refuse before creating. `ownerInviteEmail` adds the free-credits line only when given. Run: fail.
- [ ] Implement; the credit limit field shows only for managed. Run: pass.
- [ ] Commit `feat(billing): add an agency as paying, with free credits that end`.

### Task 4: The Billing tab

**Files:** Modify `src/app/admin/orgs/[id]/org-tabs.ts`, `page.tsx`, `org-detail-tabs.tsx` (+ tests); create the `src/components/admin/billing/` cards and dialogs (spec "Code").

- [ ] Tests: `ORG_TABS` includes `billing` after overview; the tab shows the mode, the limit editor only for managed, grants only for paying with the empty state; log rows render in plain words. Run: fail.
- [ ] Implement; page loads `listOpenGrants` and `listBillingLog` in the existing `Promise.all`. Run: pass; tsc.
- [ ] Check in the browser with the dev server is not possible before 0067 is applied; rely on component tests.
- [ ] Commit `feat(billing): Billing tab on the admin agency page`.

### Task 5: Docs

- [ ] `docs/database-schema.md` function table; `docs/auth-production-migration.md` 0067 entry (functions list, rollback drops, staging checks for piece 2); ADR D517 in the roadmap §7.
- [ ] Commit `docs(billing): admin billing functions, D517`.
