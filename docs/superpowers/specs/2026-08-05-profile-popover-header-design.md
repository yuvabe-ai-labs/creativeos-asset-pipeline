# CreativeOS — Profile Popover for the Top Nav

**Date:** 2026-08-05
**Status:** Approved
**Builds on:** `2026-07-21-auth-staging-rollout-plan.md` (identity chrome this spec redesigns
shipped there). Presentation + one additive API field — no schema change, no auth/RLS change.

---

## 1. Why

Identity-related chrome is currently split across two unrelated corners of the header:

- **Left** (`HeaderBrand`): wordmark, static "Yuvabe Studios" eyebrow, the caller's org name
  (when it isn't Yuvabe's own org), and the credits-used pill.
- **Right** (`HeaderActions`): the `Admin` link (super_admins only), then `IdentityChip` — a
  small pill showing the user's name plus a separate, adjacent "Sign out" button.

This scatters one coherent concept (*who am I, what org, how do I sign out*) across both ends
of the bar, and permanently occupies bar width with an always-visible name + sign-out button.
Consolidating into a single click-to-reveal profile popover, anchored to a compact avatar
trigger, is standard chrome for this pattern (cf. Canva/Figma-style top navs the rest of this
editor already follows — see `2026-05-30-creativeos-staging-roadmap.md` "Canva-style editor
shell") and frees up bar space.

---

## 2. Trigger: avatar chip

Replaces `IdentityChip`'s pill in `HeaderActions`. A circular avatar button:

- `size-8 rounded-full`, showing `initials(identity.name)` via the existing
  `src/lib/format/initials.ts` helper (already used by `clients-table.tsx` / `orgs-table.tsx` —
  reused, not redeclared, per this repo's reuse rule).
- Styling: `bg-primary/10 text-primary text-xs font-medium`, mirroring the small circular badge
  `HeaderCredits` already uses for its `Zap` icon — the two read as a matched pair at either end
  of the bar.
- Hover: `ring-1 ring-primary/40`, transition on the system's standard easing
  (`cubic-bezier(0.22,1,0.36,1)`, 200ms) — the only affordance change, no shadow/scale per the
  "barely-perceptible" motion rule.
- Renders nothing until `hydrated && identity` (matches how `AdminNavLink` and the credits pill
  already gate on hydration) — avoids a flash of an avatar with blank initials.

## 3. Popover content

Built on the existing `Popover`/`PopoverTrigger`/`PopoverContent` primitives
(`src/components/ui/popover.tsx`, Base UI) — no changes needed to that primitive.
`align="end"` so the popup hangs under the avatar, not off the right edge of the viewport.

Layout, top to bottom:

1. **Identity block** — name (`text-sm font-medium text-foreground`), role label underneath in
   `text-xs text-muted-foreground` (`"Owner"` / `"Senior"` / `"Designer"` — see §4 for where this
   comes from).
2. Divider (`h-px bg-border`).
3. **Workspace row** — small `text-eyebrow`-style label ("Workspace") above the org name
   (`text-sm font-medium`). This is the org-name display that moves out of `HeaderBrand` (§5) —
   it doesn't duplicate the static "Yuvabe Studios" brand eyebrow because it's now scoped inside
   a popover about *this account*, not sitting next to the wordmark.
4. Divider.
5. **Sign out** — full-width row, `LogOut` icon (Lucide, 1.5 stroke) + "Sign out" label, ghost
   button styling. Same submit handler `IdentityChip` has today (`resetIdentityCache()` →
   `logoutAction()` → hard `window.location.href = "/login"` navigation) — copied over
   unchanged, no behavior change. The hard navigation that follows makes explicitly closing the
   popover on click unnecessary.

The credits pill and the `Admin` link are explicitly **not** folded in here — see §6.

## 4. `/api/me` gains a real `orgRole` field

`Identity.role` (`"senior" | "designer"`, frozen shape per D53) is a *collapsed* role that only
exists to gate the Approve feature — `orgRoleToIdentityRole()` maps `owner → "senior"`. It
cannot be shown to the user as their actual role: an Owner would see "Senior" in their own
profile popover, which is simply wrong.

Fix: `GET /api/me` (`src/app/api/me/route.ts`) adds one new, additive field to its response —
`orgRole: OrgRole` (the real `"owner" | "senior" | "designer"`, from `caller.orgRole`, already
available in `resolveCallerContext()`). This is the same pattern the admin-UX spec already used
to add `platformRole` — an additive sibling field, no change to `Identity`'s frozen `{ name,
role }` shape or to any existing Approve-gating logic that reads the collapsed `role`.

`useIdentity()` (`src/hooks/use-identity.ts`) gets one more cached sibling field, `orgRole:
OrgRole | null`, following the exact pattern `orgId`/`orgName`/`platformRole` already use
(module-level cache var, reset in `resetIdentityCache()`, returned alongside the rest).

A 3-entry label map (`owner → "Owner"`, `senior → "Senior"`, `designer → "Designer"`) lives
inline in the new popover component — single call site, so per this repo's "two call sites =
extract, one = leave inline" rule it does not need its own module.

## 5. `HeaderBrand` loses the org-name display

Drop the org-name `<span>` + its preceding divider and the `showOrgName` variable entirely.
`showIdentity` (the hydration + pathname gate) stays exactly as-is — `HeaderCredits` still needs
it, and `orgName` is still fetched (just no longer rendered here) because `showIdentity`'s
`Boolean(orgName)` check is what confirms identity actually resolved before showing credits.

Net result, left side of the bar: wordmark → "Yuvabe Studios" eyebrow → credits pill. Right
side: `Admin` link (if super_admin) → avatar trigger.

## 6. What stays put, and why

- **Credits pill** stays in the bar, unmoved. It's a live, glanceable usage meter people check
  often — burying a frequently-referenced number behind a click adds friction for something
  meant to be always visible at a glance.
- **`Admin` link** stays in the bar, unmoved. It's a navigation destination (`/admin`), not an
  account action — mixing it into an account-actions menu would blur that distinction, and it's
  already one click away as-is.

## 7. File changes

- **New:** `src/components/identity/profile-popover.tsx` — the avatar trigger + popover
  content described in §2–3.
- **Delete:** `src/components/identity/identity-chip.tsx` — fully superseded, no other
  importers (confirmed: only `header-actions.tsx` imports it; a second reference in
  `src/app/clients/[id]/canvases/[cid]/page.tsx` is a stale comment, not an import).
- **Edit:** `src/components/layout/header-actions.tsx` — swap `<IdentityChip />` for
  `<ProfilePopover />`.
- **Edit:** `src/components/layout/header-brand.tsx` — remove the org-name span/divider and
  `showOrgName`, per §5.
- **Edit:** `src/app/api/me/route.ts` — add `orgRole` to the response, per §4.
- **Edit:** `src/hooks/use-identity.ts` — add `orgRole` as a cached sibling field, per §4.

## 8. Out of scope

No changes to sign-out behavior, session handling, credit accounting, or the Approve-gating
logic that reads `Identity.role`. No new pages. No changes to `/admin` or `/account/password`.

---

## ADR

**D101 — Header identity chrome consolidates into a profile popover; `/api/me` gains a real
`orgRole` alongside the collapsed gating `role`** *(recorded 2026-08-05)*

- **Decision:** Replace the always-visible name pill + adjacent sign-out button
  (`IdentityChip`) and the org-name span in `HeaderBrand` with a single avatar-triggered
  popover (name, real role, org, sign out). `/api/me` adds an additive `orgRole: OrgRole`
  field for display purposes, separate from the existing collapsed `Identity.role` (frozen
  per D53, still used only for Approve-gating).
- **Why:** Identity chrome was split across both ends of the header for no functional reason;
  consolidating reduces permanent bar width and matches the Canva-style chrome the rest of the
  editor follows. The collapsed `role` field cannot be shown to users directly — it would
  display "Senior" for an Owner.
- **Rejected:** Showing the collapsed `role` in the popover directly (wrong for Owners) instead
  of adding `orgRole`. Folding the credits pill or the `Admin` link into the popover (both
  rejected per §6 — one's a glanceable live meter, the other's navigation, not an account
  action).
- **Refines:** D53 (Identity's frozen shape — unchanged; `orgRole` is an additive sibling field
  on the `/api/me` response, same pattern D-admin-ux-consistency used for `platformRole`).
- **Originated →** `2026-08-05-profile-popover-header-design.md`

*Note: this branch was cut from `main`, whose copy of the ADR log tops out at D100 — `staging`
has since moved ahead independently (up to ~D119 as of this writing). D101 here may need
renumbering at merge time, consistent with this log's existing renumbering convention (see
D90/D94/D95–D100 above).*
