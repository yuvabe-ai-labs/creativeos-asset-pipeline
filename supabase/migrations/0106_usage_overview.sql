-- The owner's Usage page (D597): everything the page shows about credits used in a period, in one
-- read, and one group's runs a page at a time. Read-only; service role only.
--
-- Both read the credit ledger's consumption rows (credit_transactions, written at settlement by
-- settle_credits), not generations.credits_charged. The ledger keeps a run's charge when its node,
-- canvas, avatar or script is deleted (0028: generation_id is set null, the generation row goes);
-- generations does not, so a sum over generations comes out lower than what was really used. Every
-- number on the page comes from these rows, so the totals, the chart and each breakdown add up.
-- A charge whose run was deleted has no kind, model, member, client or canvas: it comes back with
-- `removed` true and a null key in every section.
--
-- Periods are passed in (India-time months from src/lib/billing/usage-period.ts). Days are India
-- days. The pace is the last 7 days and the 7 before them, counted back from now.

-- Rows of org_usage_overview, by section:
--   'day'      key = YYYY-MM-DD (India), detail = generations.type
--   'model'    key = generations.model_used, detail = its run type
--   'member'   key = user_id, name = profiles.display_name
--   'client'   key = client_id, name = clients.name
--   'canvas'   key = canvas_id, name = canvases.name, detail = its client's name
--   'previous' key null: the period before (p_prev_from to p_from), in all
--   'pace'     key 'last7' or 'prev7'
create or replace function org_usage_overview(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz
) returns table (section text, key text, name text, detail text, removed boolean, credits numeric, runs integer)
language sql
stable
security definer
set search_path = public
as $$
  with spent as (
    select t.created_at,
           t.amount,
           t.generation_id is null as removed,
           g.type,
           g.model_used,
           g.user_id,
           g.client_id,
           n.canvas_id
      from credit_transactions t
      left join generations g on g.id = t.generation_id
      left join nodes n on n.id = g.node_id
     where t.org_id = p_org_id
       and t.type = 'consumption'
       and t.amount > 0
       and t.created_at >= least(p_prev_from, now() - interval '14 days')
       and t.created_at < greatest(p_to, now())
  ),
  period as (
    select * from spent where created_at >= p_from and created_at < p_to
  )
  select 'day', to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), null::text, type, removed,
         sum(amount), count(*)::integer
    from period
   group by 2, 4, 5
  union all
  select 'model', model_used, null::text, max(type), removed, sum(amount), count(*)::integer
    from period
   group by model_used, removed
  union all
  select 'member', s.user_id::text, p.display_name, null::text, s.removed, sum(s.amount), count(*)::integer
    from period s
    left join profiles p on p.user_id = s.user_id
   group by s.user_id, p.display_name, s.removed
  union all
  select 'client', s.client_id::text, c.name, null::text, s.removed, sum(s.amount), count(*)::integer
    from period s
    left join clients c on c.id = s.client_id
   group by s.client_id, c.name, s.removed
  union all
  select 'canvas', s.canvas_id::text, cv.name, cl.name, s.removed, sum(s.amount), count(*)::integer
    from period s
    left join canvases cv on cv.id = s.canvas_id
    left join clients cl on cl.id = cv.client_id
   group by s.canvas_id, cv.name, cl.name, s.removed
  union all
  select 'previous', null::text, null::text, null::text, false, coalesce(sum(amount), 0), count(*)::integer
    from spent
   where created_at >= p_prev_from and created_at < p_from
  union all
  select 'pace', case when created_at >= now() - interval '7 days' then 'last7' else 'prev7' end,
         null::text, null::text, false, sum(amount), count(*)::integer
    from spent
   where created_at >= now() - interval '14 days' and created_at < now()
   group by 2;
$$;

revoke all on function org_usage_overview(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function org_usage_overview(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- One group's charged runs in the period, newest first, with who made each and where, and the
-- group's run count on every row. p_by is member, client, canvas or model (p_key its id, null for
-- the runs with none) or kind (p_types the run types of that kind). Deleted runs can't be listed:
-- nothing is left to show about them.
create or replace function org_usage_runs(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_by text,
  p_key text,
  p_types text[],
  p_offset integer,
  p_limit integer
) returns table (
  id uuid,
  type text,
  model text,
  credits numeric,
  created_at timestamptz,
  member_name text,
  client_name text,
  canvas_name text,
  total integer
)
language sql
stable
security definer
set search_path = public
as $$
  with picked as (
    select g.id, g.type, g.model_used, t.amount, t.created_at, g.user_id, g.client_id, n.canvas_id
      from credit_transactions t
      join generations g on g.id = t.generation_id
      left join nodes n on n.id = g.node_id
     where t.org_id = p_org_id
       and t.type = 'consumption'
       and t.amount > 0
       and t.created_at >= p_from
       and t.created_at < p_to
       and case p_by
             when 'member' then g.user_id::text is not distinct from p_key
             when 'client' then g.client_id::text is not distinct from p_key
             when 'canvas' then n.canvas_id::text is not distinct from p_key
             when 'model' then g.model_used is not distinct from p_key
             when 'kind' then g.type = any(p_types)
             else false
           end
  )
  select r.id, r.type, r.model_used, r.amount, r.created_at, pr.display_name, c.name, cv.name,
         (count(*) over ())::integer
    from picked r
    left join profiles pr on pr.user_id = r.user_id
    left join clients c on c.id = r.client_id
    left join canvases cv on cv.id = r.canvas_id
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

revoke all on function org_usage_runs(uuid, timestamptz, timestamptz, text, text, text[], integer, integer) from public, anon, authenticated;
grant execute on function org_usage_runs(uuid, timestamptz, timestamptz, text, text, text[], integer, integer) to service_role;

notify pgrst, 'reload schema';
