-- D538–D547: five permissions on the person (generate, approve, share, delete, invite), copied
-- onto each client they are on; having a client's row is what lets a person see it, and an empty
-- set there means look only (view and edit are actions in the code, not stored). One owner per
-- agency; invitations sent from inside a client. This file was never applied anywhere before
-- 13 Nov 2026, so it was rewritten in place (the 11 Nov version, with presets, is at the local
-- tag perm-granular-v1).
-- Apply to an environment's database and verify it BEFORE the code that reads it is deployed
-- there (merging deploys on this repo). The old code keeps working on top of it: it reads
-- org_role, which stays until a later migration drops it. The new code without it fails every
-- signed-in request, because get_membership_access() is missing.

-- ── 1. Memberships: owner flag, agency-level permissions, access given ────────
alter table org_memberships
  add column if not exists is_owner        boolean not null default false,
  add column if not exists permissions     text[]  not null default '{}',
  add column if not exists access_given_at timestamptz,
  add column if not exists invited_by      uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_memberships_permissions_known') then
    alter table org_memberships add constraint org_memberships_permissions_known
      check (permissions <@ array['generate','approve','share','delete','invite']::text[]);
  end if;
end
$$;

-- One owner per agency (D538). Several owners later = drop this index; no check assumes one.
create unique index if not exists org_memberships_one_owner
  on org_memberships (org_id) where is_owner;
create index if not exists org_memberships_invited_by_idx on org_memberships (invited_by);
-- org_memberships_one_org_per_user (0012) stays: one agency per person in this version (D546).

-- ── 2. A person's clients, each with the effective permissions there ──────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_id_org_unique') then
    alter table clients add constraint clients_id_org_unique unique (id, org_id);
  end if;
end
$$;

create table if not exists membership_clients (
  user_id     uuid not null,
  org_id      uuid not null,
  client_id   uuid not null,
  permissions text[] not null default '{}'
              constraint membership_clients_permissions_known
              check (permissions <@ array['generate','approve','share','delete','invite']::text[]),
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (user_id, org_id, client_id),
  -- The composite keys stop a person being put on another agency's client.
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
create index if not exists membership_clients_client_idx on membership_clients (client_id);
create index if not exists membership_clients_added_by_idx on membership_clients (added_by);

-- ── 3. Invitations: sent from inside a client; only the owner's has none ─────
create table if not exists org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid,
  email       text not null,
  as_owner    boolean not null default false,
  -- The link's token as issued (32 random bytes, base64url), so Copy link always shows the same
  -- link. Server-only like the rest (RLS on, no policies); single use; 7 days.
  token       text not null,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade,
  constraint org_invitations_client_unless_owner check ((client_id is null) = as_owner)
);
create unique index if not exists org_invitations_token_key on org_invitations (token);
-- One open invite per person per agency, and one open owner invite per agency.
create unique index if not exists org_invitations_one_open_per_email
  on org_invitations (org_id, lower(email)) where accepted_at is null and revoked_at is null;
create unique index if not exists org_invitations_one_open_owner
  on org_invitations (org_id) where as_owner and accepted_at is null and revoked_at is null;
-- org_id first: the agency's list and the daily limit (50 sent a day) both read by it.
create index if not exists org_invitations_org_created_idx on org_invitations (org_id, created_at);
create index if not exists org_invitations_client_idx on org_invitations (client_id);
create index if not exists org_invitations_invited_by_idx on org_invitations (invited_by);

-- Default-deny like 0017: only the service-role server path reads or writes these.
alter table membership_clients enable row level security;
alter table org_invitations enable row level security;

-- ── 4. Triggers ───────────────────────────────────────────────────────────────
-- Cascade (spec §3.3): an agency-level change reaches every one of the person's client rows as
-- what was added and what was removed, in one update. A row-level difference (spec §8)
-- survives every change except one to the same permission.
create or replace function cascade_membership_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  added   text[];
  removed text[];
begin
  added   := array(select unnest(new.permissions) except select unnest(old.permissions));
  removed := array(select unnest(old.permissions) except select unnest(new.permissions));
  if cardinality(added) = 0 and cardinality(removed) = 0 then
    return new;
  end if;
  update membership_clients mc
     set permissions = array(
           select kept.p
             from ((select unnest(mc.permissions) as p except select unnest(removed))
                   union
                   select unnest(added)) kept
            order by array_position(array['generate','approve','share','delete','invite']::text[], kept.p))
   where mc.user_id = new.user_id and mc.org_id = new.org_id;
  return new;
end;
$$;

drop trigger if exists org_memberships_cascade_permissions on org_memberships;
create trigger org_memberships_cascade_permissions
  after update of permissions on org_memberships
  for each row
  when (old.permissions is distinct from new.permissions)
  execute function cascade_membership_permissions();

-- Owner protection (spec §3.3), checked at the end of the transaction so transfer_agency_owner
-- can demote and promote in one go. An agency has no owner until its invited owner signs up; the
-- rule applies from then. An agency being deleted takes its memberships with it.
create or replace function enforce_agency_keeps_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not old.is_owner then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.is_owner then
    return null;
  end if;
  if not exists (select 1 from organizations where id = old.org_id) then
    return null;
  end if;
  if exists (select 1 from org_memberships where org_id = old.org_id and is_owner) then
    return null;
  end if;
  raise exception 'The agency owner can''t be removed.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists org_memberships_keep_owner on org_memberships;
create constraint trigger org_memberships_keep_owner
  after update or delete on org_memberships
  deferrable initially deferred
  for each row execute function enforce_agency_keeps_owner();

-- 0012's org_memberships_last_owner (org_role based) stays until org_role is dropped. The code
-- that writes memberships keeps org_role in step: 'owner' for the owner, 'designer' for a member
-- who joins, and transfer_agency_owner swaps them.

-- A client row (spec §2.3): never for an owner (they have everything on every client already), and
-- it always starts as a copy of the person's agency-level set, whoever inserts it.
create or replace function prepare_membership_client()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m_is_owner    boolean;
  m_permissions text[];
begin
  select is_owner, permissions into m_is_owner, m_permissions
    from org_memberships where user_id = new.user_id and org_id = new.org_id;
  if not found then
    return new; -- the foreign key refuses it
  end if;
  if m_is_owner then
    raise exception 'The agency owner is on every client already.' using errcode = 'check_violation';
  end if;
  new.permissions := m_permissions;
  return new;
end;
$$;

drop trigger if exists membership_clients_prepare on membership_clients;
create trigger membership_clients_prepare
  before insert on membership_clients
  for each row execute function prepare_membership_client();

-- ── 5. One access read per request ────────────────────────────────────────────
drop function if exists get_membership_access(uuid);
create function get_membership_access(p_user_id uuid)
returns table (
  org_id uuid, org_name text, is_owner boolean, access_given_at timestamptz,
  permissions text[], clients jsonb
)
language sql stable security definer set search_path = public as $$
  select m.org_id, o.name, m.is_owner, m.access_given_at, m.permissions,
         coalesce((select jsonb_agg(jsonb_build_object('client_id', mc.client_id, 'permissions', mc.permissions))
                     from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '[]'::jsonb)
    from org_memberships m
    join organizations o on o.id = m.org_id
   where m.user_id = p_user_id;
$$;
revoke all on function get_membership_access(uuid) from public, anon, authenticated;
grant execute on function get_membership_access(uuid) to service_role;

-- ── 6. Owner, agency and invitation functions (spec §3.4, §6.3, §6.6) ─────────
-- The previous owner becomes a member with all five on every client; the new one is promoted and
-- loses their client rows (an owner has none). One transaction; the owner check runs at its end.
create or replace function transfer_agency_owner(p_org_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old uuid;
begin
  if not exists (select 1 from org_memberships where org_id = p_org_id and user_id = p_new_owner) then
    raise exception 'That person is not in this agency.' using errcode = 'no_data_found';
  end if;
  select user_id into v_old from org_memberships where org_id = p_org_id and is_owner;
  if v_old = p_new_owner then
    return;
  end if;
  -- org_role first, so 0012's last-owner trigger sees an owner throughout.
  update org_memberships set org_role = 'owner' where org_id = p_org_id and user_id = p_new_owner;
  if v_old is not null then
    update org_memberships
       set is_owner = false,
           org_role = 'senior',
           permissions = array['generate','approve','share','delete','invite'],
           access_given_at = coalesce(access_given_at, now())
     where org_id = p_org_id and user_id = v_old;
    insert into membership_clients (user_id, org_id, client_id)
    select v_old, p_org_id, c.id from clients c where c.org_id = p_org_id
    on conflict do nothing;
  end if;
  delete from membership_clients where org_id = p_org_id and user_id = p_new_owner;
  update org_memberships
     set is_owner = true, access_given_at = coalesce(access_given_at, now())
   where org_id = p_org_id and user_id = p_new_owner;
end;
$$;
revoke all on function transfer_agency_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function transfer_agency_owner(uuid, uuid) to service_role;

-- Add an agency (spec §6.6): the agency and its owner invitation together. The app makes the slug
-- (uniqueSlug) and the link's token.
create or replace function create_agency_with_owner_invite(
  p_name text, p_slug text, p_owner_email text, p_token text, p_by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into organizations (name, slug) values (p_name, p_slug) returning id into v_org;
  insert into org_invitations (org_id, email, as_owner, token, invited_by)
  values (v_org, lower(p_owner_email), true, p_token, p_by);
  return v_org;
end;
$$;
revoke all on function create_agency_with_owner_invite(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function create_agency_with_owner_invite(text, text, text, text, uuid) to service_role;

-- Accepting (spec §6.3) is single use: the invitation is marked accepted in the same transaction
-- that creates the profile, the membership and, for a member, the invited client's row (with no
-- permissions until the owner gives access; the cascade then fills it).
create or replace function accept_invitation(p_token text, p_user_id uuid, p_display_name text)
returns table (org_id uuid, client_id uuid, as_owner boolean, invited_by uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  inv org_invitations%rowtype;
begin
  update org_invitations i
     set accepted_at = now()
   where i.token = p_token
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  returning i.* into inv;
  if not found then
    raise exception 'This invite link is no longer valid.' using errcode = 'no_data_found';
  end if;
  insert into profiles (user_id, display_name) values (p_user_id, p_display_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
  insert into org_memberships (user_id, org_id, org_role, is_owner, access_given_at, invited_by)
  values (p_user_id, inv.org_id,
          case when inv.as_owner then 'owner' else 'designer' end,
          inv.as_owner,
          case when inv.as_owner then now() end,
          inv.invited_by);
  if not inv.as_owner then
    insert into membership_clients (user_id, org_id, client_id, added_by)
    values (p_user_id, inv.org_id, inv.client_id, inv.invited_by);
  end if;
  return query select inv.org_id, inv.client_id, inv.as_owner, inv.invited_by;
end;
$$;
revoke all on function accept_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function accept_invitation(text, uuid, text) to service_role;

-- The Team page and every Members list read this one call (spec §10): name, email (auth.users),
-- status, permissions, the client they were invited to and by whom, and their client ids.
create or replace function list_agency_people(p_org_id uuid)
returns table (
  user_id uuid, display_name text, email text, is_owner boolean, access_given_at timestamptz,
  permissions text[], joined_at timestamptz, invited_by_name text,
  invited_client_id uuid, invited_client_name text, client_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(p.display_name, 'Unknown'),
         u.email::text,
         m.is_owner,
         m.access_given_at,
         m.permissions,
         m.joined_at,
         ip.display_name,
         inv.client_id,
         ic.name,
         coalesce((select array_agg(mc.client_id order by mc.added_at)
                     from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '{}')
    from org_memberships m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.user_id = m.user_id
    left join profiles ip on ip.user_id = m.invited_by
    left join lateral (
      select i.client_id from org_invitations i
       where i.org_id = m.org_id and i.accepted_at is not null and lower(i.email) = lower(u.email)
       order by i.accepted_at desc
       limit 1
    ) inv on true
    left join clients ic on ic.id = inv.client_id
   where m.org_id = p_org_id
   order by m.is_owner desc, m.joined_at;
$$;
revoke all on function list_agency_people(uuid) from public, anon, authenticated;
grant execute on function list_agency_people(uuid) to service_role;

-- Before inviting (spec §6.2): does this email already have a login, and in which agency?
create or replace function find_user_by_email(p_email text)
returns table (user_id uuid, org_id uuid)
language sql stable security definer set search_path = public as $$
  select u.id, m.org_id
    from auth.users u
    left join org_memberships m on m.user_id = u.id
   where lower(u.email) = lower(p_email);
$$;
revoke all on function find_user_by_email(text) from public, anon, authenticated;
grant execute on function find_user_by_email(text) to service_role;

-- ── 7. Day one (spec §3.2): the earliest owner stays owner; everyone else keeps today's access ──
-- Every member gets Generate, Approve, Share and Delete and a row on every client of their agency,
-- so nobody loses what they can do today. Nobody gets Invite: only Yuvabe adds people today.
-- Runs once: only while no membership has access given yet. A re-run after people have signed up
-- and are waiting must never hand them those four.
do $$
begin
  if exists (select 1 from org_memberships where access_given_at is not null) then
    return;
  end if;

  update org_memberships m
     set is_owner = true
    from (select distinct on (org_id) org_id, user_id
            from org_memberships
           where org_role = 'owner'
           order by org_id, joined_at, user_id) first_owner
   where m.org_id = first_owner.org_id and m.user_id = first_owner.user_id;

  update org_memberships
     set permissions = array['generate','approve','share','delete'],
         access_given_at = now()
   where not is_owner;

  update org_memberships set access_given_at = now() where is_owner;

  insert into membership_clients (user_id, org_id, client_id)
  select m.user_id, m.org_id, c.id
    from org_memberships m
    join clients c on c.org_id = m.org_id
   where not m.is_owner
  on conflict do nothing;
end
$$;

-- ── 8. RLS ready for more than one agency per person (D546) ───────────────────
create or replace function auth_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from org_memberships where user_id = auth.uid()
$$;
revoke all on function auth_org_ids() from public, anon;
grant execute on function auth_org_ids() to authenticated, service_role;

drop policy if exists "org isolation" on canvases;
create policy "org isolation" on canvases for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on client_kb_jobs;
create policy "org isolation" on client_kb_jobs for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on generations;
create policy "org isolation" on generations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_annotations;
create policy "org isolation" on node_version_annotations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on credit_transactions;
create policy "org isolation" on credit_transactions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_decisions;
create policy "org isolation" on node_version_decisions for select using (org_id in (select auth_org_ids()));

-- ── 9. Nodes and edges stay on their own canvas ───────────────────────────────
-- Canvas saves upsert nodes and edges by the ids the browser sends. Ids are not secret, so
-- without these a save carrying another canvas's node id would move that node onto the caller's
-- canvas, and an edge from another canvas's node would feed its output into the caller's
-- generations. Checked in the database so a save pays no extra round trip; a refused row fails
-- the whole save.
create or replace function keep_node_on_its_canvas()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.canvas_id is distinct from old.canvas_id then
    raise exception 'A node cannot move to another canvas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists nodes_keep_canvas on nodes;
create trigger nodes_keep_canvas
  before update of canvas_id on nodes
  for each row execute function keep_node_on_its_canvas();

-- Definer: the endpoint check must see both nodes whatever the writer's row access.
create or replace function keep_edge_on_its_canvas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.canvas_id is distinct from old.canvas_id then
    raise exception 'An edge cannot move to another canvas' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from nodes where id = new.source_node_id and canvas_id = new.canvas_id)
     or not exists (select 1 from nodes where id = new.target_node_id and canvas_id = new.canvas_id) then
    raise exception 'An edge must join two nodes on its own canvas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists edges_keep_canvas on edges;
create trigger edges_keep_canvas
  before insert or update on edges
  for each row execute function keep_edge_on_its_canvas();

-- Pending review counts for some review types only. Same shape as 0031's org_review_counts,
-- grouped in SQL so no row cap undercounts.
create or replace function org_review_counts_for_types(p_org_id uuid, p_node_types text[])
returns table (client_id uuid, canvas_id uuid, pending int)
language sql
stable
as $$
  select client_id, canvas_id, count(*)::int
    from review_queue_items
   where org_id = p_org_id
     and approval_status = 'pending'
     and node_type = any(p_node_types)
   group by client_id, canvas_id;
$$;

-- ── 10. The audit log records changes made from Admin (spec §6.6) ─────────────
alter table impersonation_audit_log drop constraint if exists impersonation_audit_log_event_type_check;
alter table impersonation_audit_log add constraint impersonation_audit_log_event_type_check
  check (event_type in ('session_started', 'elevated_mode_entered', 'write_action', 'session_ended', 'admin_action'));

notify pgrst, 'reload schema';
