# Admin Section UX Consistency — Plan Index

**Spec:** `docs/superpowers/specs/2026-07-23-admin-ux-consistency-design.md` (approved)

Same just-in-time decomposition used for the auth rollout's Stage 1 (1A-1D) and Stage 2
(2A-2C): write one sub-plan, execute + review it, then write the next. This file tracks
scope and status; each sub-plan gets its own file with full task-level detail.

## Sub-plans

- **AX-A — Nav entry point + platformRole plumbing** (spec §2)
  `/api/me` exposes `platformRole`; `useIdentity()` exposes it as a sibling field (Identity
  stays frozen, D53); new `AdminNavLink` component in the header, super_admin-only.
  → `2026-07-23-admin-ux-a-nav-entry.md`. **Status: implemented, reviewed clean (commits
  6572819, 3b92f7a, 25adc75). Manual staging verification (plan Task 3 Step 4) still
  pending.**

- **AX-B — Org list page restyle** (spec §3)
  `/admin` swaps its plain Card list for the `ClientsTable`-style row-table + `ListToolbar`.
  Extracts the duplicated `initials()` helper to `src/lib/format/initials.ts` (second call
  site triggers the project's extraction rule). **Status: not started.**

- **AX-C — Org detail page Tabs shell** (spec §4)
  `/admin/orgs/[id]` restructured with `Tabs` (Overview / Members / Generations / Settings),
  slug removed from the header. This plan builds the shell + Overview (stat tiles, incl. the
  dedicated `countGenerationsForOrg` total) + Members (restyled list) tabs; Generations and
  Settings tabs are stubbed placeholders here, filled in by AX-D and AX-E. **Status: not
  started.**

- **AX-D — Generations table** (spec §5)
  `listGenerationsForOrg(orgId, limit=100)`, `GenerationStatusBadge`, `GenerationsTable`
  component with client-side pagination (new shadcn `Pagination` primitive). Fills in the
  Generations tab stubbed by AX-C. **Status: not started.**

- **AX-E — Credit-limit inline edit** (spec §6)
  New inline click-to-edit component (dotted-underline convention, not a reuse of the
  canvas-locked `editable-field.tsx`) replacing the permanent Input+Save. Fills in the
  Settings tab stubbed by AX-C. **Status: not started.**

## Testing convention note (applies to every sub-plan)

This repo's vitest config (`vitest.config.ts`) runs in a plain Node environment — no jsdom,
no `@testing-library/react`. Existing test coverage is exclusively for pure logic
(`dal-logic.test.ts`, `relative-time.test.ts`, message-composition helpers, etc.) — there
is no precedent anywhere in the codebase for rendering-testing a route handler, a hook, or
a React component. All of Stage 1/2's UI and route work was verified via `npm run build`
(typecheck) + `npm test` (regression on the pure-logic suite) + manual browser verification
on staging, not new unit tests for the UI/route code itself. These sub-plans follow the
same convention: TDD steps (failing test → implementation → passing test) apply only to new
*pure* functions (e.g. any new query-shaping or formatting helper); route/hook/component
changes get a build check + an explicit manual verification step instead of a fabricated
test.
