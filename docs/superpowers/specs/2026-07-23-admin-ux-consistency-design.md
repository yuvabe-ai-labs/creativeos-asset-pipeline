# CreativeOS — Admin Section UX Consistency

**Date:** 2026-07-23
**Status:** Approved
**Builds on:** `2026-07-21-auth-staging-rollout-plan.md` Stage 1 (1D — admin onboarding UI),
which shipped the admin pages this spec redesigns. No schema or ADR changes — presentation only.

---

## 1. Why

Stage 1D shipped a functional but minimal admin section (`/admin`, `/admin/orgs/[id]`) to
unblock onboarding a second org. It was never brought in line with the rest of the app's
Yuvabe Studios design system, and has a real usability gap: nothing in the app chrome lets a
logged-in super_admin actually reach it. Concretely:

1. No navigation entry point to `/admin` anywhere in the app.
2. Admin pages don't match the clients page's visual language (plain `Card` lists / `<ul>`s
   instead of the table + `Tabs` patterns used everywhere else).
3. The org detail page is a flat stack of Cards with no clear hierarchy, shows the org slug
   (not useful to anyone here), has no visibility into an org's generation activity, and edits
   the credit limit via a permanently-visible input + Save button.

This is presentation-only — no new tables, no new ADR decisions, no behavior change to auth or
org isolation.

---

## 2. Nav entry point + platform-role plumbing

Add an `Admin` link to the global header (`src/app/layout.tsx`), next to `IdentityChip`,
visible only when the caller's `platformRole === "super_admin"`.

`Identity` (`src/lib/identity.ts`) is frozen at `{ name, role }` per D53 — this does not
change. Instead:
- `/api/me` (`src/app/api/me/route.ts`) adds one field to its JSON response: `platformRole`
  (from `caller.platformRole`, already available in `resolveCallerContext()`).
- `useIdentity()` (`src/hooks/use-identity.ts`) returns one additional sibling field —
  `{ identity, hydrated, platformRole }` — cached/dedup'd the same way `identity` already is.
  No existing consumer of `identity`/`hydrated` changes shape.

The header renders the `Admin` link (a plain `Button` with `render={<Link href="/admin">}`,
matching the existing `IdentityChip`'s Button usage) only once `hydrated && platformRole ===
"super_admin"`.

No redirect-on-login: a super_admin's default landing stays the normal app, scoped to their
own org (D85 stands). `/admin` is an always-available side destination, not a takeover.

---

## 3. `/admin` — org list page

Replace the plain `Card`-per-row list with the same row-table pattern `ClientsTable` /
`RecentCanvasesTable` use, for real visual consistency:
- `ListToolbar` (search + sort) above an `overflow-hidden rounded-xl border bg-card
  shadow-card` table.
- `text-eyebrow` header row: Org · Clients · Credit limit · Created.
- Hover rows: initials-avatar chip (same `initials()` helper pattern as the other tables,
  duplicated locally per this codebase's "two call sites = extract, one = leave inline" rule
  — this would be the second occurrence, so it moves to a shared
  `src/lib/format/initials.ts` and both existing tables import it instead of each
  redefining it) + org name, client count, credit limit (or "Unlimited"), created date
  (relative time via the existing `formatRelativeTime`).
- Same `filterAndSort` util (`name` + `recent` sort keys) already used by the other two
  tables — no new list-filtering code.
- "+ New org" button stays, same place (top-right of the page header, unchanged).

---

## 4. `/admin/orgs/[id]` — restructured with Tabs

Adopt the exact `Tabs` treatment the clients page uses (`TabsList variant="line"`, large
`font-display` triggers, `animate-rise` content). Page header shrinks to just the org name —
**the slug is dropped entirely**, it's not useful information on this page.

Four tabs:

- **Overview** (default). A row of stat tiles in a single Card: Members (count), Total
  generations, Monthly credit limit (read-only display — "Unlimited" or the number — with a
  small note pointing to Settings to change it), Created (date). "Total generations" is a
  true total, not capped at 100 like the Generations tab's list — a separate lightweight
  `countGenerationsForOrg(orgId)` query (`select("*", { count: "exact", head: true })`) backs
  this tile so the number isn't misleading for orgs with heavy generation activity. No
  usage-vs-limit math here — that's Stage 3 (credit ledger) territory and out of scope for
  this presentation-only pass.
- **Members**: today's list (`listOrgMembers`, unchanged query), restyled as a compact table
  row-list (name + role) to match the visual language of the other tabs — not the full
  `ClientsTable` treatment (no search/sort needed for a handful of members).
- **Generations**: see §5.
- **Settings**: the credit-limit editor, see §6.

---

## 5. Generations table

New query, `listGenerationsForOrg(orgId, limit = 100)` in `src/lib/db/generations.ts`:
single query on `generations` filtered by `org_id`, embedding `clients(name)` via the
existing nullable `client_id` column (populated going forward per the earlier
forward-only decision — old rows show "—"), ordered by `created_at desc`, capped at 100 rows.
Kept simple on purpose — no server-side range/count pagination.

Component (`generations-table.tsx`) follows the `RecentCanvasesTable` shape: same
`ListToolbar` + table look, columns Type (image/video/prompt), Status (new
`GenerationStatusBadge`, same visual pattern as `KBStatusBadge` — running/succeeded/failed →
amber/emerald/muted), Model, Client (name or "—"), Credits (number or "—"), Created (relative
time).

**Pagination:** the 100 fetched rows are paged client-side, 25 per page, with a new shadcn
`Pagination` primitive added to `src/components/ui/` (built from `Button` + Lucide
`ChevronLeft`/`ChevronRight`, per CLAUDE.md's "primitive doesn't exist yet → add it" rule —
no raw `<button>`s). Search/sort (via the same `filterAndSort` util, sorting by `model_used`
as the "name" field) operates on the full 100-row set before paging is applied, and paging
resets to page 1 whenever the query or sort changes.

---

## 6. Settings tab — credit-limit inline edit

Replace the permanently-visible `Input` + `Save` button with an inline click-to-edit control,
following the visual convention CLAUDE.md documents and `editable-field.tsx` already
establishes elsewhere in the app (dotted underline on hover → click → becomes an input → blur
or Enter commits, Esc cancels) — a new, small component (not a reuse of `editable-field.tsx`
itself, which depends on the canvas-only `useCanvasEditable()` lock context that doesn't apply
here). Calls the existing `updateOrgCreditLimitAction`; same validation/error surface as
today (inline error text below the field), just without the persistent input chrome.

---

## 7. Testing / error handling

No new failure modes — every data query and mutation already exists (`listOrgsWithClientCount`,
`listOrgMembers`, `updateOrgCreditLimitAction`) or is a straightforward filtered read
(`listGenerationsForOrg`). `requireSuperAdmin()` stays as the guard on both routes, unchanged.

Before calling this done: manual pass in-browser — nav link shows for super_admin and not for
a regular owner, tab switching on the org detail page, generations table renders against real
staging data (including orgs with zero generations — empty state matches the `border-dashed`
Card convention the other tables use), credit-limit inline edit commits and shows errors
correctly — plus `npm run build` and the existing test suite.
