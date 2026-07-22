# Auth — Production Migration & Data Backfill

**Status:** Reference for later — production has not been touched yet. Everything in this
doc has already been done successfully on **staging** (Stage 1A); this is the same
procedure, replayed against the **production** Supabase project, whenever you're ready to
promote the auth work.

**Do this once**, before (or in the same window as) deploying the auth app code to
production — see the ordering note at the bottom, it matters.

---

## What needs to move to production

Only two SQL files — nothing else from Stage 1 touched the schema (1B/1C/1D were app-layer
only):

- `supabase/migrations/0012_auth_multi_tenancy.sql` — creates `organizations`, `profiles`,
  `org_memberships`, the last-owner trigger, the one-org-per-user unique index, seeds the
  Yuvabe org
- `supabase/migrations/0013_clients_org_id.sql` — the data migration: adds `clients.org_id`,
  backfills every existing production client to the Yuvabe org, guards against any row
  missing backfill, then locks the column `not null`

Plus one manual, non-SQL step: bootstrapping the first production super_admin (mirrors
`docs/auth-bootstrap.md`, but against production — do **not** reuse the staging test
credentials).

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

## Step 2 — Record the pre-flight client count

```sql
select count(*) as clients_before from clients;
```
**Write this number down** — production's real client count, whatever it is (staging had 28;
production is a different number). You'll compare against it after Step 3.

## Step 3 — Apply migration 0013 to production (the data migration)

Paste the full contents of `supabase/migrations/0013_clients_org_id.sql` into the SQL editor
and run.

Expected: "Success." If instead you see
`Aborting data migration: N client row(s) have no org_id after backfill` — **stop**, do not
proceed, and investigate before retrying (should be impossible with only one org existing at
migration time, same as it was on staging).

## Step 4 — Verify no data lost, everything under Yuvabe

```sql
select count(*) as unbackfilled from clients where org_id is null;
-- expect 0

select count(*) as clients_after,
       count(*) filter (where org_id = (select id from organizations where slug='yuvabe')) as under_yuvabe
  from clients;
-- expect clients_after == clients_before (Step 2) AND under_yuvabe == clients_after

select c.slug, count(cv.id) as canvases
  from clients c left join canvases cv on cv.client_id = c.id
  group by c.slug order by canvases desc limit 5;
-- sanity check: canvas counts per client look normal, nothing zeroed out
```

## Step 5 — Bootstrap the first production super_admin

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

## Step 6 — Behavioral checks (optional but recommended, matches what staging confirmed)

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

**Apply this migration and deploy the auth app code together, not far apart.** Here's why it
matters, not just as a formality: once `0013` locks `clients.org_id` to `not null`, the **old**
(pre-auth) app code's `createClient` — which never sets `org_id` — would fail on any attempt
to create a new client, because it doesn't know that column exists yet. Reads and edits of
*existing* clients are unaffected (the column only bites on insert), but "create a new client"
would break for whoever's running the old code in that gap.

In practice: do Steps 1–6 in the same maintenance window as deploying the branch with the
Stage 1 app code (or immediately before it), not as a standalone task days ahead of the code
deploy. This doc covers the **database side only** — actually deploying the application code
to production (whatever that mechanism turns out to be; nothing CI/CD-related exists in this
repo yet) is a separate step this doc doesn't own.

## Not covered here (by design)

- Onboarding real agencies into production — that happens through `/admin/orgs/new` once the
  app is live in production and you can log in as the bootstrapped super_admin, not via SQL.
- Migration CI automation — still parked (`2026-07-21-migration-ci-automation.md`). Until
  that's built, this doc's manual dashboard steps are the only way to apply migrations to
  production, same as staging.
