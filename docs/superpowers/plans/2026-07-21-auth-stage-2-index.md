# Auth Stage 2 — Decomposition Index & Tracker

**Parent spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 2)
**Branch:** `feat/auth-implementation` → merges to `staging`
**Follows:** Stage 1 (1A–1D), fully shipped to staging.

Stage 2 was originally scoped by the rollout plan as "RLS backstop + async worker tenant
check" — pure hardening, no urgency. While scoping it, a **significant, unplanned finding**
expanded it: 13 `/api/nodes/[id]/*` routes (the actual generation-triggering, cost-incurring,
mutating endpoints) have **zero org isolation** — they never pass through `withClient()`,
same architectural gap as the canvas-rooted routes fixed as a post-1D patch (commit `7b6a0c5`),
but far larger in surface area and severity. You chose to fold this into Stage 2 rather than
patch it standalone.

Given the expanded scope, Stage 2 is **decomposed the same way Stage 1 was** — just-in-time,
one sub-plan written, reviewed, and executed before the next is written.

| Sub-plan | Scope | Priority | Plan doc | Status |
|---|---|---|---|---|
| **2A** | `withNode()` helper + wire all node-rooted routes through it | **Urgent — real, currently-open gap** | `2026-07-21-auth-stage-2a-node-isolation-fix.md` | ✅ **done (staging) — see log below** |
| **2B** | `org_id` + RLS on `generations`, `client_kb_jobs`, `canvases` (corrected from the original spec's 5-table list — `node_files` doesn't exist as a DB table, see note below) | Hardening, no urgency | `2026-07-21-auth-stage-2b-rls-backstop.md` | ✅ **done (staging) — see log below** |
| **2C** | Async worker tenant check: generation + kb-build webhooks re-validate `org_id` before processing. Expanded to also cover: the generation webhook has **no authentication at all** (found while scoping this plan — bigger than D79's original scope) | Hardening + a real, currently-open gap | `2026-07-21-auth-stage-2c-worker-tenant-check.md` | ✅ **done (staging) — see log below** |

## Corrections to the original Stage 2 scope (found during investigation, not guessed)

- **`node_files` isn't a table.** It's a vestigial Supabase Storage bucket policy from before
  the storage backend moved to GCS (D30) — unused today (`src/lib/storage/gcs.ts` is the real
  path). The original spec (D78) named it as one of 5 tables needing `org_id` + RLS; that's
  factually wrong. 2B touches 3 real tables, not 4.
- **D85's super_admin scoping simplifies the RLS policy design.** The original Stage 2
  description (in the rollout plan / D78) assumed RLS policies need a super_admin
  JWT-claim bypass "so a super_admin's own Realtime subscription isn't blocked from any org
  but Yuvabe's." Since D85 scoped super_admin's normal-app view to their own org too, no
  bypass is needed — a plain `org_id` match against the caller's own membership is sufficient.
  2B will design policies accordingly, not per the original (now-superseded) assumption.
- **`generations`' `org_id` backfill is a 3-hop join** (`node_id` → `nodes.canvas_id` →
  `canvases.client_id` → `clients.org_id`), not a direct column. `canvases` and
  `client_kb_jobs` both have `client_id` directly (1-hop). 2B's migration should add
  `canvases.org_id` first (direct), then use it to simplify `generations`' backfill to a
  2-hop join via `nodes.canvas_id` → `canvases.org_id` (now populated), rather than joining
  through `clients` a second time.
- **`client_kb_jobs` is already in the `supabase_realtime` publication** (migration `0008`).
  Whether `generations` is too isn't recorded in any migration — it may have been added
  manually (matching how `0001`–`0011` were hand-applied before this session). 2B must
  **verify, not assume**, before deciding whether to add it.

## Dependency order

```
2A (node isolation) ──► independent, do first (urgent, no dependency on 2B/2C)
2B (RLS backstop)    ──► independent of 2A; needs no app code changes
2C (worker check)    ──► depends on 2B (needs generations.org_id / client_kb_jobs.org_id to exist)
```

2A can ship on its own the moment it's reviewed — it doesn't block or get blocked by 2B/2C.

## 2A completion log (2026-07-21, staging)

- Commits `8735185` (single-query `withNode` + `withCanvas` retrofit), `b0876af` (worked
  examples: `cost`, `duplicate`), `7947cea` (remaining routes).
- **Performance-conscious design, decided before writing code, not after:** raised as a
  concern before Task 1 was written — `withNode()` resolves `node → canvas → client.org_id`
  in a single PostgREST embedded-join query, not three sequential round trips.
  `withCanvas()` (shipped earlier, commit `7b6a0c5`) was retrofitted the same way in the
  same task, since leaving it at two queries while `withNode` used one would've been
  inconsistent for no reason. A real (and rejected) alternative was discussed: moving the
  node pipeline onto RLS instead of app-layer checks, which would have been an equally
  elegant fix for the same performance question — rejected because it reopens D44
  (RLS-everywhere touches ~34 service-role call sites) for no reason beyond this one perf
  question; the single-query collapse gets the same benefit without touching that boundary.
- **Scope grew mid-task, not silently:** the plan named 13 files; a directory listing had
  missed 3 nested route files (`compose/select`, `file/drive`, `file/extract`) plus one
  sibling route with a different shape (`duplicate-batch`, takes `canvasId` from the body,
  not a URL param — wired via `withCanvas()` instead of `withNode()`). All caught by the
  plan's own completeness check (`git grep -L`), not assumed complete from the file list.
  `file/extract` additionally had a stale comment citing D14 ("auth deferred") — D14 was
  superseded by D43 back when auth was designed; comment removed, not left misleading.
- **One test suite break, fixed correctly:** `file/drive/route.test.ts` mocked the old
  service-role-only node-existence check; `withNode()` now also resolves caller context and
  queries via an embedded join. Mocks updated to match the new shape (`resolveCallerContext`
  + the `nodes → canvases → clients` embed), not deleted or loosened.
- `npm test`: 523/523 passing. `npm run build`: clean.
- Manual verification: `cost` route confirmed blocking cross-org access (`{"error":"Node not
  found."}`) while same-org access returns real data; reasoned (not individually retested)
  that this generalizes to every other node route since all 17 files call the identical
  `withNode()`/`withCanvas()` gate — no per-route variation in the isolation logic itself.
  Yuvabe's own generation pipeline confirmed still working end-to-end post-fix.

**Next:** write sub-plan **2B (RLS backstop)**.

## 2B completion log (2026-07-21/23, staging)

- Commits `5db2cf1` (migration `0014`), `ef44a75` (migration `0015` — D86, dropped a
  pre-existing exposure), `62877cf` (fixed org_id insert-path breakage), `a1889b6`
  (client_id/output_snapshot/email additions). Four commits — one planned, three from
  things verification surfaced.
- **Planned work:** migration `0014` — `org_id` + a single `select`-only RLS policy on
  `canvases`, `client_kb_jobs`, `generations`, no super_admin bypass (D85). Count parity
  confirmed (36/23/252 before and after), zero unbackfilled rows, `rowsecurity = true` on
  all three, `generations` confirmed in the `supabase_realtime` publication.
- **Real, currently-exploitable finding (D86):** `pg_policies` inspection after applying
  `0014` revealed `generations` already carried an unrecorded `anon_read_generations`
  policy (`qual: true`, `roles: {public}`) — unconditional read access for anyone with
  the public anon key, including unauthenticated requests, direct to Supabase's REST API,
  bypassing the Next.js app entirely. Since Postgres OR's permissive RLS policies
  together, this made the brand-new `org isolation` policy on `generations` functionally
  inert. Not caught by row-count/`rowsecurity` checks alone — only found by inspecting
  `pg_policies` directly. Dropped in migration `0015`.
- **Critical bug, caught live, not in review:** `0014`'s `not null` constraint on
  `org_id` broke every *new* insert into all three tables — the backfill only covered
  existing rows; no app code path setting `org_id` on creation was ever checked. A real
  `image-generate` attempt on staging failed immediately with a not-null violation.
  Fixed all 4 real insert paths (`insertGeneration` via 3 node routes + `withNode` now
  threading the resolved org through, `createCanvas`/`createCanvasAction`, `insertKBJob`/
  `startKBBuildJob`, and the temporary `eval-bootstrap` route) — found via exhaustive
  grep across the whole tree, not just the files the first error happened to surface.
  This is the same lesson as 2A's `git grep -L` completeness check, one level deeper:
  verifying a migration's backfill is not the same as verifying every future insert.
- **Follow-on addition (explicitly requested, not scope creep):** `generations` gained
  `client_id` and `output_snapshot` (migration `0016`, nullable, not backfilled —
  populated going forward only) plus `meta.email` captured at creation. Found and fixed a
  second real bug while wiring this up: `succeedGeneration()` unconditionally overwrote
  `meta` on every completion (`meta: input.meta ?? null`), which would have silently
  wiped the just-set email the moment a generation completed, since neither `generate`
  nor `image-generate` ever pass `meta`. Fixed to only touch `meta` when explicitly given
  a new value. `CallerContext` gained `email`; `withNode()` now passes the full caller
  context + resolved `clientId` to its callback (both already computed internally for the
  org check, so no extra query). Also backfilled `org_id` into `GenerationRow`/
  `CanvasRow`/`ClientKBJobRow`'s TypeScript types in `db/types.ts` — missed when `0014`
  added the columns, only caught while touching the same types again for this addition.
  Verified live: a real generation's row showed `org_id`, `client_id`, a real GCS
  `output_snapshot` URL, and `meta.email` all correctly populated.
- `npm test`: 523/523 passing throughout. `npm run build`: clean throughout.
- Manual verification: Generation Tray confirmed still updating live post-RLS (no
  Realtime regression); a same-org generation runs end-to-end for real, not just via unit
  tests.

**Next:** write sub-plan **2C (async worker tenant check)** — now unblocked.

## Post-2B urgent finding: default-deny RLS on every remaining table (D88)

- Commits `bdbc1f2` (migrations `0017` + `0018`).
- While reviewing the Supabase dashboard after 2B, noticed most tables were marked
  "UNRESTRICTED." Verified via `information_schema.role_table_grants`: **`anon`
  (unauthenticated, no login) held full `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`
  grants on `clients`, `nodes`, `node_versions`, `edges`, `organizations`, `profiles`,
  `org_memberships`, and the KB tables** — reachable directly via Supabase's REST API
  with the public anon key, completely bypassing every isolation mechanism built across
  Stage 1, 2A, and 2B. Live on staging, not theoretical.
- Fixed with `0017`: RLS enabled, **zero policies**, on all 10 tables — default-deny.
  Cheap (one line per table, no policy design), unlike the "RLS-everywhere" D44 rejected,
  because the app's real access always goes through the service-role client (bypasses RLS
  regardless) — nothing in the app changes.
- **Immediate regression, fixed in `0018`:** the `canvases`/`client_kb_jobs`/`generations`
  policies subquery `org_memberships` to find the caller's org; RLS is contagious across
  that subquery. With `org_memberships` locked to zero policies, the subquery returned
  nothing for everyone — silently denying all three tables, including same-org reads. The
  Generation Tray stopped rendering immediately after `0017`; caught live within minutes,
  not in a later review. Fixed with one narrow policy: self-read on `org_memberships`.
- **Audited before calling it done, not just patched and moved on:** grepped every
  browser-side Supabase query in the codebase (5 files) — confirmed all touch only
  `generations`/`client_kb_jobs`, both already correctly policied, nothing else breaks.
  Confirmed via a full `pg_policies` dump that no other existing policy has a similar
  hidden cross-table dependency.
- Recorded as **D88** — supersedes the "app-layer only, no RLS" half of D44 for these 10
  tables specifically (D44's *reasoning* about avoiding per-org policy-writing still
  holds; what changed is that "no RLS at all" turned out to mean "world-writable," not
  "merely unreached," once actually checked).
- `npm test`: 523/523 passing. `npm run build`: clean. Generation Tray confirmed working
  again post-fix.

## 2C completion log (2026-07-23, staging) — closes Stage 2

- Commits `12d018a` (webhook auth), `0c339d5` (D79 tenant check).
- **Task 1 — the bigger finding, sequenced first:** `/api/webhooks/generation` had zero
  authentication — confirmed while scoping D79, distinct from and larger than D79 itself.
  Fixed with the same `TRIGGER_WEBHOOK_SECRET` `kb-build`'s webhook already used
  correctly: header-based for the internal Trigger.dev path, URL-embedded `token` for
  Kling (external provider, header support not guaranteed). Extracted into a shared
  `isAuthorizedWebhook()` helper, used by both webhooks now. Recorded as **D89**.
  Verified live: unauthenticated POST → 401 before any DB lookup; a real mock-mode video
  generation completes end-to-end with the new header.
- **Unplanned but necessary detour to get there:** testing the internal webhook path
  required running the Trigger.dev CLI locally against staging, which surfaced that
  `trigger.config.ts` hardcoded **production's** project ref regardless of which
  environment was active — this account is on Trigger.dev's free tier, which doesn't
  support multiple environments within one project, so staging and production are
  genuinely separate Trigger.dev projects. Fixed to read `TRIGGER_PROJECT_ID` from env,
  loading `.env` itself via Node's built-in `loadEnvFile()` (no new dependency) since the
  Trigger CLI's own config loader doesn't inject `.env` before evaluating the config file.
- **Task 2 — the originally-planned D79 check:** both webhooks now re-validate the job's
  recorded `org_id` against its resource's current org before processing; a mismatch is
  logged and dropped, not processed. `kb-build`'s webhook fetches the job once and reuses
  it for both the check and the existing `succeeded`-branch logic, rather than querying
  twice. Framed honestly in the plan as defense-in-depth for something that shouldn't be
  reachable today (nothing in this app moves a client between orgs), not sold as closing
  an active exploit — that distinction belongs to Task 1.
- `npm test`: 523/523 passing throughout. `npm run build`: clean throughout. Manual
  verification: a real mock-mode video generation and a real KB build both completed
  normally on staging with the new checks in place — no false positives on the only case
  that happens today (same org throughout).

**Stage 2 (2A, 2B, 2C) is now fully shipped to staging.** Next per the rollout plan:
Stage 3 (credit ledger), whenever that work starts.

## Definition of done for Stage 2 (all three sub-plans)

Per the rollout plan's Stage 2 checklist, expanded for 2A's addition: a hand-crafted
cross-org request — via any node route, any canvas route, or a direct Realtime
subscription — cannot read or mutate another org's data, even bypassing the app layer where
possible (RLS). Async workers drop jobs whose target resource's org has drifted. No
regression to existing Yuvabe workflows.
