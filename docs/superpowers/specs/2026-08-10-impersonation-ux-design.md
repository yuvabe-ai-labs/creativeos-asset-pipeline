# Impersonation UX — Design

**Status:** approved, not yet implemented.
**ADR:** D139, D140 (`2026-05-30-creativeos-staging-roadmap.md` §7). Builds on D81, D101
(`withAction`), D138 (`AlertDialog` for destructive confirms).
**Supersedes:** `2026-08-04-impersonation-stage4-design.md` §5 ("UI") — that section's banner
and entry flow shipped as specified and is what this design replaces. Everything else in the
Stage 4 design (cookie, DAL, write-gating, audit log) is unchanged.

## 1. Context

Stage 4 impersonation is live: the cookie, the DAL hook, the write-gate and the audit log all
work. The *interface* around them does not communicate. Operator feedback from a colleague
testing it: entering an org "didn't feel like it activated at all."

An audit of the full surface found thirteen gaps. They cluster into three causes:

1. **Nothing explains the action.** "Enter as this org" is a single unconfirmed click that
   redirects to `/`, with no statement of what you are about to do, whose data you'll see, or
   that it is recorded.
2. **Nothing acknowledges it happened.** All three transitions (enter, elevate, exit)
   `redirect()` from the server, which structurally destroys any chance of a toast. `<Toaster />`
   is wired in `layout.tsx` and unused by this feature.
3. **The persistent indicator doesn't hold.** The banner is a 36px `bg-muted` strip that reads
   as a system notice, and — the actual bug — **it isn't sticky while the header below it is**,
   so scrolling makes every trace of impersonation disappear.

The most severe finding is #3's sticky bug. The rest are polish; that one lets an operator
forget they are inside a customer's account while writing to it.

## 2. Scope

**In scope:** the banner redesign, confirm dialogs on both entry points, the toast layer,
the already-impersonating state on `/admin/orgs/[id]`, and two code cleanups the audit exposed.

**Explicitly out of scope** (both are deliberate calls, not oversights):

- **Returning from elevated mode to read-only.** The audit flagged elevated mode as a one-way
  door. Deferred by decision — no `exitElevatedMode()`, and therefore no migration to widen the
  `event_type` CHECK constraint on `impersonation_audit_log`. This raises the stakes on the
  elevate confirm dialog, which must state that the only way back is to exit and re-enter.
- **Surfacing the 2-hour session TTL.** No countdown, no expiry warning, and no mention of the
  time limit in any dialog copy. Deferred by decision: the operator-facing story is "you are
  viewing as X," not "you have N minutes left."

## 3. The banner

`ImpersonationBanner` stays a server component (resolves state, then the org's display name)
and keeps its existing degraded branch for the deleted-org race. What changes is everything
below that.

### Layout and stickiness

- The banner becomes `sticky top-0 z-50`, and the app header moves from `top-0` to `top-11`.
- The offset must be conditional, since the banner renders nothing when not impersonating.
  `RootLayout` calls `resolveImpersonationState()` itself — it is `cache()`d per request, so
  this is deduped with the banner's own call and costs nothing — and picks the header's `top-0`
  / `top-11` accordingly.
- Height `h-11` (44px), aligned to the page gutter (`px-6`, left-aligned, **not** centered), so
  it reads as application chrome rather than a stray notice.

### Content

Left to right: an org monogram chip (initials on a neutral ground), a `.text-eyebrow` state
label, the org name in `font-semibold`, a state pill, then the actions pushed right.

Exit is promoted from `variant="ghost"` to `variant="outline"`. It is the escape hatch and
should not be the faintest element in the bar.

### The two states

| | Read-only | Elevated |
|---|---|---|
| Eyebrow | `VIEWING AS` | `EDITING AS` |
| Background | white | soft `#ffca2d` wash (~10%) |
| Left rule | 3px brand purple | 3px amber |
| Icon | `Eye` | `Unlock` |
| Pill | "Read-only", `neutral-500` | "Editing" + pulsing dot |
| Actions | `Enable editing`, `Exit` | `Exit` |

Same skeleton in both states, unmistakably different temperature. This is the only place the
brand yellow appears, and it appears as a soft tint — consistent with the design system's
"yellow only as a soft glow" rule. The purple stays a 3px rule, never a fill.

## 4. Confirm dialogs

Two new `AlertDialog`s (per D138 — destructive confirms are non-dismissible by design).

**Entering impersonation**, from `/admin/orgs/[id]`:

> **Enter as Acme Creative?**
> You'll see CreativeOS exactly as Acme Creative sees it, using their data. You'll be
> read-only — you can look around but not change anything. This session is recorded in the
> audit log.
>
> `Cancel` · `Enter as Acme Creative`

**Enabling editing**, from the banner — the more important of the two, because with
switch-back out of scope this is irreversible for the session:

> **Enable editing for Acme Creative?**
> You'll be able to create, edit and delete Acme Creative's real data. Every change is
> recorded against your account. To go back to read-only you'll need to exit and re-enter.
>
> `Cancel` · `Enable editing` (destructive variant)

### Vocabulary

The user-facing button becomes **"Enable editing"**, not "Enter elevated mode". "Elevated mode"
is our internal term; it stays unchanged in code, in the ADR log, and in the
`elevated_mode_entered` audit event. Only the label an operator reads changes.

## 5. Feedback layer

### Navigation moves to the client

`enterImpersonationAction` and `exitImpersonationAction` currently call `redirect()`. A server
redirect unmounts the calling component before it can toast, so no acknowledgement is possible
from where the user clicked. Both actions instead do their work, call
`revalidatePath("/", "layout")`, and return; the client component toasts and then
`router.push()`es.

This also removes the `unstable_rethrow` dance in `enter-impersonation-button.tsx`, which only
exists to distinguish Next's redirect control-flow rejection from a genuine error. With no
redirect, a thrown error is unambiguously an error.

### Toasts

| Transition | Toast |
|---|---|
| Entered | `success` — "Now viewing as Acme Creative" / "Read-only. Everything you see is their data." |
| Editing enabled | `warning` — "Editing enabled for Acme Creative" |
| Exited | `success` — "Exited — back in your own account" |
| Any failure | `error` with the thrown message |

Toasts replace the inline `<span className="text-destructive">` error nodes in both button
components, which never clear once set and are easy to miss.

## 6. Cleanups this exposed

- **Duplicated gate message.** `"Read-only while impersonating — enter elevated mode to make
  changes."` appears verbatim in `src/lib/api/route-helpers.ts` and
  `src/lib/actions/with-action.ts`. Two call sites, so per AGENTS.md's reuse rule it moves to a
  single exported constant. Its wording also updates to match the new vocabulary ("enable
  editing"), which is precisely the kind of drift a duplicated literal invites.
- **Already-impersonating state.** `/admin/orgs/[id]` renders "Enter as this org"
  unconditionally, including while you are already inside that very org. The page resolves
  impersonation state and renders a "You're viewing as this org" indicator instead when the
  target matches.

## 7. Components

| File | Change |
|---|---|
| `src/app/layout.tsx` | Resolve impersonation state; conditional header `top` offset |
| `src/components/layout/impersonation-banner.tsx` | Rewritten: sticky chrome, monogram, two states |
| `src/components/layout/impersonation-banner-actions.tsx` | Rewritten: elevate confirm dialog, toasts |
| `src/app/admin/orgs/[id]/enter-impersonation-button.tsx` | Rewritten: entry confirm dialog, toast, client nav |
| `src/app/admin/orgs/[id]/page.tsx` | Already-impersonating branch |
| `src/lib/actions/impersonation.ts` | Drop `redirect()`; `revalidatePath` and return |
| `src/lib/api/route-helpers.ts`, `src/lib/actions/with-action.ts` | Import the shared gate message |

If the banner's state-dependent styling pushes either banner file past roughly 200 lines, the
two visual states split into their own presentational component rather than growing one file
(per the component-structure guide).

## 8. Testing

- `impersonation.ts` action tests: assert the actions no longer redirect and do call
  `revalidatePath` — this is a contract change, and the existing tests assert the redirect.
- Banner rendering: not impersonating → renders nothing; read-only → `VIEWING AS` + "Enable
  editing" present; elevated → `EDITING AS`, no "Enable editing" button; deleted-org race →
  still renders a working Exit.
- Header offset: header is `top-0` when not impersonating, offset when impersonating.
- Confirm dialogs: the action fires only after confirming, and not on cancel.
- Gate message: one constant, imported by both consumers — asserted by the existing
  `route-helpers.test.ts` / `with-action.test.ts` suites continuing to pass against it.

## 9. Verification

Sticky positioning interacts with existing chrome. Before this is called done, check the canvas
editor and any full-bleed or fixed overlay that assumes a 64px header for a 44px shift while
impersonating — the editor's own overlays (gallery drawer, copilot button, focus sheet) are the
likely collision sites.
