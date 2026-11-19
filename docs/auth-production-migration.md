# Auth — Production Migration & Data Backfill

**Status: DONE. Applied to production 2026-07-30.** All 25 migrations (`0012`-`0025`)
were applied in order, `staging` was merged into `main` (PR #55) and deployed, the
`credits_charged does not exist` gap (app code deployed before Stage 3 migrations landed —
see note below) was caught and closed live, `developer@yuvabe.com` was bootstrapped as the
first production `super_admin`, and Step 8's behavioral checks all fired as expected.
Everything below is now a historical record of how it was done, kept for the next time this
procedure needs replaying (a new environment, a rebuild, etc.) — not a pending TODO.

**Post-migration, same session:** the pre-existing production data (30 clients, 49 canvases,
23 KB jobs, 576 generations) was moved out of the `yuvabe` seed org into a new org, **"Digital
Marketing Team"** (slug `digital-marketing`, owner `design@yuvabe.com`) — the real org this
data actually belongs to. `yuvabe` is now an empty org; `developer@yuvabe.com` remains its
`super_admin`/owner with cross-org visibility via `/admin` (D85). This move updated `org_id`
on all four tables that carry it (`clients`, `canvases`, `client_kb_jobs`, `generations`) via
direct SQL, since **no UI/API for moving a client between orgs exists in the app** — org
creation only happens via the dialog on `/admin` (`NewOrgDialog` → `createOrgAction` →
`createOrgWithOwner`, `src/lib/db/organizations.ts:265-319`), which never touches `clients`.
If this need recurs, that gap is worth closing with a real feature rather than repeating raw
SQL. Historical `credit_transactions` rows were deliberately **not** moved (append-only
ledger — moving them would rewrite financial history); the new org starts with a clean
credit-usage history, `yuvabe`'s historical charts still cover the pre-move period correctly.

**One real gotcha hit during the migration, worth remembering for next time:** merging all of
`staging` into `main` in one shot deploys Stage 1 + 2 + 3 app code together, but this doc's
migrations are applied in the same staged order they shipped to staging. Between finishing
Step 6 (`0017`/`0018`) and starting Stage 3's migrations, the **already-deployed** app code
(which includes Stage 3's credit-system UI/API) 500'd with `column generations.credits_charged
does not exist` — because the DB was still only caught up to Stage 2. Fixed by immediately
applying `0019`-`0025`. If replaying this doc against a fresh environment where staging's
Stage 1/2/3 code all merges to main in one PR (as opposed to the original incremental
staging rollout), apply **all** migrations through `0025` before/with the app deploy, not
just Steps 1-6 — the app no longer has a version that only expects Stage 1/2's schema.

Also hit: after creating new objects (e.g. `stuck_reservations`), PostgREST's schema cache
didn't pick them up until an explicit `notify pgrst, 'reload schema';` (or dashboard Settings
→ API → "Reload schema cache") — a `PGRST205 Could not find the table` error on a table/view
that verifiably exists in `information_schema` means this, not a real migration failure.

---

**Original pre-migration reference material follows, unchanged, for historical context:**

---

## Do this check now, independent of when you actually migrate

This isn't part of the auth rollout — it's a pre-existing gap, and production may have had
it the whole time, unrelated to any of this session's work. Worth 30 seconds today rather
than waiting for a full production cutover.

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

If this returns rows for `anon` (unauthenticated — no login required) on tables like
`clients`, `nodes`, `node_versions`, `edges`, or anything else holding real data, that means
**anyone with the public anon key can currently read/write/delete that data directly via
Supabase's REST API**, independent of whatever app code is or isn't deployed. Found and
fixed on staging as **D88** (see Step 5 below) — if production shows the same grants, the
fix there is identical and can be applied on its own, today, without waiting for the rest of
this migration sequence.

---

## Stage 1 & 2 — auth foundation + RLS backstop

Seven migrations, applied **in order** (each depends on the previous one's schema):

| # | File | What it does |
|---|---|---|
| 1 | `0012_auth_multi_tenancy.sql` | Creates `organizations`, `profiles`, `org_memberships`, last-owner trigger, one-org-per-user index, seeds the Yuvabe org |
| 2 | `0013_clients_org_id.sql` | Data migration: `clients.org_id`, backfilled, locked `not null` |
| 3 | `0014_rls_backstop.sql` | `org_id` + RLS on `canvases`, `client_kb_jobs`, `generations` (org-scoped policy, no super_admin bypass — D85) |
| 4 | `0015_drop_anon_read_generations.sql` | Drops a pre-existing public-read policy on `generations` — **verify it exists in production first** (Step 4b), don't assume |
| 5 | `0016_generations_client_output.sql` | `generations.client_id` + `output_snapshot`, nullable, not backfilled |
| 6 | `0017_default_deny_rls.sql` | RLS, zero policies, on the 10 remaining tables (D88) |
| 7 | `0018_org_memberships_self_read.sql` | One narrow policy on `org_memberships` — without it, 0017 breaks the Generation Tray (see its own comment header for why) |

Plus one manual, non-SQL step: bootstrapping the first production super_admin (mirrors
`docs/auth-bootstrap.md`, but against production — do **not** reuse the staging test
credentials).

**Also required, same window: the app code, not just the DB.** Migrations 0014/0016 add
`not null`/new columns that the *old* pre-auth app code doesn't populate on insert — this
broke canvas creation, KB builds, and every generation type on staging the moment `0014`
alone was applied, before the matching app-code fix (commit `62877cf`) was deployed. Deploy
the app code containing that fix in the same window as these migrations, not before, not
days after. See the ordering note near the bottom.

---

## Step 1 — Apply migration 0012 to production

Supabase dashboard → **production** project → SQL editor → paste the full contents of
`supabase/migrations/0012_auth_multi_tenancy.sql` → Run.

Verify (run separately):

```sql
select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('organizations','profiles','org_memberships')
  order by table_name;
-- expect 3 rows

select indexname from pg_indexes
  where tablename = 'org_memberships'
    and indexname = 'org_memberships_one_org_per_user';
-- expect 1 row

select tgname from pg_trigger where tgname = 'org_memberships_last_owner';
-- expect 1 row

select slug, monthly_credit_limit from organizations where slug = 'yuvabe';
-- expect: yuvabe | null
```

## Step 2 — Migration 0013 (the clients data migration)

Record the pre-flight count first:
```sql
select count(*) as clients_before from clients;
```
**Write this number down** — production's real client count (staging had 28; production is
a different number).

Paste the full contents of `supabase/migrations/0013_clients_org_id.sql` into the SQL editor
and run.

Expected: "Success." If instead you see
`Aborting data migration: N client row(s) have no org_id after backfill` — **stop**, do not
proceed, and investigate before retrying (should be impossible with only one org existing at
migration time, same as it was on staging).

Verify:
```sql
select count(*) as unbackfilled from clients where org_id is null;
-- expect 0

select count(*) as clients_after,
       count(*) filter (where org_id = (select id from organizations where slug='yuvabe')) as under_yuvabe
  from clients;
-- expect clients_after == clients_before AND under_yuvabe == clients_after

select c.slug, count(cv.id) as canvases
  from clients c left join canvases cv on cv.client_id = c.id
  group by c.slug order by canvases desc limit 5;
-- sanity check: canvas counts per client look normal, nothing zeroed out
```

## Step 3 — Migration 0014 (RLS backstop on canvases/client_kb_jobs/generations)

Record pre-flight counts:
```sql
select
  (select count(*) from canvases) as canvases_before,
  (select count(*) from client_kb_jobs) as kb_jobs_before,
  (select count(*) from generations) as generations_before;
```

Paste `supabase/migrations/0014_rls_backstop.sql` and run.

Verify:
```sql
select
  (select count(*) from canvases) as canvases_after,
  (select count(*) from client_kb_jobs) as kb_jobs_after,
  (select count(*) from generations) as generations_after;
-- compare against pre-flight — must match exactly

select
  (select count(*) from canvases where org_id is null) as canvases_null,
  (select count(*) from client_kb_jobs where org_id is null) as kb_jobs_null,
  (select count(*) from generations where org_id is null) as generations_null;
-- expect all three 0

select tablename, rowsecurity from pg_tables
  where tablename in ('canvases', 'client_kb_jobs', 'generations');
-- expect rowsecurity = true for all three
```

> ⚠️ **Do not stop here without also deploying the matching app code.** The moment this
> migration locks `org_id` to `not null`, any *old* app code creating a canvas, KB job, or
> generation will fail immediately (not a cross-org bug — a plain "the app is broken for
> everyone" bug). This is exactly what happened on staging. Deploy commit `62877cf` (or
> later) in the same window.

## Step 4 — Migration 0015 (drop the stale public-read policy — verify first)

**Check whether production has the same leftover policy before assuming it does:**
```sql
select policyname, roles, qual from pg_policies where tablename = 'generations';
```
If you see a policy named `anon_read_generations` with `qual = true`, production has the
same pre-auth leftover staging did — apply `0015_drop_anon_read_generations.sql` to remove
it. If that policy isn't there, `0015`'s `drop policy if exists` is a safe no-op either way —
apply it regardless for consistency with the migration sequence.

Verify after:
```sql
select policyname, roles, qual from pg_policies where tablename = 'generations';
-- expect exactly one row: "org isolation"
```

## Step 5 — Migration 0016 (client_id + output_snapshot)

Paste `supabase/migrations/0016_generations_client_output.sql` and run. Nullable columns,
no backfill, no guard — nothing to verify beyond "Success," though you can confirm the
columns exist:
```sql
select column_name from information_schema.columns
  where table_name = 'generations' and column_name in ('client_id', 'output_snapshot');
-- expect 2 rows
```

## Step 6 — Migrations 0017 + 0018 (default-deny RLS on everything else)

**This is the fix for the exposure checked at the very top of this doc.** Apply both in
order — `0017` then `0018` — do not apply `0017` alone and stop, or the Generation Tray
(and any other `generations`/`canvases`/`client_kb_jobs` read) will silently break for
everyone, the same way it did on staging (see `0018`'s own file comment for the exact
mechanism).

Paste `supabase/migrations/0017_default_deny_rls.sql`, run, then immediately paste
`supabase/migrations/0018_org_memberships_self_read.sql`, run.

Verify:
```sql
select tablename, policyname, roles, qual from pg_policies order by tablename;
-- expect exactly 4 policies total: "org isolation" on canvases/client_kb_jobs/generations,
-- and "own membership" on org_memberships (user_id = auth.uid())

select tablename, rowsecurity from pg_tables
  where tablename in ('clients','nodes','node_versions','edges','organizations','profiles',
                       'org_memberships','client_brand_images','client_kb_documents',
                       'client_kb_versions');
-- expect rowsecurity = true on all 10
```

Then, from the actual application (not the SQL editor), confirm the Generation Tray and KB
status still update live for a real signed-in user — this is the one thing that broke on
staging and the SQL checks alone won't catch a regression here.

## Step 7 — Bootstrap the first production super_admin

Same two-part process as `docs/auth-bootstrap.md`, against **production**, with a **real**
Yuvabe operator email/password (not the staging test account):

1. Supabase dashboard → **production** project → Authentication → Add user → real operator
   email + password, **Auto Confirm User** on. Copy the new user's UUID.
2. SQL editor, with the real UUID substituted:
   ```sql
   update auth.users
     set raw_app_meta_data = raw_app_meta_data || '{"platform_role":"super_admin"}'::jsonb
     where id = '<USER_UUID>';

   insert into profiles (user_id, display_name)
     values ('<USER_UUID>', '<Operator Display Name>');

   insert into org_memberships (user_id, org_id, org_role)
     values ('<USER_UUID>', (select id from organizations where slug = 'yuvabe'), 'owner');
   ```
3. Verify:
   ```sql
   select u.email, u.raw_app_meta_data->>'platform_role' as platform_role,
          p.display_name, m.org_role
     from auth.users u
     join profiles p on p.user_id = u.id
     join org_memberships m on m.user_id = u.id
     where u.id = '<USER_UUID>';
   -- expect: email | super_admin | <name> | owner
   ```

## Step 8 — Behavioral checks (recommended, matches what staging confirmed)

```sql
-- last-owner delete blocked
delete from org_memberships
  where org_id = (select id from organizations where slug = 'yuvabe');
-- expect ERROR: Cannot remove the last owner of an organization

-- last-owner demote blocked
update org_memberships set org_role = 'designer'
  where org_id = (select id from organizations where slug = 'yuvabe');
-- expect ERROR: Cannot demote the last owner of an organization

-- one-org-per-user blocked (throwaway org, cleaned up after)
insert into organizations (name, slug) values ('Throwaway', 'throwaway-check');
insert into org_memberships (user_id, org_id, org_role)
  values ('<USER_UUID>', (select id from organizations where slug='throwaway-check'), 'owner');
-- expect ERROR: duplicate key value violates unique constraint "org_memberships_one_org_per_user"

delete from organizations where slug = 'throwaway-check';
```

---

## Stage 3 — Credit System (migrations 0019–0025)

Shipped to staging 2026-07-24 through 2026-07-26 (sub-plans 3A–3G, all complete — see
`docs/superpowers/plans/2026-07-24-credit-system-index.md`). Unlike Stage 1/2, none of these
lock an existing column to `not null`, so there's no mutual-breakage window — but the
**ordering is still one-directional**: apply these migrations before deploying app code that
calls `reserve_credits` or reads the new tables/views/functions, since that code will 500 on
a missing table/function otherwise. Old (pre-credit-system) app code is unaffected either way
— it never references these objects.

| # | File | What it does |
|---|---|---|
| 8 | `0019_credit_transactions.sql` | Renames `generations.credits_consumed` → `cost_usd` (was always raw USD, mislabeled); adds `generations.credits_charged` (nullable); creates the `credit_transactions` ledger table + RLS + `org_credit_usage` view; one-time ×1000 conversion of any existing `organizations.monthly_credit_limit` (USD → credits) |
| 9 | `0020_reserve_credits.sql` | `reserve_credits(p_org_id, p_generation_id, p_amount)` RPC — row-locked check-and-insert against the org's monthly cap |
| 10 | `0021_stuck_reservations.sql` | `stuck_reservations` view — anti-join for the reconciliation sweep (generations stuck `running`, or `failed` with a refund that itself failed) |
| 11 | `0022_credit_transactions_realtime.sql` | Adds `credit_transactions` to the `supabase_realtime` publication — powers the header's live "used this month" figure |
| 12 | `0023_org_credit_breakdowns.sql` | `org_monthly_credit_history`, `org_credit_breakdown_by_type`, `org_credit_breakdown_by_model` — parameterized functions for the admin usage trend chart |
| 13 | `0024_fix_monthly_history_zero_fill.sql` | Replaces `org_monthly_credit_history` — the 0023 version only returned months with at least one transaction; this zero-fills the full N-month series via `generate_series` + `LEFT JOIN` |
| 14 | `0025_credit_history_day_year.sql` | Adds `org_daily_credit_history` (trailing 30 days) and `org_yearly_credit_history` (trailing 5 years) — same zero-fill pattern as the fixed monthly one, for the admin chart's Day/Month/Year granularity switcher |

### Step 9 — Migration 0019 (ledger table + rename + one-time conversion)

Record the pre-flight state first:
```sql
select count(*) as generations_before from generations;
select slug, monthly_credit_limit from organizations order by slug;
-- write down monthly_credit_limit for every org — 0019 multiplies each non-null value by
-- 1000 in place (USD-typed values become credit-typed), and this is your only pre-flight
-- record of the old numbers
```

Paste `supabase/migrations/0019_credit_transactions.sql` and run.

Verify:
```sql
select column_name from information_schema.columns
  where table_name = 'generations' and column_name in ('cost_usd', 'credits_charged');
-- expect 2 rows (cost_usd is the renamed column, credits_charged is new)

select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'credit_transactions';
-- expect 1 row

select tablename, rowsecurity from pg_tables where tablename = 'credit_transactions';
-- expect rowsecurity = true

select policyname, roles, qual from pg_policies where tablename = 'credit_transactions';
-- expect exactly one row: "org isolation"

select slug, monthly_credit_limit from organizations order by slug;
-- compare against the pre-flight numbers — every non-null value should now be exactly 1000x
```

### Step 10 — Migrations 0020–0023 (RPC + views + realtime + breakdowns)

These are all additive (new functions/views, a publication membership change) — no
backfill, no lock, nothing to break. Paste and run each in order:
`0020_reserve_credits.sql`, `0021_stuck_reservations.sql`,
`0022_credit_transactions_realtime.sql`, `0023_org_credit_breakdowns.sql`.

Verify:
```sql
select routine_name from information_schema.routines
  where routine_schema = 'public'
    and routine_name in ('reserve_credits', 'org_monthly_credit_history',
                          'org_credit_breakdown_by_type', 'org_credit_breakdown_by_model');
-- expect 4 rows

select table_name from information_schema.views
  where table_schema = 'public' and table_name = 'stuck_reservations';
-- expect 1 row

select tablename from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'credit_transactions';
-- expect 1 row
```

### Step 11 — Migrations 0024 + 0025 (chart zero-fill + day/year granularity)

Paste and run in order: `0024_fix_monthly_history_zero_fill.sql`,
`0025_credit_history_day_year.sql`. Both just `create or replace` a function each — no data
to verify beyond confirming they exist:
```sql
select routine_name from information_schema.routines
  where routine_schema = 'public'
    and routine_name in ('org_monthly_credit_history', 'org_daily_credit_history',
                          'org_yearly_credit_history');
-- expect 3 rows
```

Then, from the actual application, confirm the admin org-detail page's usage trend chart
renders with the Day/Month/Year dropdown and the header shows a live credits-used figure —
same "SQL checks alone won't catch a UI regression" caveat as Step 6.

### Also required, same window as Stage 3's app code

`reconcile-stuck-generations.ts` (the 15-minute Trigger.dev scheduled task reading
`stuck_reservations`) needs to actually be registered/deployed on Trigger.dev's platform —
pushing the code to git does not by itself activate a scheduled task there. Verify it's live
in the Trigger.dev dashboard for the production project, not just present in the repo.

---

## Deployment ordering — read before doing this for real

**Apply Steps 1–6 and deploy the matching app code in the same maintenance window, not far
apart.** Two concrete reasons this bit staging, not just a formality:

1. Once `0013`/`0014` lock `org_id` to `not null` on `clients`/`canvases`/`client_kb_jobs`/
   `generations`, the **old** pre-auth app code doesn't set those columns on insert — every
   "create a new X" action breaks immediately for everyone, not just across orgs. Deploy
   commit `62877cf` (or later) in the same window as Step 3.
2. `0017` alone (without `0018` immediately after) breaks the Generation Tray for everyone,
   including same-org reads — the fix is in the very next migration, but there's a real
   window of breakage if you stop between them.

This doc covers the **database side only** — actually deploying the application code to
production (whatever that mechanism turns out to be; nothing CI/CD-related exists in this
repo yet) is a separate step this doc doesn't own.

## Not covered here (by design)

- Onboarding real agencies into production — that happens through the "New agency" dialog on
  `/admin` once the app is live in production and you can log in as the bootstrapped
  super_admin, not via SQL.
- Migration CI automation — still parked (`2026-07-21-migration-ci-automation.md`). Until
  that's built, this doc's manual dashboard steps are the only way to apply migrations to
  production, same as staging.
- Stage 4 (impersonation) — built on `feat/impersonation-stage4`, migration `0027_impersonation.sql`
  not yet applied to production. Before deploying Stage 4's app code: (1) apply
  `supabase/migrations/0027_impersonation.sql` via the Supabase dashboard SQL editor, same
  process as every other migration in this doc; (2) set `IMPERSONATION_COOKIE_SECRET` in
  production's environment (generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — a missing value
  fails closed, so this can technically be deployed without it, but impersonation will silently
  be unavailable until it's set).
- `0028_credit_transactions_generation_set_null.sql` — fixes a gap between `0007`
  (`generations.node_id` cascades on node delete) and `0019` (`credit_transactions.generation_id`
  added later with no `ON DELETE` action, defaulting to `RESTRICT`). In production today,
  deleting any node with a billed generation will hit the same `23503` foreign key violation
  seen in staging (autosave retries the delete forever). Apply before/with the next production
  migration sweep, same dashboard SQL editor process as every other migration in this doc — no
  app code depends on it, so it can go out on its own ahead of a full deploy.

## Migration 0030 — approval workflow (2026-08-21)

`supabase/migrations/0030_approval_workflow.sql`. Paste into the Supabase SQL editor → Run.
Same manual dashboard process as every other migration in this doc.

Adds to `node_versions`: `org_id` (backfilled 3-hop node→canvas→client→org, plus a
BEFORE INSERT trigger to keep it true), an `(org_id, approval_status)` index, an
`org isolation` SELECT policy, membership of the `supabase_realtime` publication, and the
`operator_user_id` / `approved_by_user_id` user references.

**Why the policy matters:** `0017` enabled RLS on `node_versions` with zero policies
(default-deny). Realtime delivers `postgres_changes` rows *through* RLS, so the internal
approval workflow's live updates would silently receive nothing without it — the same
failure mode `0018` had to fix for the Generation Tray. This is not a backstop; the feature
does not work without it.

**Why a trigger rather than filling `org_id` in `insertVersion()`:** there are eleven
insert call sites today and more will follow. A path that forgot the column would produce
versions invisible to every pending count and every subscription — a failure that presents
as "the queue is quietly wrong" rather than as an error.

**Safe to re-run.** `create policy` and `alter publication` are not idempotent on their own,
so both are guarded (`drop policy if exists`, and a `pg_publication_tables` existence check).

**Verify after running:**

```sql
-- expect 0 — every version should carry an org
select count(*) from node_versions where org_id is null;

-- expect 1 row
select policyname from pg_policies
 where tablename = 'node_versions' and policyname = 'org isolation';

-- expect 1 row
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'node_versions';
```

Application code that depends on this: `setVersionApprovalAction` (reads `org_id`, writes
`approved_by_user_id`) and every `insertVersion()` call site (writes `operator_user_id`).
Deploying that code before this migration produces `column ... does not exist` errors.

## Migration 0031 — review queue derivation (2026-08-21)

`supabase/migrations/0031_review_queue.sql`. Paste into the Supabase SQL editor → Run.
**Apply after 0030** — the view selects `node_versions.org_id` and `operator_user_id`,
both of which 0030 creates.

Adds the `review_queue_items` view (nodes joined to their ACTIVE version, assets only) and
`org_review_counts(p_org_id)`, which returns per-client and per-canvas pending counts in a
single call rather than one query per row (PRD §8's free-tier constraint — the client list
renders for every org member on every visit).

Both statements are `create or replace`, so this is safe to re-run.

**Verify after running:**

```sql
-- the view resolves; zero rows is correct on a quiet org
select count(*) from review_queue_items where approval_status = 'pending';

-- R5.5 as a query: the per-canvas rows must sum to the per-client totals
select client_id, sum(pending) from org_review_counts('<org-uuid>') group by client_id;
```

## Migration 0034 — `node_versions.updated_at` (2026-08-31)

`supabase/migrations/0034_node_versions_updated_at.sql`. Paste into the Supabase SQL editor → Run.

> **0032 and 0033 are not documented here.** They shipped to staging without an entry in this
> file. Confirm both have been applied to production before running 0034 — 0034 itself does not
> depend on them, but the app code being deployed alongside it does.

Adds one column: `updated_at timestamptz not null default now()`. The default backfills every
existing row to the run time, which is intended — nothing reads this as history.

It exists so restoring a version emits a Realtime event (D202). The active-version pointer lives
on `nodes`, but the on-canvas approval badge, the senior's queue counts and the maker's inbox all
subscribe to `node_versions`; `setActiveVersion` now bumps this column on the newly-active row so
those surfaces hear about a restore. `node_versions` is already in the `supabase_realtime`
publication (migration 0030), so there is nothing further to enable.

**Deploy ordering:** apply this BEFORE the app code. `setActiveVersion` writes the column on every
restore; without it, that write fails and restores stop emitting the event (the restore itself
still succeeds — the write is best-effort — so the symptom is silently stale badges, not an error).

**Verify after running:**

```sql
-- column exists, non-null on every row
select count(*) as rows, count(updated_at) as with_timestamp from node_versions;

-- after restoring a version in the UI, its row should show a fresh timestamp
select id, updated_at from node_versions
where node_id = '<node-uuid>' order by updated_at desc limit 3;
```

## Migration 0040 — `moodboard_items` Realtime (2026-09-21)

`supabase/migrations/0040_moodboard_items_realtime.sql`. Paste into the Supabase SQL editor → Run.
Same manual dashboard process as every other migration in this doc.

Adds to `moodboard_items`: `org_id` (backfilled 2-hop item→moodboard→client→org, plus a
BEFORE INSERT trigger to keep it true), an `org_id` index, an `org isolation` SELECT policy,
and membership of the `supabase_realtime` publication. This is what lets the Market board
hear the `archive-reference` task finish (D276).

**Why the policy matters:** `0026` enabled RLS on `moodboard_items` with zero policies
(default-deny). Realtime delivers `postgres_changes` rows *through* RLS, so the board's
subscription would silently receive nothing without it — the same failure `0018` fixed for
the Generation Tray and `0030` pre-empted for approvals. Writes still go through the
service role and are unaffected.

**Safe to re-run.** `add column if not exists`, `drop policy if exists`, `drop trigger if
exists`, and a `pg_publication_tables` existence check guard every non-idempotent statement.

**Ordering:** apply before deploying the app code. The app tolerates the migration landing
first (nothing reads `org_id` directly); it does not tolerate the reverse — the subscription
is silent until the policy and publication exist.

**Verify after running:**

```sql
-- expect 0 — every item should carry an org
select count(*) from moodboard_items where org_id is null;

-- expect 1 row
select policyname from pg_policies
 where tablename = 'moodboard_items' and policyname = 'org isolation';

-- expect 1 row
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'moodboard_items';
```

Application code that depends on this: `src/lib/realtime/org-market-updates.ts` (filters on
`org_id`) and `src/hooks/use-market-updates.ts`.

## Migration 0041 — `client_avatars` (2026-09-30)

`supabase/migrations/0041_client_avatars.sql`. Paste into the Supabase SQL editor → Run.
Same manual dashboard process as every other migration in this doc.

Creates `client_avatars` (D287, D288): one row per avatar, owned by a client, with its front
image and profile sheet as JSON that records each image's source. RLS is enabled with zero
policies (default-deny, as `0027`); the app reads and writes through the service role. The table
also records likeness consent (D289) — who confirmed and when — for an uploaded front image.

**Purely additive** — one new table, no existing table altered, no backfill.

**Not safe to re-run:** `create table` fails if the table exists. That failure is harmless.

**Ordering:** apply before deploying the app code. The Avatars page fails with
`relation "client_avatars" does not exist` until it lands.

**Verify after running:**

```sql
-- expect 1 row, rowsecurity = true
select relname, relrowsecurity from pg_class where relname = 'client_avatars';

-- expect 0 rows (no policies by design)
select policyname from pg_policies where tablename = 'client_avatars';

-- expect 2 rows
select column_name from information_schema.columns
where table_name = 'client_avatars' and column_name like 'likeness%';
```

## Migration 0042 — a generation can belong to an avatar (2026-09-30)

`supabase/migrations/0042_generations_avatar.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0041** (`client_avatars`).

Makes `generations.node_id` nullable, adds `avatar_id` (cascade) with an index, and adds a
check that every row has a node or an avatar (D291). This is what lets Avatar Studio images use
the existing credit ledger.

**Existing rows are untouched** — each already has a `node_id`, so the check passes.

**Safe to re-run.** `add column if not exists`, `create index if not exists`, and the constraint
is dropped before it is added.

**Ordering:** apply before deploying the app code. Until it lands, generating in the Avatar
Studio fails with `null value in column "node_id"`.

**Verify after running:**

```sql
-- expect: is_nullable = YES
select is_nullable from information_schema.columns
where table_name = 'generations' and column_name = 'node_id';

-- expect 1 row
select conname from pg_constraint where conname = 'generations_owner_check';

-- expect 0 — no row is owned by nothing
select count(*) from generations where node_id is null and avatar_id is null;
```

## Migration 0043 — `client_voices` (2026-09-30)

`supabase/migrations/0043_client_voices.sql`. Paste into the Supabase SQL editor → Run.

Creates `client_voices` (D292): which ElevenLabs account voices belong to which client — one
row per voice cloned for the client or saved from the Voice Library for it. One ElevenLabs
account serves every client, so this is what keeps one client's clone out of another's picker.
RLS is enabled with zero policies (default-deny, as `0041`).

**Purely additive** — one new table, no existing table altered, no backfill. Voices already on
the ElevenLabs account (anything picked in Change voice before this, or cloned by hand) are not
recorded for any client and do not appear under "This client" in the Avatar Studio; Change voice
on Video Gen still lists the whole account and is unaffected.

**Not safe to re-run:** `create table` fails if the table exists. That failure is harmless.

**Ordering:** apply before deploying the app code. Until it lands, the Avatar Studio's voice
picker fails to load with `relation "client_voices" does not exist`.

**Verify after running:**

```sql
-- expect 1 row, rowsecurity = true
select relname, relrowsecurity from pg_class where relname = 'client_voices';

-- expect 1 row: the (client_id, elevenlabs_voice_id) uniqueness
select conname from pg_constraint
where conrelid = 'client_voices'::regclass and contype = 'u';
```

## Migration 0044 — `background_jobs` + Brand Images sources (2026-10-05)

`supabase/migrations/0044_background_jobs_and_brand_image_sources.sql`. Paste into the Supabase
SQL editor → Run.

Two parts:

- **`client_brand_images` gains six columns** (D303): `source` (`upload | website | instagram |
  facebook`, default `upload`), `media_type` (`image | video`, default `image`), `thumbnail_url`,
  `source_url`, `posted_at`, `source_ref`, plus a partial unique index on
  `(client_id, source_ref)`. Every existing row becomes `source = 'upload'`, `media_type = 'image'`
  through the defaults — which is what they are.
- **`background_jobs`** (D306): the generic lifecycle table for long-running jobs, first used by
  the brand asset import (D302). RLS enabled with zero policies (default-deny, as `0041`).

**Not safe to re-run:** `add column` / `create table` fail if they exist. That failure is harmless.

**Ordering:** apply **before** deploying the app code. The KB page and KB builds read
`client_brand_images.source`; until the column exists they fail with
`column client_brand_images.source does not exist`.

**Also required, same window:** `APIFY_TOKEN` must be set in the **Trigger.dev** production
environment (the `asset-import` task calls Apify directly), and the `asset-import` task must be
deployed with the rest of `trigger/`.

**Verify after running:**

```sql
-- expect 0 — every existing image is an upload
select count(*) from client_brand_images where source <> 'upload';

-- expect 2 rows: client_brand_images_source_ref_idx, background_jobs_one_live_idx
select indexname from pg_indexes
where indexname in ('client_brand_images_source_ref_idx', 'background_jobs_one_live_idx');

-- expect 1 row, rowsecurity = true; and 0 policies
select relname, relrowsecurity from pg_class where relname = 'background_jobs';
select policyname from pg_policies where tablename = 'background_jobs';
```

## Migration 0045 — `client_brand_images.sort_at` (2026-10-05)

`supabase/migrations/0045_brand_images_sort_at.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0044.**

Adds a stored generated column `sort_at = coalesce(posted_at, created_at)` and the partial index
`client_brand_images_imported_page_idx` the Brand assets grid pages on (keyset pagination, newest
post first). Existing rows fill themselves.

**Not safe to re-run:** `add column` fails if it exists. That failure is harmless.

**Ordering:** apply before deploying the app code. Until it lands, the Brand assets tab shows
"Couldn't load the brand assets" (`column client_brand_images.sort_at does not exist`).

**Verify after running:**

```sql
-- expect 0 — every row has a sort key
select count(*) from client_brand_images where sort_at is null;

-- expect 1 row
select indexname from pg_indexes where indexname = 'client_brand_images_imported_page_idx';
```

## Migration 0046 — `client_brand_images.width` / `height` (2026-10-05)

`supabase/migrations/0046_brand_images_dimensions.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0044.**

Adds nullable `width` and `height` (positive integers): each imported asset's displayed pixel size,
recorded at import so the Brand assets masonry knows every tile's aspect ratio before the image
loads. Existing rows stay null; the browser measures those.

**Not safe to re-run:** `add column` fails if it exists. That failure is harmless.

**Ordering:** apply **before** deploying the `asset-import` Trigger task. The task writes these
columns; until they exist **every imported asset fails to save** (the import reports them as
failed and the job still succeeds with 0 new).

**Verify after running:**

```sql
-- expect 2 rows
select column_name from information_schema.columns
where table_name = 'client_brand_images' and column_name in ('width', 'height');
```

## Migration 0048 — `client_brand_image_cards` + `set_kb_image_analysis` (2026-10-07)

`supabase/migrations/0048_brand_image_cards.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0044.**

Creates `client_brand_image_cards` (one card per brand image, cascades with the image and the client)
and the function `set_kb_image_analysis(p_version_id, p_value)`, which replaces only the
`image_analysis` section of a KB version's output (D312). RLS enabled with zero policies
(default-deny, as `0041`).

**Not safe to re-run:** `create table` fails if it exists (harmless); the function uses
`create or replace`.

**Ordering:** apply **before** deploying the app code and the `image-analysis` Trigger task. Until it
lands, image analysis runs fail ("The image analysis didn't finish") and the tab shows no result.

**Also required, same window:** `GOOGLE_GENAI_API_KEY` must be set in the **Trigger.dev** environment
(the `image-analysis` task calls Gemini), and the task must be deployed with the rest of `trigger/`.

**Verify after running:**

```sql
-- expect 1 row, rowsecurity = true; and 0 policies
select relname, relrowsecurity from pg_class where relname = 'client_brand_image_cards';
select policyname from pg_policies where tablename = 'client_brand_image_cards';

-- expect 1 row
select proname from pg_proc where proname = 'set_kb_image_analysis';
```

## Migration 0049 — image cards on two axes, format + purpose (2026-10-07)

`supabase/migrations/0049_brand_image_cards_two_axis.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0048.**

Renames `client_brand_image_cards.category` → `format`, adds `purpose`, and indexes both by client
(D314).

**Not safe to re-run:** the rename fails once applied (harmless).

**Ordering:** apply **before** deploying the app code and the `image-analysis` Trigger task: the new
code writes `format` and `purpose`, so every card save fails until it lands.

**Verify after running:**

```sql
-- expect 2 rows: format, purpose (and no category)
select column_name from information_schema.columns
where table_name = 'client_brand_image_cards' and column_name in ('category', 'format', 'purpose');
```

## Migration 0050 — KB writes that keep Image Analysis (2026-10-07)

`supabase/migrations/0050_kb_safe_writes.sql`. Paste into the Supabase SQL editor → Run.
**Depends on 0048.**

Adds two functions (D318): `save_kb_output_keep_image_analysis(p_version_id, p_output)` (the review
screen's Save: every section but Image Analysis) and `set_kb_field(p_version_id, p_path, p_value)`
(one field, for field re-analysis). Neither touches existing data.

**Safe to re-run:** both use `create or replace`.

**Ordering:** apply **before** deploying the app code: until it lands, saving the KB review screen
and re-analysing a single field fail.

**Verify after running:**

```sql
-- expect 2 rows
select proname from pg_proc where proname in ('save_kb_output_keep_image_analysis', 'set_kb_field');
```

## Migration 0055 — stuck-reservation sweep waits 50 minutes (2026-10-10)

`supabase/migrations/0055_stuck_reservations_threshold.sql`. Paste into the Supabase SQL editor → Run.

Moves the `stuck_reservations` view's threshold from 15 to 50 minutes, to follow the
`video-generate` task's `maxDuration` going from 600s to 2400s (Seedance and Kling poll for up to
30 minutes). No data changes.

**Safe to re-run:** `create or replace view`.

**Ordering:** apply **before or with** the deploy that raises `maxDuration` (both Trigger.dev and
the app). Deploying the new limit first leaves a window where the 15-minute sweep fails and refunds
jobs that are still running, and their finished videos are then dropped.

**Verify after running:**

```sql
-- expect the definition to contain '00:50:00'
select pg_get_viewdef('stuck_reservations');
```

## Async image generation (D366) — no migration, but deploy order and env matter (2026-10-13)

Image Gen and Composite now start a generation and return; the provider call runs in the new
`image-generate` Trigger.dev task, which reports back through the generation webhook. No schema
change.

**Ordering:**

1. **Fail old stuck image rows (pre-deploy, once).** An image row left `running` from before this
   deploy would otherwise show its node as generating and refuse new starts until it ages out.
   Run in the Supabase SQL editor:

   ```sql
   update generations
   set status = 'failed',
       error = 'The generation failed. Please try again.',
       updated_at = now()
   where type = 'image'
     and status = 'running'
     and created_at < now() - interval '1 hour';
   ```

   Any reservation still held by those rows is refunded by the `stuck_reservations` sweep as usual.
   **Safe to re-run.**

2. **Deploy the Trigger.dev tasks before the app**: `image-generate` (new) and `video-generate`
   (its retry rule changed), with the rest of `trigger/`. The app triggers `image-generate` by id; if
   the app ships first, every image start fails with "Couldn't start the generation."

3. **Set the image provider keys in both Trigger.dev projects' env** (staging and production), not
   only in Vercel: the provider calls now run inside the task. `OPENAI_API_KEY` (GPT Image),
   `GOOGLE_GENAI_API_KEY` (Gemini) and `BYTEPLUS_API_KEY` (Seedream), alongside the
   `APP_URL` and `TRIGGER_WEBHOOK_SECRET` the webhook already needs.

4. Then deploy the app.

**Verify after deploying:**

```sql
-- expect 0: no image row running for more than an hour
select count(*) from generations
where type = 'image' and status = 'running' and created_at < now() - interval '1 hour';
```

## Dubbing node (D374–D377) — no migration, but deploy order and env matter (2026-10-15)

New generation types `dub` and `lipsync` (`generations.type` is free text; no schema change) and
two Trigger.dev tasks, `video-dub` and `video-lip-sync`.

**Ordering:**

1. **Set the keys in both Trigger.dev projects' env** (staging and production) **and in Vercel**:
   `SARVAM_API_KEY`, `FAL_KEY`. The routes refuse with "Dubbing isn't set up yet." without them.
2. **Deploy the Trigger.dev tasks before the app** (`npm run deploy:trigger`). The app triggers
   `video-dub` / `video-lip-sync` by id; app first means every start fails and is refunded.
3. Then deploy the app.

**Verify after deploying:**

```sql
-- expect 0: no dub or lip sync running for more than 20 minutes (runs give up at 12)
select count(*) from generations
where type in ('dub', 'lipsync') and status = 'running' and created_at < now() - interval '20 minutes';
```

## Migrations 0059 + 0060 — Rough Cut Editor and Auto captions (D388–D401, 2026-10-22)

`supabase/migrations/0059_rough_cut_editor.sql` (the edit, media facts, the generation lock) and
`supabase/migrations/0060_media_transcripts.sql` (stored transcripts, one row per file). Paste each
into the Supabase SQL editor → Run, in order.

New generation type `transcribe` and job kind `editor-transcribe` (both free text; no schema change
beyond the new table). New Trigger.dev tasks: `editor-export` and `editor-transcribe`.

**Safe to re-run:** 0060 uses `create table if not exists`.

**Ordering:**

1. Apply 0059, then 0060.
2. **Set `ELEVEN_LABS_API_KEY` in both Trigger.dev projects' env** (staging and production) **and in
   Vercel**. The transcribe route refuses with "Captions aren't set up yet." without it.
3. **Deploy the Trigger.dev tasks before the app** (`npm run deploy:trigger`). The app triggers
   `editor-transcribe` by id; app first means every start fails and is refunded.
4. Then deploy the app.

**Verify after running:**

```sql
-- expect the table to exist and RLS on
select relrowsecurity from pg_class where relname = 'media_transcripts';
-- expect 0: no captions run stuck for more than 20 minutes
select count(*) from generations
where type = 'transcribe' and status = 'running' and created_at < now() - interval '20 minutes';
```

## Migration 0062 — five permissions, one owner, client members (D500–D509, 2026-11-13)

`supabase/migrations/0062_permission_based_access.sql`. Never applied before 13 Nov 2026, so it
was rewritten in place; the 11 Nov presets version is not applied anywhere and never will be.
Paste into the Supabase SQL editor → Run.

What it adds:
- `org_memberships`: `is_owner` (one per agency, unique index `org_memberships_one_owner`),
  `permissions text[]` (only `generate, approve, share, delete, invite`), `access_given_at`
  (null = signed up, waiting for the owner), `invited_by`. There is no View or Edit permission.
- `membership_clients`: one row per client a person is on, with that client's permissions.
  Having the row is what lets the person see the client; an empty set means they can only look.
  A new row copies the person's agency set; the owner never has rows.
- `org_invitations`: member invites carry the client; the owner invite (`as_owner`) has none.
  The link's token is stored as issued (unique index), so Copy link shows the same link; single
  use, 7 days, server-only (RLS on, no policies). Resend replaces the token; Cancel revokes.
  One open invite per email per agency (unique index on `org_id, lower(email)`) and one open
  owner invite per agency. The app also refuses an email with an open invite in another agency
  (one agency per person). That lookup, by email across agencies, has no index: the table is
  small. An index on `lower(email)` where the invite is open can be added in a later migration.
- Triggers: `org_memberships_cascade_permissions` (an agency-level change reaches every client
  row as what was added and removed), `org_memberships_keep_owner` (deferred: an agency that has
  an owner always keeps one), `membership_clients_prepare` (no owner rows; copies the set).
- Functions (service role only): `get_membership_access`, `transfer_agency_owner`,
  `create_agency_with_owner_invite`, `accept_invitation`, `list_agency_people`,
  `find_user_by_email`; `auth_org_ids()` behind the eight "org isolation" policies.
- `nodes_keep_canvas` / `edges_keep_canvas`: a canvas save can't move another canvas's node or
  join nodes across canvases (a refused row fails the save with `check_violation`).
- `org_review_counts_for_types(uuid, text[])` (nothing calls it; 0063 drops it) and `admin_action`
  in the audit log's event types.

**Day one (runs once):** in each agency the earliest-joined `org_role = 'owner'` membership becomes
the owner. Everyone else gets Generate, Approve, Share and Delete, access given, and a row with
those four on every existing client, so nobody loses access. Nobody gets Invite (only Yuvabe adds
people today). The backfill is skipped if any membership already has access given, so a re-run
never hands waiting people those four.

**Before applying, list agencies with more than one owner** (the earliest stays owner; the others
become members with Generate, Approve, Share and Delete):

```sql
select o.name, count(*) as owners, array_agg(p.display_name order by m.joined_at) as by_join_date
  from org_memberships m
  join organizations o on o.id = m.org_id
  left join profiles p on p.user_id = m.user_id
 where m.org_role = 'owner'
 group by o.id, o.name
having count(*) > 1;
```

**`org_role` stays** and is unread by the new code. New code keeps it in step (`owner` for the
owner, `designer` for a member who joins; `transfer_agency_owner` sets the new owner to `owner`
and the previous one to `senior`) so 0012's `org_memberships_last_owner` trigger agrees. A later
migration drops `org_role` and that trigger once production runs the new code. Don't create
agencies, members or clients with the old code between applying 0062 and deploying the new code:
the old admin screens don't set `is_owner`, and a client the old code creates gets no
`membership_clients` rows, so only the owner sees it until people are added on its Members page.

**If 0062 was applied before commit `0e63955b`** (13 Nov 2026, the switch from six permissions to
five): that version stored `view` and `edit`, and its check constraints refuse `invite`. It must be
re-applied from the current file, which replaces the functions (`transfer_agency_owner`, the
cascade and the rest). Re-applying alone is not enough: both check constraints are guarded
(`if not exists`, `create table if not exists`) and the backfill is skipped once anyone has access
given, so the old constraints and the stored `view` and `edit` would stay. Run this first, then
re-apply the current file:

```sql
begin;
-- the cascade trigger also removes them from each person's client rows; the second update is a backstop
update org_memberships set permissions = array_remove(array_remove(permissions, 'view'), 'edit')
 where permissions && array['view','edit'];
update membership_clients set permissions = array_remove(array_remove(permissions, 'view'), 'edit')
 where permissions && array['view','edit'];
alter table org_memberships drop constraint org_memberships_permissions_known;
alter table membership_clients drop constraint membership_clients_permissions_known;
alter table membership_clients add constraint membership_clients_permissions_known
  check (permissions <@ array['generate','approve','share','delete','invite']::text[]);
commit;
-- re-applying 0062 then adds org_memberships_permissions_known back with the five.
-- expect 0 for both afterwards
select count(*) from org_memberships where permissions && array['view','edit'];
select count(*) from membership_clients where permissions && array['view','edit'];
```

**Ordering** (merging deploys on this repo: Vercel is git-integrated):

1. Run the multi-owner query above and note the result.
2. Apply 0062 (staging before any staging deploy of this branch, production before the merge to
   `main`).
3. Run the checks below.
4. Then deploy the code. Deployed before 0062, `get_membership_access` is missing and every
   signed-in request fails.

**Environment, each environment (Vercel), before the people screens are used (spec §6.7, §9):**

- `APP_URL`: the environment's public address. Invite links and every email's button use it.
  Without it an invite link is the path alone (`/invite/…`): it is shown to copy, works when
  opened on the same site, and is not emailed. The signed-up and access-ready emails are skipped.
  Invites and actions still succeed either way.
- `RESEND_API_KEY` and `EMAIL_FROM`, where `EMAIL_FROM` is an address on a sending domain verified
  in Resend (each environment's key must be allowed to send from it). Without either, nothing is
  emailed; invites are still created and the link is shown to copy. The verified domain is
  `creativeos.yuvabe.com` (Resend, verified 18 Nov 2026); the sender is
  `EMAIL_FROM="CreativeOS <noreply@creativeos.yuvabe.com>"`. Checked end to end on 18 Nov: an
  invite to Resend's test address `delivered@resend.dev` was sent and delivered.

**The invite page is outside the session check.** `src/proxy.ts` excludes `/invite/*`: the token is
the capability, and someone invited has no account yet. The proxy also sets an `x-pathname` header
(always overwritten) that the root layout reads to send a person waiting for access to
`/onboarding` from any page.

**Known limitation: Google Drive is one account for the whole platform.** The Drive picker returns
that account's read-only access token, and the Drive file, folder and import routes use the same
login. They need only Generate on any client, so anyone with Generate on one client, in any agency,
can open every file that account can see, including folders other agencies use (D501).

**Old admin screens are gone with this code:** no temporary passwords, no role select. A new agency
is "Add an agency" (name, owner email and monthly credit limit, Unlimited unless one is set); the
owner signs up from the emailed link. An agency with
no owner shows Resend while its owner invite is open, otherwise "Invite an owner". People are
managed on the agency page's People and Clients tabs; Make owner is only there. Every change made
from Admin is in the audit log as `admin_action`.

**Check by hand in the app on staging after deploying:**

1. Add an agency with an email you can read; open the link and sign up; you land on an empty client
   list as owner.
2. As that owner, create a client, open Members, invite someone new; sign up from that link in a
   private window; you see "You're being onboarded". Type another address (say `/clients`) or
   click any link: you stay on onboarding.
3. The owner gets the signed-up email (with "Give them permissions on the Team page."); the header
   shows Team 1. Give access with no permissions picked; the person gets the access-ready email,
   reloads and sees the client and its work, the canvas read-only, AI buttons disabled with the
   reason; Team shows them as "Can look".
4. Edit them on Team to Generate, Approve, Share, Delete and Invite: on their next request the
   canvas is editable and Generate works. Remove Generate again: their next request is refused;
   their buttons follow on focus.
5. With Invite, that person opens the client's Members page from the Members button: they see the
   list with no Remove, Resend, Cancel or Set permissions, and no Copy link on open invites. They
   invite someone new; that person signs up and waits (Signed up on Team). The owner and the
   inviter each get the signed-up email; only the owner's has the Team page line. The Members page
   of a client they are on without Invite, or not on, is the 404 page.
6. Resend an open invite twice within a minute: the second is refused with "That invite was just
   sent. Try again in a minute."; the first link stops working. Invite, from a second agency, an
   email that has an open invite in the first: refused with "This email already belongs to another
   agency."
7. In `impersonation_audit_log`, the agency's `admin_action` rows list each change from Admin.

```sql
-- expect the admin actions from step 1 and any Admin changes
select event_type, detail, occurred_at from impersonation_audit_log
 where target_org_id = '<agency>' and event_type = 'admin_action' order by occurred_at;
-- open invites past 7 days that were never used (the app refuses them; informational)
select count(*) from org_invitations where accepted_at is null and revoked_at is null and expires_at < now();
```

**Verify after running:**

```sql
-- expect one owner per agency that had one
select org_id, count(*) from org_memberships where is_owner group by org_id having count(*) <> 1;
-- expect 0: every non-owner has access given and exactly generate, approve, share, delete
select count(*) from org_memberships
 where not is_owner
   and (access_given_at is null or permissions <> array['generate','approve','share','delete']);
-- expect 0: every non-owner is on every client of their agency
select count(*) from org_memberships m join clients c on c.org_id = m.org_id
 where not m.is_owner
   and not exists (select 1 from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id and mc.client_id = c.id);
-- expect 0: no owner has client rows
select count(*) from membership_clients mc join org_memberships m using (user_id, org_id) where m.is_owner;
-- expect one row for a member, with a clients array
select * from get_membership_access('<a member user id>');
-- expect 0: no edge joins nodes on another canvas
select count(*) from edges e
  join nodes s on s.id = e.source_node_id
  join nodes t on t.id = e.target_node_id
 where s.canvas_id <> e.canvas_id or t.canvas_id <> e.canvas_id;
```

**Check by hand on staging (spec §11), in a transaction you roll back:**

```sql
begin;
-- cascade: remove generate at agency level; every client row of that person loses it
update org_memberships set permissions = array['approve','share','delete']
 where user_id = '<member>' and org_id = '<agency>';
select client_id, permissions from membership_clients where user_id = '<member>';
-- owner protection: refused with "The agency owner can't be removed." at commit
delete from org_memberships where org_id = '<agency>' and is_owner;
rollback;
```

## Migration 0063 — views off the public API, every invite send counted, foreign keys indexed (D501, D511, 2026-11-16)

`supabase/migrations/0063_close_views_and_count_resends.sql`. Apply after 0062, in the same window
(staging before the staging deploy of this branch, production before the merge to `main`). Safe to
re-run. Paste into the Supabase SQL editor → Run.

What it does:
- `review_queue_items`, `org_credit_usage` and `stuck_reservations` were plain views: anyone with
  the anon key from the browser bundle could read every agency's review queue (client and canvas
  names, outputs, notes), credit spend and stuck reservations, because a view runs with its
  owner's rights. Only the server reads them, with the service role (`src/lib/db/review.ts`,
  `src/lib/db/organizations.ts` `getOrgCreditUsage`, `trigger/reconcile-stuck-generations.ts`), so
  0063 revokes them from `anon` and `authenticated` and also sets `security_invoker`, so a later
  re-grant would read through the tables' own RLS. No read in the app changes.
- `org_review_counts(uuid)` (0031, the pending counts, called only by the server) is closed to
  `public`, `anon` and `authenticated` the same way. `org_review_counts_for_types` (0062, never
  called) is dropped.
- `organizations.invite_window_start` and `invite_window_count`: each agency's invite counter. No
  new table. `take_invite_send(p_org_id, p_limit)` (service role only) takes one send in a single
  update on the agency's row: it starts a new window when there is none or the last one began
  more than 24 hours ago, otherwise adds one while the count is under the limit, and answers false
  at the limit. The app calls it right before a new member invite, Admin's Invite an owner and every
  Resend, so Resend now counts (before, resending an invite didn't add to the count). Add an agency
  doesn't call it: the agency is new. The window is fixed (24 hours from its first send), not
  rolling. The one-a-minute Resend gap still reads the invite's own sent time. Counters start at 0,
  so every agency starts with a fresh window.
- Indexes for twelve foreign keys that had none: `background_jobs.org_id`,
  `node_version_decisions.org_id`, `canvas_reviews.canvas_id`, `script_panel_takes.client_id`,
  `script_panel_picks.take_id`, `script_reviews.client_id`, `script_review_comments.version_id`
  and `parent_id`, `client_script_messages.client_id`, `client_kb_jobs.version_id`,
  `nodes.active_version_id`, `editor_edits.org_id`. All small tables, so `create index` (not
  `concurrently`, which the SQL editor can't run in a transaction) takes a moment.

**Ordering:** apply 0063, then deploy the code. Deployed before 0063, `take_invite_send` is missing
and every invite and Resend fails with "Something went wrong". Applied before the code, nothing
breaks: the old code keeps counting invitation rows.

**Verify after running:**

```sql
-- expect security_invoker=true on all three
select relname, reloptions from pg_class
 where relname in ('review_queue_items', 'org_credit_usage', 'stuck_reservations');
-- expect no rows: anon and authenticated hold nothing on the views or org_review_counts
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('review_queue_items', 'org_credit_usage', 'stuck_reservations')
   and grantee in ('anon', 'authenticated');
select has_function_privilege('anon', 'org_review_counts(uuid)', 'execute');  -- expect false
-- expect 0: the function is gone
select count(*) from pg_proc where proname = 'org_review_counts_for_types';
-- expect false for both: the counter function is the service role's only
select has_function_privilege('anon', 'take_invite_send(uuid, int)', 'execute'),
       has_function_privilege('authenticated', 'take_invite_send(uuid, int)', 'execute');
-- expect 12 rows
select indexname from pg_indexes where indexname in (
  'background_jobs_org_id_idx', 'node_version_decisions_org_id_idx', 'canvas_reviews_canvas_id_idx',
  'script_panel_takes_client_id_idx', 'script_panel_picks_take_id_idx', 'script_reviews_client_id_idx',
  'script_review_comments_version_id_idx', 'script_review_comments_parent_id_idx',
  'client_script_messages_client_id_idx', 'client_kb_jobs_version_id_idx',
  'nodes_active_version_id_idx', 'editor_edits_org_id_idx');
```

**Check from outside, with the anon key** (from `NEXT_PUBLIC_SUPABASE_ANON_KEY`), for each view:

```sh
curl "<SUPABASE_URL>/rest/v1/review_queue_items?limit=1" -H "apikey: <anon key>"
curl "<SUPABASE_URL>/rest/v1/org_credit_usage?limit=1" -H "apikey: <anon key>"
curl "<SUPABASE_URL>/rest/v1/stuck_reservations?limit=1" -H "apikey: <anon key>"
```

Expect a 401 with `permission denied for view …` (code `42501`) or an empty `[]`. Rows coming back
means the revoke didn't apply. Then in the app: the client list's review counts, a canvas's review
drawer and badges, the review inbox and the header's credits still show as before.

**Check resends are counted, on staging,** with an agency you can test on:

```sql
-- note the count, Resend one open invite in the app (Team or a client's Members page), run again:
-- it goes up by one. A new invite adds one too.
select invite_window_start, invite_window_count from organizations where id = '<agency>';
```

A second Resend within a minute is refused with "That invite was just sent." and adds nothing (the
gap is checked before a send is taken). At 50 sends
in the window, both a new invite and a Resend are refused with "You've sent 50 invites today. Try
again tomorrow." To try that without sending 50 emails, in a transaction you roll back:

```sql
begin;
update organizations set invite_window_start = now(), invite_window_count = 50 where id = '<agency>';
select take_invite_send('<agency>', 50);  -- expect false
update organizations set invite_window_start = now() - interval '25 hours' where id = '<agency>';
select take_invite_send('<agency>', 50);  -- expect true: a new window, count 1
select invite_window_count from organizations where id = '<agency>';  -- expect 1
rollback;
```


## Migration 0064 — node-files uploads and deletes for the service role only (2026-11-16)

Apply after 0063 (any order with the code: nothing in the app writes to this bucket).

- The `node-files` storage bucket (0004) had insert and delete policies on `storage.objects` that
  checked only the bucket, with no role, so the anon key could upload files into it or delete
  files from it. Nothing in the app writes to that bucket any more (uploads go to Google Cloud
  Storage through `src/lib/storage/`); the only call left is the server deleting an old
  supabase.co file in `removeObject`, with the service role, which isn't affected by policies.
  0064 drops both policies and adds none, so only the service role can write. `Public read
  node-files` and the bucket's public setting stay as they were: old rows can still show files by
  their public URL.

It is its own migration so that, if this project refuses `drop policy` on `storage.objects`
("must be owner of table objects"), 0063 is unaffected. In that case delete the two policies by
hand: Supabase dashboard → Storage → Policies → `node-files` → delete "Authenticated insert
node-files" and "Authenticated delete node-files".

**Verify after running:**

```sql
-- expect one row, "Public read node-files" (SELECT): the insert and delete policies are gone
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like '%node-files%';
```

**Check node-files from outside, with the anon key:**

```sh
curl -X POST "<SUPABASE_URL>/storage/v1/object/node-files/test.txt" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" --data "x"
```

Expect a 400 or 403 (`new row violates row-level security policy`). A 200 means the insert policy
is still there; if it does go through, delete `test.txt` in the dashboard. Then in the app, open a
canvas with File nodes and images made before the move to Google Cloud Storage (if there are any):
they still display.

## Two migrations numbered 0062 (2026-11-18)

Staging's `0062_client_review_versions.sql` (client review versions, D495–D499) and this branch's
`0062_permission_based_access.sql` were written at the same time and share the number. They touch
different tables, so either can run first, and both are already applied on the development
database. Neither is renamed, because both have been applied. On production, run both before 0063.

## Migration 0065 — the browser's direct reads follow the client list (D512, 2026-11-18)

Apply after 0064, in any order with the code: the app reads these tables through the service role,
which policies don't affect, and the browser only uses them for Realtime.

- Eight tables could be read by anyone in an agency through the public API with their own sign-in
  (`org isolation` checked only the agency). The permission tests of 17 November showed a member,
  and someone still waiting for access, reading the canvases and brand kit jobs of a client they
  are not on.
- `auth_client_ids()` lists the clients a person may see: every client of an agency they own, and
  the clients they are on once the owner has given access. `canvases`, `client_kb_jobs`,
  `generations`, `node_versions`, `node_version_decisions`, `node_version_annotations` and
  `moodboard_items` now need the row's client in that list, besides the agency. Rows without a
  client id find it through small definer lookups (`node_client_id` and the like), each a
  primary-key read.
- `credit_transactions` is readable by the agency's owner only (credits are owner-only in the app).
- No tables, no columns, no data changes.

**Verify after running:**

```sql
-- expect 8 rows; each qual mentions auth_client_ids except credit_transactions (is_owner)
select tablename, qual from pg_policies
 where schemaname = 'public' and policyname = 'org isolation'
 order by tablename;

-- expect 6 rows, all security definer
select proname, prosecdef from pg_proc
 where proname in ('auth_client_ids', 'node_client_id', 'version_client_id',
                   'decision_client_id', 'moodboard_client_id', 'generation_client_id');
```

**Check in the app:** as an owner, open a canvas and run a generation: the version appears without a
reload (Realtime on `node_versions` and `generations`), and the profile menu's credits update. As a
member on one client, start a brand kit build there: its progress still updates. The permission
tests' "Round the app" set (`node bypass.mjs` in the test folder) should now pass every case.

**Rollback** (puts back the agency-only reads of 0062):

```sql
do $$
declare t text;
begin
  foreach t in array array['canvases', 'client_kb_jobs', 'generations', 'node_versions',
    'node_version_decisions', 'node_version_annotations', 'moodboard_items', 'credit_transactions'] loop
    execute format('drop policy if exists "org isolation" on %I', t);
    execute format('create policy "org isolation" on %I for select using (org_id in (select auth_org_ids()))', t);
  end loop;
end $$;
drop function if exists generation_client_id(uuid, uuid, uuid);
drop function if exists decision_client_id(uuid);
drop function if exists version_client_id(uuid);
drop function if exists moodboard_client_id(uuid);
drop function if exists node_client_id(uuid);
drop function if exists auth_client_ids();
notify pgrst, 'reload schema';
```

## Migration 0066 — billing_payments (D514, 2026-11-19)

Apply after 0065, in any order with the code: nothing reads the table until the test page is on.

- Adds the `billing_payments` table (one row per Razorpay order; owners of the agency can read their
  own rows, only the server writes) and the `record_razorpay_payment` function, which the Razorpay
  webhook calls to mark an order paid and add its credits once.
- Safe to apply: a new table and a new function only. No existing table, column or row changes.
- It can go to production even though the test page stays off there (`RAZORPAY_TEST_PAGE` is set
  only on a developer's machine and the dev deployment): with no orders, the table stays empty.

**Verify after running:**

```sql
-- expect one row: billing_payments, RLS on
select relname, relrowsecurity from pg_class where relname = 'billing_payments';

-- expect one row, security definer
select proname, prosecdef from pg_proc where proname = 'record_razorpay_payment';
```

**Rollback:**

```sql
drop function if exists record_razorpay_payment(text, text);
drop table if exists billing_payments;
notify pgrst, 'reload schema';
```

Dropping the table and function leaves any `adjustment` rows already written in `credit_transactions`, so the credits stay granted. To remove them too, run this for the affected org(s):

```sql
delete from credit_transactions
where type = 'adjustment' and generation_id is null and org_id = '<org id>';
```
