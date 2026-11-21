-- Who used what (spec 2026-11-21-usage-by-design.md, D524): an agency's charged AI runs in a period,
-- grouped by member, client or canvas, for the owner's Billing page. Read-only; service role only.

-- Every list and sum here filters an agency's runs by time.
create index if not exists generations_org_id_created_at_idx on generations (org_id, created_at);

-- Credits actually charged (credits_charged, written at settlement) per member, client or canvas.
-- Runs outside a canvas (avatars, scripts) have no canvas: their key is null.
create or replace function org_credit_usage_by(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_by text
) returns table (key uuid, credits numeric, runs integer)
language sql
stable
security definer
set search_path = public
as $$
  select case p_by
           when 'member' then g.user_id
           when 'client' then g.client_id
           else n.canvas_id
         end as key,
         sum(g.credits_charged) as credits,
         count(*)::integer as runs
    from generations g
    left join nodes n on n.id = g.node_id
   where g.org_id = p_org_id
     and g.credits_charged is not null
     and g.credits_charged > 0
     and g.created_at >= p_from
     and g.created_at < p_to
   group by 1
   order by 2 desc;
$$;

revoke all on function org_credit_usage_by(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function org_credit_usage_by(uuid, timestamptz, timestamptz, text) to service_role;

notify pgrst, 'reload schema';
