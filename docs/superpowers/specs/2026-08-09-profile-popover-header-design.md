# CreativeOS — Profile Popover for the Top Nav (v2)

**Date:** 2026-08-09
**Status:** Approved
**Supersedes:** `2026-08-05-profile-popover-header-design.md` (D101, never merged to staging —
built on an orphaned worktree cut before a large chunk of staging history landed). This spec
keeps that design's avatar-trigger + `orgRole` plumbing but reverses its §6 decision to leave
the credits pill in the bar — see §1.

---

## 1. Why (and what changed from the prior design)

The prior design consolidated the name pill + sign-out button + org-name span into a single
avatar-triggered popover, but explicitly kept the credits pill in the bar as "a live, glanceable
usage meter." A new reference mockup calls for the opposite: the org's monthly credit usage
(with its progress bar) moves fully into the popover, and the bar itself shows a *different*,
canvas-scoped number instead — how many credits this specific canvas has consumed
(`CanvasCostChip`, `src/components/canvas/canvas-cost-chip.tsx`), restyled to read as a proper
stat chip rather than plain text. These are two distinct numbers (org month-to-date usage vs.
one canvas's lifetime spend) that happened to look similar in the old bar; the new layout makes
that distinction clearer by giving each its own home.

## 2. Trigger: avatar chip

Unchanged from the prior design. Replaces `IdentityChip`'s pill in `HeaderActions`:

- `size-8 rounded-full` button showing `initials(identity.name)` via the existing
  `src/lib/format/initials.ts` helper (already used by `clients-table.tsx` / `orgs-table.tsx`).
- `bg-primary/10 text-primary text-xs font-medium` — mirrors the small circular badge
  `HeaderCredits` used for its `Zap` icon, so the avatar reads as chrome from the same family.
- Hover: `ring-1 ring-primary/40`, system easing (`cubic-bezier(0.22,1,0.36,1)`, 200ms), no
  shadow/scale change (barely-perceptible motion rule).
- Renders nothing until `hydrated && identity` — avoids a flash of blank initials.

## 3. Popover content

Built on the existing `Popover`/`PopoverTrigger`/`PopoverContent` primitives
(`src/components/ui/popover.tsx`). `align="end"` so the popup hangs under the avatar. Top to
bottom:

1. **Identity block** — name (`text-sm font-medium`), role underneath (`text-xs
   text-muted-foreground`): `"Owner"` / `"Senior"` / `"Designer"`, from the new `orgRole` field
   (§4).
2. Divider.
3. **Credits section** — `text-eyebrow` label "Credits" with a small `Zap` icon (same
   `bg-primary/10 text-primary` circular badge used elsewhere), `used / limit` figures
   (`font-display font-semibold` for the used figure, muted `/ limit`), and a full-width
   progress bar underneath (`h-1 rounded-full bg-muted` track, `bg-primary` fill, amber instead
   of primary when `used > limit`) — this is `HeaderCredits`'s existing data and Realtime
   subscription (`useIdentity().creditsUsed` / `monthlyCreditLimit`, live-updated via the
   `credit_transactions` Realtime channel), relocated here and restyled to fit the popover
   (no card border/background — it's already inside one).
4. Divider.
5. **Workspace section** — `text-eyebrow` label "Workspace" with a small building icon
   (`Building2`, Lucide), org name (`text-sm font-medium`).
6. Divider.
7. **Sign out** — full-width row, `LogOut` icon + "Sign out" label, styled in the destructive
   red used elsewhere for delete/sign-out actions (`text-destructive`, `hover:bg-destructive/5`)
   rather than the prior design's neutral ghost styling — matches the reference mockup and
   signals it ends the session. Same submit handler as today's `IdentityChip`
   (`resetIdentityCache()` → `logoutAction()` → hard `window.location.href = "/login"`), carried
   over unchanged.

## 4. `/api/me` gains a real `orgRole` field

Unchanged from the prior design. `Identity.role` (`"senior" | "designer"`, frozen shape per
D53) is a *collapsed* role that exists only to gate the Approve feature —
`orgRoleToIdentityRole()` maps `owner → "senior"`. It cannot be shown to the user as their
actual role (an Owner would see "Senior").

`GET /api/me` (`src/app/api/me/route.ts`) adds one additive field — `orgRole: OrgRole` (the
real `"owner" | "senior" | "designer"`, from `caller.orgRole`) — the same pattern already used
for `platformRole`. No change to `Identity`'s frozen `{ name, role }` shape or to any
Approve-gating logic that reads the collapsed `role`.

`useIdentity()` (`src/hooks/use-identity.ts`) gets `orgRole: OrgRole | null` as one more cached
sibling field, following the exact `orgId`/`orgName`/`platformRole` pattern.

A 3-entry label map (`owner → "Owner"`, `senior → "Senior"`, `designer → "Designer"`) lives
inline in the popover component — single call site, so per this repo's "two call sites =
extract, one = leave inline" rule it stays inline.

## 5. `HeaderBrand` loses the org-name span *and* the credits pill

Drop the org-name `<span>` + its divider (`showOrgName`) — same as the prior design. Also drop
`<HeaderCredits />` from this component entirely (§1) — its content moves into the popover
(§3), so `HeaderBrand` renders just the wordmark + "Yuvabe Studios" eyebrow. `showIdentity`
(the hydration + pathname gate) is no longer needed here once nothing downstream of it renders;
remove it along with the now-unused `orgName`/credits-gating logic in this file. The
`use-identity.ts` fields it currently reads (`orgName`, `creditsUsed`, `monthlyCreditLimit`)
stay — they're now consumed by the popover and (`orgName` only) already used elsewhere.

`HeaderCredits` (`src/components/layout/header-credits.tsx`) — its Realtime-subscription logic
is exactly what the popover's credits section needs, so it moves (file relocates to
`src/components/identity/profile-credits.tsx`, since it's now identity-popover chrome, not
generic header chrome) and its JSX is restyled per §3 (drop the card border/background/fixed
width; add the "Credits" eyebrow label). No behavioral change to the Realtime subscription
itself.

## 6. `CanvasCostChip` becomes a real stat chip

`src/components/canvas/canvas-cost-chip.tsx` currently renders plain text: `"1,234 credits
total"`. Restyle to match the reference: a small `Zap` icon (`bg-primary/10 text-primary`
circular badge, matching the popover's credits icon), a bold number
(`font-display font-semibold tabular-nums`), and the label "Canvas Consumption" in
`text-muted-foreground` — all inline (not a bordered card; this sits directly in the canvas
page's breadcrumb header row, which already has its own border).

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, swap the render order in that header's right
group so the cost chip comes before `GalleryDrawerTrigger` (currently Gallery renders first) —
matches the reference's left-to-right order.

## 7. What stays put, and why

- **`Admin` link** (super_admins only) stays in the bar, unmoved, beside the avatar trigger —
  it's a navigation destination (`/admin`), not an account action; already confirmed with the
  user.

## 8. File changes

- **New:** `src/components/identity/profile-popover.tsx` — avatar trigger + popover content
  (§2–3), including the credits and workspace sections.
- **Moved + restyled:** `src/components/layout/header-credits.tsx` →
  `src/components/identity/profile-credits.tsx` (§5) — same Realtime logic, new JSX, rendered
  from `profile-popover.tsx` instead of `header-brand.tsx`.
- **Delete:** `src/components/identity/identity-chip.tsx` — fully superseded (only
  `header-actions.tsx` imports it today).
- **Edit:** `src/components/layout/header-actions.tsx` — swap `<IdentityChip />` for
  `<ProfilePopover />`.
- **Edit:** `src/components/layout/header-brand.tsx` — remove the org-name span, `showOrgName`,
  `showIdentity`, and `<HeaderCredits />` (§5).
- **Edit:** `src/app/api/me/route.ts` — add `orgRole` to the response (§4).
- **Edit:** `src/hooks/use-identity.ts` — add `orgRole` as a cached sibling field (§4).
- **Edit:** `src/components/canvas/canvas-cost-chip.tsx` — restyle as a stat chip (§6).
- **Edit:** `src/app/clients/[id]/canvases/[cid]/page.tsx` — reorder cost chip before Gallery
  trigger (§6).

## 9. Out of scope

No changes to sign-out behavior, session handling, credit accounting math, or the
Approve-gating logic that reads `Identity.role`. No new pages. No changes to `/admin` or
`/account/password`.

---

## ADR

**D136 — Header identity chrome consolidates into a profile popover, including credits;
`CanvasCostChip` becomes the bar's stat chip; `/api/me` gains a real `orgRole`** *(recorded
2026-08-09; supersedes the profile-popover design from `2026-08-05-profile-popover-header-
design.md`, cut on an orphaned worktree as "D101" there — a numbering collision with this
log's own unrelated, current D101, not a real dependency)*

- **Decision:** Replace the always-visible name pill + adjacent sign-out button
  (`IdentityChip`) and the org-name span in `HeaderBrand` with a single avatar-triggered
  popover (name, real role, credits with progress bar, workspace, sign out in red). The
  header's standalone credits pill (`HeaderCredits`) is removed from the bar and its content
  relocates into the popover. The canvas page's per-canvas spend display (`CanvasCostChip`)
  becomes the bar's remaining glanceable stat chip, restyled with an icon and "Canvas
  Consumption" label. `/api/me` adds an additive `orgRole: OrgRole` field for display,
  separate from the existing collapsed `Identity.role` (frozen per D53).
- **Why:** A newer reference design distinguishes two different numbers that the old bar
  conflated: org month-to-date usage (now popover-only, checked less often than glanced-at) vs.
  one canvas's lifetime spend (now the bar's chip, directly relevant to the page you're on).
  The collapsed `role` field still cannot be shown to users directly (would display "Senior"
  for an Owner) — same reasoning as the prior design.
- **Rejected:** Keeping the credits pill in the bar per the prior design's §6 — superseded by
  the newer reference design's split between org-level and canvas-level spend. Showing the
  collapsed `role` in the popover directly (wrong for Owners). Folding the `Admin` link into
  the popover (still a navigation destination, not an account action).
- **Refines:** D53 (Identity's frozen shape — unchanged; `orgRole` is an additive sibling
  field). The orphaned worktree's profile-popover design (superseded — the avatar-trigger/
  popover shell and `orgRole` plumbing carry over unchanged; the "credits stays in the bar"
  decision does not).
- **Originated →** `2026-08-09-profile-popover-header-design.md`
