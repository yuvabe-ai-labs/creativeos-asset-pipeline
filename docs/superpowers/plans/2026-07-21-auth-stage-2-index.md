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
| **2A** | `withNode()` helper + wire all 13 node-rooted routes through it | **Urgent — real, currently-open gap** | `2026-07-21-auth-stage-2a-node-isolation-fix.md` | ✍️ **written — awaiting review/execution** |
| **2B** | `org_id` + RLS on `generations`, `client_kb_jobs`, `canvases` (corrected from the original spec's 5-table list — `node_files` doesn't exist as a DB table, see note below) | Hardening, no urgency | _written after 2A_ | ⏳ not written |
| **2C** | Async worker tenant check: generation + kb-build webhooks re-validate `org_id` before processing | Hardening, no urgency | _written after 2B_ | ⏳ not written |

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

## Definition of done for Stage 2 (all three sub-plans)

Per the rollout plan's Stage 2 checklist, expanded for 2A's addition: a hand-crafted
cross-org request — via any node route, any canvas route, or a direct Realtime
subscription — cannot read or mutate another org's data, even bypassing the app layer where
possible (RLS). Async workers drop jobs whose target resource's org has drifted. No
regression to existing Yuvabe workflows.
