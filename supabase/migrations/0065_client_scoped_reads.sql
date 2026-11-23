-- 0065: the browser's direct reads follow the client list, not just the agency (D550).
--
-- Eight tables let anyone in an agency read every row of that agency through the public API
-- ("org isolation": org_id in auth_org_ids()). The app's routes and pages already limit a member
-- to the clients they are on (spec §4), but a member, or someone still waiting for access, could
-- read other clients' canvases and brand kit jobs with their own sign-in. Found by the permission
-- tests of 17 November.
--
-- Now each of these reads needs the row's client to be one the person may see: every client of
-- an agency they own, or a client they are on once the owner has given access. Credit
-- transactions are the owner's only, like credits everywhere else (view_credits).
--
-- The browser still reads these tables for Realtime (brand kit progress, the generation tray,
-- version and moodboard updates), so the policies stay, scoped. Rows reached through a parent
-- (a version through its node and canvas) use small security definer lookups, because the parent
-- tables themselves are closed to the browser. Each lookup is a primary-key read.

-- Clients the caller may see.
create or replace function auth_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id
    from clients c
    join org_memberships m on m.org_id = c.org_id
   where m.user_id = auth.uid() and m.is_owner
  union
  select mc.client_id
    from membership_clients mc
    join org_memberships m on m.user_id = mc.user_id and m.org_id = mc.org_id
   where mc.user_id = auth.uid() and m.access_given_at is not null
$$;

-- The client a row belongs to, for rows that hold no client id themselves.
create or replace function node_client_id(p_node_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cv.client_id from nodes n join canvases cv on cv.id = n.canvas_id where n.id = p_node_id
$$;

create or replace function version_client_id(p_version_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cv.client_id
    from node_versions v
    join nodes n on n.id = v.node_id
    join canvases cv on cv.id = n.canvas_id
   where v.id = p_version_id
$$;

create or replace function decision_client_id(p_decision_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_client_id(d.version_id) from node_version_decisions d where d.id = p_decision_id
$$;

create or replace function moodboard_client_id(p_moodboard_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from moodboards where id = p_moodboard_id
$$;

-- A generation belongs to a node, an avatar or a script (at least one is set).
create or replace function generation_client_id(p_node_id uuid, p_avatar_id uuid, p_script_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select node_client_id(p_node_id) where p_node_id is not null),
    (select client_id from client_avatars where id = p_avatar_id),
    (select client_id from client_scripts where id = p_script_id)
  )
$$;

-- Used inside RLS policies, so the browser's role must be able to call them (as auth_org_ids,
-- 0062). They return ids only, and only for rows the caller's own memberships reach.
do $$
declare f text;
begin
  foreach f in array array[
    'auth_client_ids()',
    'node_client_id(uuid)',
    'version_client_id(uuid)',
    'decision_client_id(uuid)',
    'moodboard_client_id(uuid)',
    'generation_client_id(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- The agency check stays first: it is indexed and turns away other agencies before any lookup.
drop policy if exists "org isolation" on canvases;
create policy "org isolation" on canvases for select
  using (org_id in (select auth_org_ids()) and client_id in (select auth_client_ids()));

drop policy if exists "org isolation" on client_kb_jobs;
create policy "org isolation" on client_kb_jobs for select
  using (org_id in (select auth_org_ids()) and client_id in (select auth_client_ids()));

drop policy if exists "org isolation" on generations;
create policy "org isolation" on generations for select
  using (org_id in (select auth_org_ids())
         and generation_client_id(node_id, avatar_id, script_id) in (select auth_client_ids()));

drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select
  using (org_id in (select auth_org_ids()) and node_client_id(node_id) in (select auth_client_ids()));

drop policy if exists "org isolation" on node_version_decisions;
create policy "org isolation" on node_version_decisions for select
  using (org_id in (select auth_org_ids()) and version_client_id(version_id) in (select auth_client_ids()));

drop policy if exists "org isolation" on node_version_annotations;
create policy "org isolation" on node_version_annotations for select
  using (org_id in (select auth_org_ids()) and decision_client_id(decision_id) in (select auth_client_ids()));

drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select
  using (org_id in (select auth_org_ids()) and moodboard_client_id(moodboard_id) in (select auth_client_ids()));

-- Credits are the owner's (view_credits): the ledger is read only by an owner of the agency.
-- org_memberships' own policy lets a person read their own membership rows, so no definer needed.
drop policy if exists "org isolation" on credit_transactions;
create policy "org isolation" on credit_transactions for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = credit_transactions.org_id and m.is_owner
  ));

notify pgrst, 'reload schema';
