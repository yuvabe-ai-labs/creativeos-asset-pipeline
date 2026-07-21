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
| **1C** | Login page + auth actions + forced password change, **then** `proxy.ts` + `withClient` org check + org-scoped queries + `useIdentity` swap | **Login required; isolation live** (the switch) | `2026-07-21-auth-stage-1c-login-enforcement.md` | ✍️ **written — awaiting review/execution** |
| **1D** | Admin onboarding UI: organizations repo, admin actions, `/admin`, `/admin/orgs/new`, `/admin/orgs/[id]` | Working; UI onboarding end-to-end | _written after 1C_ | ⏳ not written |

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

## Definition of done for Stage 1 (all four sub-plans)

See the rollout plan's Stage 1 "Shippable-to-staging checklist." Rolled up: an agency is
onboarded through `/admin/orgs/new`, logs in, sees only its own clients; Yuvabe's existing data
is intact and isolated; cross-org access 404s; `/admin` is super_admin-only.
