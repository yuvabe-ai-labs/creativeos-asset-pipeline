---
name: database-schema
description: >
  The CreativeOS database: which table holds what, and the rules for changing it. Load this
  before adding or changing a table, column, index, constraint, view, RLS policy, trigger, SQL
  function/RPC or migration under supabase/migrations/, and when you need to know which table or
  column holds something (or whether one already exists). Do not load it for ordinary UI, API
  route or query work that only reads or writes existing columns.
---

# Database schema: read before you change it

## 1. Know what exists

1. Read the relevant section of `docs/database-schema.md` (the map of every table, view and
   function after all migrations).
2. Open the migrations it cites for the tables you touch. Later migrations alter earlier ones;
   the newest definition wins.
3. Grep `src/lib/db/` for the table to see how the code reads and writes it.

## 2. Prefer no new table

Before adding a table, write down the answer in the ADR and the PR:

- Can it be a **column** on an existing table?
- Can an **existing table** hold it (a new `kind`/`status` value, a jsonb field already meant for it)?
- Can it be **derived on read** (a query, a view, a SQL function)?

Add a table only for a genuinely new entity, a many-to-many relation, or rows with their own
lifecycle (created, changed and ended on their own). Not for counters, flags, settings or logs
that an existing row or `impersonation_audit_log` can hold.

- **Worked example, no table:** the 50-a-day invite limit (0063) is two columns on
  `organizations` (`invite_window_start`, `invite_window_count`) and one atomic update in
  `take_invite_send`. An `invite_sends` log table was rejected: the question is "how many today",
  one row answers it, and per-send history already lives in the audit log.
- **Justified tables:** `membership_clients` (0062) is a many-to-many between a membership and a
  client, with its own permissions per pair. `org_invitations` (0062) rows have their own
  lifecycle (sent, resent, accepted, revoked, expired) and exist before any user does.

## 3. Table rules

- `uuid` primary key, `default gen_random_uuid()` (composite PK only for pure join tables).
- `org_id uuid not null references organizations(id)` on every tenant table.
- Composite FKs `(x_id, org_id) references x (id, org_id)` where a row links two tenant rows, so
  nothing can point across agencies (see `membership_clients`, `org_invitations`; target needs a
  `unique (id, org_id)`).
- Index every foreign key and every column used in a frequent `where`, join or sort
  (performance rule 9). Partial unique indexes for "one open/live row" rules.
- `alter table … enable row level security` on every new table. Default deny: no policies, the
  server reaches it through the service role. Add a policy only when the browser truly needs the
  rows (Realtime), and then `using (org_id in (select auth_org_ids()))`, never `limit 1`.
- Views: `alter view … set (security_invoker = true)` and `revoke all … from anon, authenticated`
  (0063: plain public views were readable with the anon key across agencies).
- `security definer` functions: `set search_path = public`, `revoke all on function … from public,
  anon, authenticated`, `grant execute … to service_role`.
- Migrations: idempotent (`if not exists`, `create or replace`, `drop … if exists`, guarded `do $$`
  blocks), numbered next in sequence (`ls supabase/migrations`), end with
  `notify pgrst, 'reload schema';` when functions or columns change.
- Never edit a migration that has been applied anywhere. 0062 was rewritten in place only because
  it had never been applied; ask the user before assuming that.
- In code: select only the columns used; never trust ids from the client, check the caller may
  access every one (performance rules 8 and 14).

## 4. Process

- Never run SQL, connect to a database or apply a migration. The user applies them.
- In the same change as the migration:
  - update `docs/database-schema.md` (bump "up to NNNN"; `src/lib/db/schema-map.test.ts` fails
    if a table or view has no heading);
  - add the migration's section to `docs/auth-production-migration.md` (apply order, verify
    queries, rollback);
  - record the decision in the ADR log in place
    (`docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7);
  - add a migration text test that pins what the code depends on, like
    `src/lib/permissions/migration-0062.test.ts`.
