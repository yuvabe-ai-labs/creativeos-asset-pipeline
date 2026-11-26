-- Admin › Agencies (D590): for every agency, its owner's login email, how many people it has and
-- when it last ran anything, in one read for the whole list. Read-only; service role only.
-- Each value is a per-agency subquery, so each one is a primary-key or index lookup:
-- the owner through org_memberships_one_owner, people through the org_memberships org_id index, the last
-- run through generations (org_id, created_at) (0097), read backwards for its newest row.
create or replace function admin_agency_activity()
returns table (org_id uuid, owner_email text, member_count integer, last_run_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.id as org_id,
         (select u.email::text
            from org_memberships m
            join auth.users u on u.id = m.user_id
           where m.org_id = o.id and m.is_owner
           limit 1) as owner_email,
         (select count(*)::integer from org_memberships m where m.org_id = o.id) as member_count,
         (select max(g.created_at) from generations g where g.org_id = o.id) as last_run_at
    from organizations o;
$$;

revoke all on function admin_agency_activity() from public, anon, authenticated;
grant execute on function admin_agency_activity() to service_role;

notify pgrst, 'reload schema';
