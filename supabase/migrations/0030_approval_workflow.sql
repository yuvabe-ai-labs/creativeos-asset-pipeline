-- D166/D167: the schema half of internal maker-checker approval.
--
-- Three things that look separable but are not:
--   1. org_id on node_versions — the approval action must verify a version belongs to
--      the caller's org before writing to it (tenancy, not just role).
--   2. An org-isolation SELECT policy — 0017 enabled RLS on node_versions with ZERO
--      policies (default-deny). Realtime delivers postgres_changes rows through RLS, so
--      without a policy a browser subscription receives NOTHING, silently. This is the
--      exact failure 0018 had to fix after 0017 killed the generation tray.
--   3. Real user references for maker and reviewer — R11.1/R11.2. `operator` and
--      `approved_by` stay as legacy text columns and are never written again; reads
--      prefer the uuid and fall back to the string (R11.4).

-- ── 1. org_id, mirroring 0014's treatment of `generations` ───────────────────
alter table node_versions add column org_id uuid references organizations(id);

-- 3-hop backfill: node -> canvas -> client -> org.
update node_versions v set org_id = cl.org_id
  from nodes n
  join canvases cv on cv.id = n.canvas_id
  join clients  cl on cl.id = cv.client_id
 where n.id = v.node_id
   and v.org_id is null;

-- Serves both the Realtime filter and the pending-count queries in M2.
create index if not exists node_versions_org_status_idx
  on node_versions (org_id, approval_status);

-- A TRIGGER, not an assignment inside insertVersion(): there are eleven insert call sites
-- today and more will be added. A path that forgets org_id produces a version invisible
-- to every count and every subscription — a bug that presents as "the queue is quietly
-- wrong", which is the worst possible failure for a feature whose value is being trusted.
create or replace function set_node_version_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from nodes n
      join canvases cv on cv.id = n.canvas_id
      join clients  cl on cl.id = cv.client_id
     where n.id = new.node_id;
  end if;
  return new;
end;
$$;

drop trigger if exists node_versions_set_org_id on node_versions;
create trigger node_versions_set_org_id
  before insert on node_versions
  for each row execute function set_node_version_org_id();

-- ── 2. RLS: required for Realtime delivery, and R2.4 wants it independently ───
-- Same shape and scope as 0014's policies: a member reads their own org's rows only.
-- R2.4: a designer may READ every approval state and note, including on other people's
-- work. Review is not secret; only setting a status is restricted.
drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Guarded add — the table's publication state isn't recorded in any prior migration,
-- so this must be safe to run either way (same guard style as 0014).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'node_versions'
  ) then
    alter publication supabase_realtime add table node_versions;
  end if;
end $$;

-- ── 3. Attribution (R11.1, R11.2) ────────────────────────────────────────────
-- on delete set null: deleting a user must not delete the work they made. Attribution
-- degrades to the legacy text column, or to "Unknown" (R11.4).
alter table node_versions
  add column operator_user_id    uuid references auth.users(id) on delete set null,
  add column approved_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists node_versions_operator_user_idx
  on node_versions (operator_user_id)
  where operator_user_id is not null;
