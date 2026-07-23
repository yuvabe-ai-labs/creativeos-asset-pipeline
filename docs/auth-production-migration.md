# Auth — Production Migration & Data Backfill

**Status:** Reference for later — production has not been touched yet. Everything in this
doc has already been done successfully on **staging** (Stage 1A, 1D, and 2B); this is the
same procedure, replayed against the **production** Supabase project, whenever you're ready
to promote the auth work.

**Do this once**, before (or in the same window as) deploying the auth app code to
production — see the ordering note near the bottom, it matters, and it bit staging once
already (see Step 3's warning).

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

## What needs to move to production

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

- Onboarding real agencies into production — that happens through `/admin/orgs/new` once the
  app is live in production and you can log in as the bootstrapped super_admin, not via SQL.
- Migration CI automation — still parked (`2026-07-21-migration-ci-automation.md`). Until
  that's built, this doc's manual dashboard steps are the only way to apply migrations to
  production, same as staging.
- Stage 2C (async worker tenant check) and Stage 3/4 — not yet built as of this doc's last
  update; check `docs/superpowers/plans/2026-07-21-auth-stage-2-index.md` for current status
  before treating this list of 7 migrations as final.
