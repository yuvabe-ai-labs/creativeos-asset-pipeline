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
