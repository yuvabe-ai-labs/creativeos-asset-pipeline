# Auth Stage 1 — Decomposition Index & Tracker

**Parent spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 1)
**Branch:** `feat/auth-implementation` → merges to `staging`

Stage 1 (auth foundation, org isolation, admin onboarding UI) is split into **four sub-plans**,
built and reviewed **just-in-time**: each sub-plan doc is written only after the previous one is
executed and reviewed, so later plans reflect what earlier ones taught us.

Each sub-plan is its own mergeable, reviewable checkpoint. Except the deliberate "flip the
switch" moment in **1C**, every checkpoint leaves the app in a working state.

| Sub-plan | Scope | Leaves app… | Plan doc | Status |
|---|---|---|---|---|
| **1A** | Schema + **data migration** (existing data → Yuvabe org) + bootstrap doc | Working, still unauthenticated | `2026-07-21-auth-stage-1a-schema-data-migration.md` | ✅ **done (staging) — see log below** |
| **1B** | Session foundation: `@supabase/ssr` clients, DAL, `/api/me`, `requireSuperAdmin`, pure tests | Working, still open (no gating yet) | `2026-07-21-auth-stage-1b-session-foundation.md` | ✅ **done (staging) — see log below** |
| **1C** | Login page + sign-in/sign-out actions, **then** `proxy.ts` + `withClient` org check + org-scoped queries + `useIdentity` swap. Forced password change deferred (D84). | **Login required; isolation live** (the switch) | `2026-07-21-auth-stage-1c-login-enforcement.md` | ✅ **done (staging) — see log below** |
| **1D** | Admin onboarding UI: organizations repo, admin actions, `/admin`, `/admin/orgs/new`, `/admin/orgs/[id]` | Working; UI onboarding end-to-end | `2026-07-21-auth-stage-1d-admin-onboarding-ui.md` | ✅ **done (staging) — see log below** |

## Parked follow-up (not blocking)

**Migration CI automation** — Supabase CLI + gated GitHub Actions (staging auto, prod behind an
approval gate), so migrations stop being applied by hand. Fully planned in
`2026-07-21-migration-ci-automation.md` but **deferred**: Stage 1 applies its migrations
**manually via the Supabase dashboard SQL editor** (as the 1A plan describes). Resume the CI plan
after Stage 1. It also documented a real gotcha to fix when resumed: a duplicate `0008` migration
version.

## Dependency order (must be sequential)

```
1A ──► 1B ──► 1C ──► 1D
 │      │      │       └ needs requireSuperAdmin (1B) + org-scoped data (1C)
 │      │      └ needs DAL + /login must exist before proxy activates
 │      └ needs the schema + Yuvabe org to resolve caller context against
 └ pure DB; the safe first move (data safety front-loaded)
```

## Data-safety commitments (delivered in 1A)

- `org_id` added **nullable → backfilled → set not null** — the final step aborts loudly if any
  row missed backfill, so nothing is ever silently dropped.
- Pre-flight and post-flight `count(*)` assertions; an in-migration guard raises on any
  unbackfilled client.
- `clients` is the FK-tree root, so its canvases/nodes/versions/generations/KB follow
  automatically (they get their own `org_id` in Stage 2).
- Documented down-migration for both files.
- Old `localStorage` identities are **not** real accounts (spoofable soft-identity, D29) — nothing
  to migrate; real accounts begin at bootstrap + onboarding.

## 1A completion log (2026-07-21, staging)

- Migrations `0012` (schema) and `0013` (data migration) applied to staging; commits
  `60692b4`, `668b488`, `449bb9e` (schema, data migration, bootstrap doc).
- Data migration verified: 28 clients before → 28 after, 0 unbackfilled, all under Yuvabe;
  canvas counts per client spot-checked intact. No data lost.
- Bootstrap performed: `developer@yuvabe.com` created as the first super_admin, linked to
  Yuvabe as `owner`.
- Behavioral checks all fired as expected: last-owner delete blocked, last-owner demote
  blocked, second membership for the same user blocked (unique index); throwaway test org
  cleaned up.
- `npm run build` sanity check was skipped by request (1A touches no app source, so this is
  low-risk, but it's genuinely unverified — worth running before/with 1B rather than assuming).

**Next:** write sub-plan **1B (Session Foundation)**.

## 1B completion log (2026-07-21, staging)

- Commits `4f770c5` (ssr clients), `66b1cb0` (dal-logic, TDD), `9008f5c` (dal.ts),
  `7b223aa` (requireSuperAdmin), `6bf604c` (/api/me).
- **Unplanned knock-on fix:** swapping the browser client to `@supabase/ssr`'s
  `createBrowserClient` broke implicit type inference on 5 pre-existing Realtime
  `.on()`/`.subscribe()` callbacks and `.then()` query-destructuring call sites across
  `use-kb-job-status.ts`, `use-generation-tray.ts`, `use-video-gen-status.ts`, and
  `video-gen-focus-view.tsx`. Fixed with explicit types
  (`RealtimePostgresChangesPayload`, `REALTIME_SUBSCRIBE_STATES`, or inline shapes) —
  no runtime behavior change, bundled into the same commit as the client swap that
  caused it.
- `npm test`: 519/519 passing. `npm run build`: clean.
- Manual check: `/api/me` unauthenticated → 307 to `/login` → `/login` 404s (expected;
  no login page until 1C — confirms the DAL's redirect fires, not a bug).

**Next:** write sub-plan **1C (Login & Enforcement)**.

## 1C completion log (2026-07-21, staging)

- Commits `e7001c7` (login schema + actions), `e238e8f` (login page), `ee6870a`
  (proxy.ts activated), `83c01be` (withClient org check), `f20833e` (org-scoped
  queries), `c70aee5` (useIdentity swap + gate removal). Six commits, as planned.
- **Scope change mid-plan:** forced password change deferred entirely — see D84.
  Simplified Task 1/2 accordingly before execution.
- Switch-flip verified live via curl (no cookies): `/` → 307 to `/login`;
  `/api/clients/anything` → 401 JSON; `/login` itself → 200, unaffected.
- `npm test`: 518/518 passing (519 minus the one deleted `identity-gate` test).
  `npm run build`: clean throughout.
- Manual verification (developer@yuvabe.com, browser): sign-in redirects to `/`;
  home page still shows all 28 Yuvabe clients unfiltered (super_admin); header shows
  "Yuvabe Operator" + working sign-out; Approve button confirmed showing in a focus
  view (owner→senior mapping works end-to-end through `/api/me`).
- **Real bug caught and fixed during manual verification:** `IdentityChip` was
  rendered both in the new root-layout header (global) and in the canvas page's own
  local header (left over from the pre-auth design) — canvas pages showed the
  name/sign-out chip twice. Fixed by removing the canvas page's local copy; folded
  into the Task 6 commit since it was found during that task's own verification.
- **Known limitation, as planned:** full cross-org isolation (a second org/user
  seeing only its own data) is still unverified end-to-end — no second org exists
  yet. That first becomes testable in 1D, once `/admin/orgs/new` can create one.

**Next:** write sub-plan **1D (Admin Onboarding UI)** — also the first point at
which cross-org isolation can be fully verified.

## 1D completion log (2026-07-21, staging) — Stage 1 complete

- Commits `5279a9b` (org schema, TDD), `7517268` (organizations repo), `5fb2bfa`
  (admin actions), `1124e2a` (org list page), `2cea6df` (create-org form), `f7c7717`
  (org detail page), `1cf0c62` (unrelated copy cleanup found while testing), `55227da`
  (D85 — super_admin scoping fix). Eight commits total (six planned + two found during
  verification).
- `npm test`: 523/523 passing. `npm run build`: clean (one transient Windows file-lock
  conflict with the running dev server, not a code issue — resolved by verifying via
  the dev server's own compiler instead of fighting the lock).
- **Real bug caught and fixed during manual verification:** `listOrgMembers`'s embedded
  `profiles(display_name)` select failed at runtime (PGRST200) — `org_memberships` and
  `profiles` both reference `auth.users` but have no direct FK to *each other*, so
  PostgREST can't auto-join them. Not a build-time error; only surfaced by actually
  opening the org detail page. Fixed with two batched queries + a JS join (same pattern
  as `resolveCallerContext`). Considered adding the FK instead (`org_memberships.user_id
  → profiles.user_id`, valid since `profiles.user_id` is a PK) for a single round trip,
  but deferred since it would reopen 1D's "no new migrations" boundary — candidate for
  Stage 2's migration work instead.
- **Architecture correction mid-plan (D85):** caught during isolation testing that
  super_admin's blanket bypass (built in 1C, per the original spec's §6) meant Yuvabe's
  own workspace showed every onboarded agency's clients mixed in — didn't scale, and
  made impersonation pointless. Reverted the bypass in `withClient` + the three list
  queries; super_admin now sees only their own org outside `/admin`, matching what the
  spec's §7 (impersonation) actually implied. Full ADR entry: D85.
- **The real, corrected cross-org isolation test — full end-to-end pass:**
  - Created a second org ("Arun Kumar J") + owner via `/admin/orgs/new` (no CLI, D82)
  - Agency owner's first login: empty client list (not Yuvabe's 28)
  - Created a client as the agency: appeared correctly in their own list
  - Attempted to reach a Yuvabe client (`/api/clients/<yuvabe-client-id>/kb/active`)
    while signed in as the agency: **404** — `withClient`'s org check holds
  - `/admin` while signed in as the agency: **404** — not super_admin
  - Signed back in as `developer@yuvabe.com`: sees **only** Yuvabe's clients now (not
    the agency's) — confirms D85's fix; `/admin` still correctly shows both orgs
- Two unrelated dev-artifact strings found and cleaned up while testing (a leftover
  "Increment 1D · persisted" debug label, and implementation-detail empty-state copy)
  — not auth-related, folded in since they were spotted mid-verification.

**Stage 1 (1A–1D) is now fully shipped to staging.** Next: Stage 2 (RLS backstop + async
worker tenant check) per the rollout plan, whenever that work starts.

**Post-1D fix (commit `7b6a0c5`):** found while scoping Stage 2 — three routes rooted at a
canvas id (`/api/canvas/[id]/cost`, `/api/canvas/[id]/generations`,
`/api/canvases/[cid]/lock/release`) never went through `withClient()` (it only guards
`/api/clients/[id]/*`), so they had **no org isolation at all**. Fixed with a new
`withCanvas()` helper (canvas → client → org check, same shape as `withClient`). Verified
fixed on staging.

**Production is not touched yet.** When ready to promote Stage 1's schema + data migration to
production, follow `docs/auth-production-migration.md` — same procedure as 1A, replayed
against the production Supabase project, with an ordering caveat about deploying the DB
migration and the app code together (read the doc's last section before doing it).

## Definition of done for Stage 1 (all four sub-plans)

See the rollout plan's Stage 1 "Shippable-to-staging checklist." Rolled up: an agency is
onboarded through `/admin/orgs/new`, logs in, sees only its own clients; Yuvabe's existing data
is intact and isolated; cross-org access 404s; `/admin` is super_admin-only.
