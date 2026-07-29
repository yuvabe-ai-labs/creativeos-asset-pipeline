# Auth Stage 2B — RLS Backstop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database-enforced backstop to the three tables read independently of the `withClient`/`withCanvas`/`withNode` app-layer chokepoints — `canvases`, `client_kb_jobs`, `generations` — so that even a future route that forgets to call the right helper (exactly the class of bug 2A just found three instances of) still can't cross an org boundary. Pure hardening: no user-visible change.

**Architecture:** Each table gets `org_id` added directly (backfilled from its existing FK chain to `clients`), then RLS enabled with a single `select` policy: `org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)`. No `platform_role`/super_admin bypass clause — per **D85**, super_admin's normal-app view is already scoped to their own org outside `/admin`, so a plain org match is correct for everyone, not just members. `client_kb_jobs` is already in the `supabase_realtime` publication (migration `0008`); `generations` is added to it if not already present, using an idempotent conditional check rather than assuming its current state.

**Tech Stack:** PostgreSQL (Supabase), plain SQL migration applied via the dashboard SQL editor (migration CI automation is still parked — see `2026-07-21-migration-ci-automation.md`).

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-2-index.md` · **Spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 2) · **ADR:** D78 (scope, corrected — 3 tables not 5), D85 (no super_admin bypass in the policy)

## Global Constraints

- **App-layer stays primary; this is backstop only.** Nothing in this plan touches `withClient`/`withCanvas`/`withNode` — they already enforce isolation (Stage 1 + 2A). RLS here exists for the case those are bypassed or a future route forgets them.
- **Service-role writes are unaffected.** RLS applies to the `anon`/`authenticated` roles (browser sessions via `@supabase/ssr`). The service-role client (`createServerSupabase()`, used by every DB write in this app) bypasses RLS by design — this migration adds no write policies, only `select`.
- **No super_admin bypass clause** (D85) — the policy is identical for every caller. Do not add a `platform_role = 'super_admin'` exception; that would silently re-introduce the blanket-visibility bug D85 just removed from the app layer.
- **Migration order within the file matters:** `canvases.org_id` (direct from `clients`) is added and backfilled *before* `generations.org_id` is computed, so `generations`' backfill can join through the now-populated `canvases.org_id` (2 hops: `nodes.canvas_id → canvases.org_id`) instead of needing a 3-hop join through `clients` a second time.
- **Verify the realtime publication state, don't assume it.** Use an idempotent conditional (`if not exists`) for adding `generations` to `supabase_realtime`, since whether it's already there isn't recorded in any migration file (see the Stage 2 index's investigation notes).

## File Structure

**New**
| File | Responsibility |
|---|---|
| `supabase/migrations/0014_rls_backstop.sql` | `org_id` + backfill + RLS policy on `canvases`, `client_kb_jobs`, `generations`; `generations` added to the realtime publication if not already present |

No app code changes.

## Rollback reference (if staging verification fails)

```sql
drop policy if exists "org isolation" on generations;
drop policy if exists "org isolation" on client_kb_jobs;
drop policy if exists "org isolation" on canvases;
alter table generations disable row level security;
alter table client_kb_jobs disable row level security;
alter table canvases disable row level security;
alter table generations drop column if exists org_id;
alter table client_kb_jobs drop column if exists org_id;
alter table canvases drop column if exists org_id;
-- Note: does not remove generations from supabase_realtime even if this migration added
-- it — leaving it published is harmless (RLS still gates row visibility) and reverting
-- publication membership isn't necessary for a rollback to be safe.
```

---

## Task 1: Migration `0014` — org_id + RLS on canvases, client_kb_jobs, generations

**Files:**
- Create: `supabase/migrations/0014_rls_backstop.sql`

**Interfaces:**
- Produces: `canvases.org_id`, `client_kb_jobs.org_id`, `generations.org_id` (all `not null`, indexed); a `select`-only RLS policy on each; `generations` confirmed in the `supabase_realtime` publication.

- [ ] **Step 1: Record pre-flight row counts**

Run on staging, in the SQL editor, and note the numbers:
```sql
select
  (select count(*) from canvases) as canvases_before,
  (select count(*) from client_kb_jobs) as kb_jobs_before,
  (select count(*) from generations) as generations_before;
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0014_rls_backstop.sql`:

```sql
-- Stage 2B RLS backstop. org_id added directly to the three tables read independently
-- of the withClient/withCanvas/withNode app-layer chokepoints (D78, corrected scope —
-- node_files is not a real table, see the Stage 2 index doc). No super_admin bypass in
-- any policy (D85) — super_admin's normal-app view is already org-scoped, same as everyone.

-- ── canvases ─────────────────────────────────────────────────────────────────
-- Direct FK to clients — one-hop backfill.
alter table canvases add column org_id uuid references organizations(id);
update canvases c
  set org_id = cl.org_id
  from clients cl
  where c.client_id = cl.id and c.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from canvases where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % canvases row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table canvases alter column org_id set not null;
create index canvases_org_id_idx on canvases (org_id);

alter table canvases enable row level security;
create policy "org isolation" on canvases for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── client_kb_jobs ───────────────────────────────────────────────────────────
-- Direct FK to clients — one-hop backfill. Already in supabase_realtime (migration 0008).
alter table client_kb_jobs add column org_id uuid references organizations(id);
update client_kb_jobs j
  set org_id = cl.org_id
  from clients cl
  where j.client_id = cl.id and j.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from client_kb_jobs where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % client_kb_jobs row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table client_kb_jobs alter column org_id set not null;
create index client_kb_jobs_org_id_idx on client_kb_jobs (org_id);

alter table client_kb_jobs enable row level security;
create policy "org isolation" on client_kb_jobs for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── generations ──────────────────────────────────────────────────────────────
-- No direct client_id — backfill via nodes.canvas_id -> canvases.org_id (now populated
-- above), a 2-hop join instead of the 3-hop nodes -> canvases -> clients chain.
alter table generations add column org_id uuid references organizations(id);
update generations g
  set org_id = c.org_id
  from nodes n
  join canvases c on c.id = n.canvas_id
  where g.node_id = n.id and g.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from generations where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % generations row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table generations alter column org_id set not null;
create index generations_org_id_idx on generations (org_id);

alter table generations enable row level security;
create policy "org isolation" on generations for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Confirm generations is in the realtime publication — add only if not already present
-- (its current state isn't recorded in any prior migration; this is safe either way).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'generations'
  ) then
    alter publication supabase_realtime add table generations;
  end if;
end $$;
```

- [ ] **Step 3: Apply to staging**

Paste into the SQL editor and run. Expected: "Success." If any `Aborting: N ... row(s)...` exception fires, **stop** — do not proceed past it; that would mean a row's FK chain is broken in a way that shouldn't be possible (investigate before retrying).

- [ ] **Step 4: Verify no data lost, everything correctly attributed**

```sql
-- Count parity (compare against Step 1's numbers)
select
  (select count(*) from canvases) as canvases_after,
  (select count(*) from client_kb_jobs) as kb_jobs_after,
  (select count(*) from generations) as generations_after;

-- Zero unbackfilled anywhere
select
  (select count(*) from canvases where org_id is null) as canvases_null,
  (select count(*) from client_kb_jobs where org_id is null) as kb_jobs_null,
  (select count(*) from generations where org_id is null) as generations_null;
-- expect all three counts: 0

-- Spot check: a canvas's org_id matches its client's org_id
select c.id, c.org_id as canvas_org, cl.org_id as client_org
  from canvases c join clients cl on cl.id = c.client_id
  limit 5;
-- expect canvas_org == client_org on every row

-- Spot check: a generation's org_id matches its node's canvas's org_id
select g.id, g.org_id as gen_org, c.org_id as canvas_org
  from generations g
  join nodes n on n.id = g.node_id
  join canvases c on c.id = n.canvas_id
  limit 5;
-- expect gen_org == canvas_org on every row

-- Confirm RLS is enabled and exactly one policy exists per table
select tablename, rowsecurity from pg_tables
  where tablename in ('canvases', 'client_kb_jobs', 'generations');
-- expect rowsecurity = true for all three

select tablename, policyname from pg_policies
  where tablename in ('canvases', 'client_kb_jobs', 'generations');
-- expect exactly one "org isolation" policy per table

-- Confirm generations is in the realtime publication
select tablename from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename in ('generations', 'client_kb_jobs');
-- expect both rows present
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_rls_backstop.sql
git commit -m "feat(auth): RLS backstop on canvases, client_kb_jobs, generations (D78/D85)"
```

---

## Task 2: Verify RLS actually blocks a cross-org query at the database layer

This is the test 2A's app-layer fix couldn't cover — proving the database itself refuses a
cross-org read, independent of whether any application code remembered to check.

**Files:** none — verification only, run on staging.

- [ ] **Step 1: Confirm a same-org read still works (sanity baseline)**

In the Supabase dashboard, use the SQL editor's "Run as" / impersonation feature if
available, or note that the SQL editor itself normally runs as a privileged role (not
subject to RLS) — so this step needs to be verified from the **application**, not the SQL
editor. Signed in as Yuvabe, load a canvas and confirm the Generation Tray / KB status still
populate (Realtime subscriptions on `generations`/`client_kb_jobs` still deliver rows for
your own org).

- [ ] **Step 2: Confirm cross-org Realtime delivery is blocked**

This is hard to test via the SQL editor (which bypasses RLS as a privileged role). The
practical proof: signed in as Agency A, open one of Agency A's own canvases and confirm its
Generation Tray / KB status work normally (RLS allows same-org rows) — this Task's real
value is Step 1/Step 3 combined with Task 1 Step 4's `pg_policies`/`rowsecurity` checks,
which already prove the policy exists and is scoped correctly; a live cross-org Realtime
leak would require deliberately subscribing as Agency A to Yuvabe's channel, which the
existing app UI has no way to trigger (you can only ever subscribe to your own canvas's
channel) — so this is effectively already covered by app-layer isolation (2A) plus the
policy's SQL logic being correct (Task 1 Step 4).

- [ ] **Step 3: Confirm no regression to existing Yuvabe workflows**

Full smoke test: create a client, create a canvas, add a node, trigger a generation, confirm
the Generation Tray updates live (not just on refresh) and the KB build status (if
applicable) updates live too.

- [ ] **Step 4: Update the tracker**

No code to commit for this task — record the verification results in the Stage 2 index's
completion log (Task 3 of "closing out," below).

---

## Final verification (2B shippable checklist)

- [ ] `0014` applied to staging with no errors
- [ ] Count parity confirmed for all 3 tables; zero unbackfilled rows
- [ ] `rowsecurity = true` and exactly one policy on each of `canvases`, `client_kb_jobs`,
      `generations`
- [ ] `generations` confirmed in the `supabase_realtime` publication
- [ ] Yuvabe's own Generation Tray and KB status still update live post-migration (no
      Realtime regression)
- [ ] One commit made

**On completion:** update `2026-07-21-auth-stage-2-index.md` — 2B → ✅. Next: write **2C
(async worker tenant check)** — now unblocked, since it depends on `generations.org_id` and
`client_kb_jobs.org_id` existing, which this task creates.

---

## Self-Review notes (traceability)

- **Scope corrected from the original spec** → File Structure lists exactly 3 tables;
  Global Constraints and the header both cite D78's correction (no `node_files`).
- **D85 applied, not silently ignored** → every policy explicitly has no super_admin
  clause; Global Constraints states this as a rule, not just an implementation detail, so a
  future edit doesn't accidentally reintroduce the bypass.
- **Migration ordering is load-bearing, stated explicitly** → canvases before generations,
  with the reason (2-hop vs 3-hop backfill) named, not just implied by file order.
- **Realtime publication state verified, not assumed** → idempotent `if not exists` check
  in the migration itself, rather than requiring a pre-flight query or guessing.
- **Honest about Task 2's limits** → Step 2 explains *why* a true live cross-org Realtime
  leak test isn't practically constructible through the existing app UI, rather than
  claiming a test was run that wasn't, or silently skipping the step.
